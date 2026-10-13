"""Pure merge logic for the live-transcription WebSocket stream.

Kept separate from `routers/stream.py` (which owns the websocket/ffmpeg/model
plumbing) so the confirm/tentative merge rules — the part most prone to
duplicate or dropped words — can be unit tested without a websocket, ffmpeg,
or a loaded Whisper model.
"""

from dataclasses import dataclass

# How many seconds of trailing audio to keep "tentative" (re-transcribed and
# shown, but not yet locked in). Whisper can still revise wording near the
# end of the window as more audio arrives, so only text older than this is
# frozen into the confirmed transcript.
CONFIRM_LAG_SECONDS = 2.0

# How much trailing audio each incremental pass re-transcribes. Bounding this
# (instead of re-transcribing the whole growing recording every pass) keeps
# per-chunk latency roughly constant regardless of how long the session has
# been running.
WINDOW_SECONDS = 20.0


@dataclass
class MergeResult:
    confirmed_text: str
    confirmed_until: float
    tentative_text: str
    confirmed_segments: list[dict]


def merge_segments(
    segments: list[dict],
    confirmed_text: str,
    confirmed_until: float,
    duration: float,
    confirmed_segments: list[dict] | None = None,
    confirm_lag_seconds: float = CONFIRM_LAG_SECONDS,
) -> MergeResult:
    """Fold one ASR pass's segments into the running confirmed/tentative transcript.

    `segments` are absolute-timeline {start, end, text} dicts (offset-adjusted
    by the caller if they came from a trailing window rather than the full
    recording). A segment is locked into `confirmed_text` only once it ends
    at least `confirm_lag_seconds` before the current audio edge *and* starts
    at or after the existing confirmed boundary — the first condition gives
    Whisper room to still revise it, the second prevents a segment that
    straddles the boundary differently across passes from duplicating words
    already confirmed. Confirmed text is never rewritten, only appended to.

    `confirmed_segments` carries forward the individual segments locked in by
    earlier passes (not just their joined text), so a caller finalizing the
    session can assemble a complete segment list without ever re-transcribing
    already-confirmed audio. Pass `confirm_lag_seconds=0` to flush every
    pending segment regardless of how close it is to the audio edge — used
    for the final pass once no more audio is coming.
    """
    confirmed_segments = list(confirmed_segments) if confirmed_segments else []
    safe_boundary = max(0.0, duration - confirm_lag_seconds)

    newly_confirmed = sorted(
        (
            seg for seg in segments
            if seg["end"] <= safe_boundary and seg["start"] >= confirmed_until - 1e-6
        ),
        key=lambda seg: seg["start"],
    )

    if newly_confirmed:
        pieces = [seg["text"].strip() for seg in newly_confirmed if seg["text"].strip()]
        if pieces:
            confirmed_text = (confirmed_text + " " + " ".join(pieces)).strip()
        confirmed_segments.extend(newly_confirmed)
        confirmed_until = max(confirmed_until, max(seg["end"] for seg in newly_confirmed))

    tentative_text = " ".join(
        seg["text"].strip() for seg in segments
        if seg["end"] > safe_boundary and seg["text"].strip()
    ).strip()

    return MergeResult(
        confirmed_text=confirmed_text,
        confirmed_until=confirmed_until,
        tentative_text=tentative_text,
        confirmed_segments=confirmed_segments,
    )


def offset_segments(segments: list[dict], offset: float) -> list[dict]:
    """Shift relative {start, end, text} segments (e.g. from a trailing-window
    transcription that starts at local time 0) onto the recording's absolute
    timeline."""
    if not offset:
        return segments
    return [
        {"start": seg["start"] + offset, "end": seg["end"] + offset, "text": seg["text"]}
        for seg in segments
    ]
