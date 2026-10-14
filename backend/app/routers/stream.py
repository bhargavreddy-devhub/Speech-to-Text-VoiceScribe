import json
import logging
import time
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..auth import get_user_from_ws_token
from ..config import settings
from ..database import SessionLocal
from ..models import Transcript
from ..services.audio_processing import AudioProcessingError, convert_to_wav, get_duration_seconds
from ..services.live_transcript import WINDOW_SECONDS, merge_segments, offset_segments, prompt_context
from ..services.whisper_service import transcribe_file

router = APIRouter(tags=["stream"])
logger = logging.getLogger(__name__)

# After this many consecutive failed passes, tell the client instead of
# silently going quiet — audio capture may still be fine even if ASR isn't.
MAX_CONSECUTIVE_FAILURES = 5


@router.websocket("/ws/stream")
async def stream_transcribe(websocket: WebSocket):
    token = websocket.query_params.get("token")
    language = websocket.query_params.get("language") or None

    db = SessionLocal()
    user = get_user_from_ws_token(token, db) if token else None
    if not user:
        await websocket.close(code=4401)
        db.close()
        return

    await websocket.accept()

    session_id = uuid.uuid4().hex
    raw_path = settings.audio_dir / f"live_{session_id}.webm"
    wav_path = settings.audio_dir / f"live_{session_id}.wav"

    # Confirmed text is appended-only and never re-sent differently once
    # locked in; only the short trailing "tentative" tail is re-transcribed
    # and may change between updates.
    confirmed_text = ""
    confirmed_until = 0.0
    confirmed_segments: list[dict] = []
    consecutive_failures = 0
    stop_requested_at: float | None = None
    last_detected_lang = language

    try:
        while True:
            message = await websocket.receive()

            if "bytes" in message and message["bytes"] is not None:
                # Client sends the full growing recording blob each interval
                # (valid container from the start), so we simply overwrite.
                raw_path.write_bytes(message["bytes"])

                # Cheap format probe on the raw container — avoids a full
                # ffmpeg transcode of the whole recording just to learn its
                # length, and doubles as an "enough data yet?" gate.
                # assume_unfinalized=True: this file is still being appended
                # to, so its container-level duration field (if any) can't be
                # trusted to match the bytes actually present — a stale value
                # here desyncs confirmed_until from the real audio edge and
                # permanently drops real speech from merge_segments.
                duration = get_duration_seconds(raw_path, assume_unfinalized=True)
                if duration <= 0:
                    continue

                window_start = max(0.0, duration - WINDOW_SECONDS)

                try:
                    # Only the trailing window is decoded, so transcription
                    # cost stays bounded no matter how long the session runs.
                    convert_to_wav(
                        raw_path, wav_path,
                        tail_seconds=WINDOW_SECONDS if window_start > 0 else None,
                    )
                    # beam_size=1 (greedy) keeps partial passes fast and
                    # deterministic for a given audio window. initial_prompt
                    # gives the decoder the tail of what's already confirmed,
                    # so it starts the window with context instead of cold —
                    # fewer boundary mistranscriptions and more consistent
                    # spelling/capitalization across passes.
                    _, segments, detected_lang = transcribe_file(
                        wav_path, language=language, beam_size=1,
                        initial_prompt=prompt_context(confirmed_text),
                    )
                    consecutive_failures = 0
                except AudioProcessingError:
                    consecutive_failures += 1
                    if consecutive_failures == MAX_CONSECUTIVE_FAILURES:
                        await websocket.send_json({
                            "type": "error",
                            "message": "Having trouble processing audio — still trying, your recording is not lost.",
                        })
                    continue

                # Segments come back relative to the tail wav's own start;
                # measure its actual duration (ffmpeg's seek is approximate)
                # to offset them onto the recording's absolute timeline.
                window_duration = get_duration_seconds(wav_path)
                offset = max(0.0, duration - window_duration)
                abs_segments = offset_segments(segments, offset)

                result = merge_segments(
                    abs_segments, confirmed_text, confirmed_until, duration, confirmed_segments
                )
                confirmed_text = result.confirmed_text
                confirmed_until = result.confirmed_until
                confirmed_segments = result.confirmed_segments
                last_detected_lang = detected_lang

                await websocket.send_json({
                    "type": "partial",
                    "text": confirmed_text,
                    "tentative": result.tentative_text,
                    "language": detected_lang,
                })

            elif "text" in message and message["text"] is not None:
                payload = json.loads(message["text"])
                if payload.get("action") == "stop":
                    stop_requested_at = time.monotonic()
                    break

    except WebSocketDisconnect:
        pass
    finally:
        t_stop = stop_requested_at if stop_requested_at is not None else time.monotonic()
        # Live passes have already transcribed everything up to
        # `confirmed_until` (in bounded WINDOW_SECONDS windows, greedily, as
        # audio arrived) — redoing that work here with a full re-decode +
        # full-beam re-transcription of the entire recording is exactly the
        # "second transcription pass over the same audio" that made Stop feel
        # slow on anything but a very short recording. Instead, only the
        # still-unconfirmed tail (at most ~WINDOW_SECONDS + CONFIRM_LAG_SECONDS
        # of audio, regardless of total recording length) is decoded and
        # transcribed now, then merged onto the already-confirmed prefix.
        final_text, final_segments, final_lang = confirmed_text, confirmed_segments, last_detected_lang
        duration = confirmed_until
        if raw_path.exists():
            try:
                # Same reasoning as the live-loop probe above: this is still
                # the raw, never-finalized recording file.
                total_duration = get_duration_seconds(raw_path, assume_unfinalized=True)
                remaining = max(0.0, total_duration - confirmed_until)
                t_audio_done = time.monotonic()

                if remaining > 0.1:
                    # confirmed_until == 0 means no partial pass ever
                    # confirmed anything (e.g. a very short recording, or
                    # every partial pass failed) — fall back to decoding the
                    # whole (small) file rather than guessing a tail window.
                    tail_seconds = remaining if confirmed_until > 0 else None
                    convert_to_wav(raw_path, wav_path, tail_seconds=tail_seconds)
                    window_duration = get_duration_seconds(wav_path)
                    offset = max(0.0, total_duration - window_duration)
                    t_audio_done = time.monotonic()

                    _, tail_segments, final_lang = transcribe_file(
                        wav_path, language=language,
                        initial_prompt=prompt_context(confirmed_text),
                    )
                    abs_tail_segments = offset_segments(tail_segments, offset)

                    # confirm_lag_seconds=0: nothing more is coming, so flush
                    # every pending segment into "confirmed" instead of
                    # holding the trailing bit back as tentative.
                    result = merge_segments(
                        abs_tail_segments, confirmed_text, confirmed_until, total_duration,
                        confirmed_segments, confirm_lag_seconds=0.0,
                    )
                    final_text = result.confirmed_text
                    final_segments = result.confirmed_segments

                t_recognition_done = time.monotonic()
                duration = total_duration
                logger.info(
                    "live stream %s finalized: stop->audio_ready=%.3fs audio_ready->recognized=%.3fs "
                    "total=%.3fs tail_seconds=%s",
                    session_id, t_audio_done - t_stop, t_recognition_done - t_audio_done,
                    t_recognition_done - t_stop, f"{remaining:.2f}" if remaining > 0.1 else "0 (skipped)",
                )
            except AudioProcessingError:
                # Finalization of the tail failed, but the live passes'
                # confirmed text/segments (already set above) are real
                # transcription results and must not be thrown away. The raw
                # recording's own duration is still valid even though the
                # tail re-transcription that would have extended it failed.
                duration = total_duration
                logger.warning("live stream %s: tail finalization failed, keeping confirmed-only text", session_id)

            transcript = Transcript(
                user_id=user.id,
                original_name=f"Live recording {session_id[:8]}",
                audio_path=str(raw_path),
                source="live",
                status="completed" if final_text else "failed",
                language=final_lang,
                duration_seconds=duration,
                text=final_text,
                segments_json=json.dumps(final_segments),
            )
            db.add(transcript)
            db.commit()
            db.refresh(transcript)

            try:
                await websocket.send_json({
                    "type": "final",
                    "transcript_id": transcript.id,
                    "text": final_text,
                    "language": final_lang,
                })
            except RuntimeError:
                pass  # socket already closed client-side

            wav_path.unlink(missing_ok=True)

        db.close()
        try:
            await websocket.close()
        except RuntimeError:
            pass
