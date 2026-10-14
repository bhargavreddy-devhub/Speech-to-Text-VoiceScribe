import subprocess
from pathlib import Path
from typing import Optional


class AudioProcessingError(RuntimeError):
    pass


def convert_to_wav(
    input_path: Path,
    output_path: Path,
    sample_rate: int = 16000,
    tail_seconds: Optional[float] = None,
) -> None:
    """Convert an arbitrary audio/video file to 16kHz mono WAV using FFmpeg.

    `tail_seconds`, when given, seeks to within that many seconds of EOF first
    so only the trailing window is decoded — used by the live-stream endpoint
    so each incremental re-transcription pass stays bounded to a fixed amount
    of audio instead of re-decoding an ever-growing recording.
    """
    output_path.parent.mkdir(parents=True, exist_ok=True)
    seek_args: list[str] = []
    if tail_seconds:
        # `-sseof` (seek relative to EOF) requires FFmpeg to know the input's
        # total duration up front, which it doesn't for a WebM whose Segment
        # size is still "unknown" — exactly what the browser's MediaRecorder
        # writes for a recording still in progress (ffmpeg logs "Cannot use
        # -sseof, file duration not known" and silently decodes from the
        # start instead). Compute the start offset ourselves and seek with
        # plain `-ss`, which works regardless. `tail_seconds` is only ever
        # passed for this still-growing live recording, so this probe must
        # never trust the container's self-reported duration field (it can
        # be stale/inconsistent with the bytes actually present) — always
        # measure from real packet timestamps instead.
        total_duration = get_duration_seconds(input_path, assume_unfinalized=True)
        start = max(0.0, total_duration - tail_seconds)
        if start > 0:
            seek_args = ["-ss", str(start)]
    cmd = [
        "ffmpeg",
        "-y",
        *seek_args,
        "-i", str(input_path),
        "-vn",  # drop any video stream — we only want audio (also used for mp4/mov uploads)
        "-ar", str(sample_rate),
        "-ac", "1",
        "-af", "afftdn,loudnorm=I=-16:TP=-1.5:LRA=11",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        # retry without the denoise/normalize filter chain in case it's unsupported
        fallback_cmd = [
            "ffmpeg", "-y", *seek_args, "-i", str(input_path), "-vn",
            "-ar", str(sample_rate), "-ac", "1", str(output_path),
        ]
        fallback = subprocess.run(fallback_cmd, capture_output=True, text=True)
        if fallback.returncode != 0:
            raise AudioProcessingError(
                f"FFmpeg failed to process audio: {fallback.stderr[-500:]}"
            )


def _last_packet_end_seconds(path: Path) -> float:
    """Cheap metadata-only demux (no audio decode) that measures duration from
    the last audio packet's own timestamp, rather than trusting the
    container's self-reported duration field."""
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "packet=pts_time,duration_time",
        "-of", "csv=p=0",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    last_end = 0.0
    for line in result.stdout.splitlines():
        parts = line.strip().split(",")
        if len(parts) < 2:
            continue
        try:
            pts_time, duration_time = float(parts[0]), float(parts[1])
        except ValueError:
            continue
        last_end = max(last_end, pts_time + duration_time)
    return last_end


def get_duration_seconds(path: Path, assume_unfinalized: bool = False) -> float:
    """Measure a media file's duration in seconds.

    `assume_unfinalized=True` (used for the live-stream endpoint's raw
    recording, which it overwrites every ~2s while still growing) skips
    straight to the packet-timestamp method below and never trusts the
    container's self-reported duration field. That field is normally unset
    for a WebM whose Segment size is "unknown" — exactly what the browser's
    MediaRecorder writes for a recording still in progress — in which case
    the container probe below already falls back to it. But a container that
    *does* carry a duration field can't be assumed to have one that matches
    the bytes actually present: ffmpeg/the recorder may embed a duration
    computed before the stream was truncated or is still being appended to,
    which silently desyncs the live merge logic's confirmed/tentative
    boundary from where the real audio edge is — the only symptom is already-
    spoken words quietly never making it into the transcript, so this isn't
    a corner worth cutting for the sake of one ffprobe call.
    """
    if assume_unfinalized:
        return _last_packet_end_seconds(path)

    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return float(result.stdout.strip())
    except (ValueError, AttributeError):
        pass

    return _last_packet_end_seconds(path)


def extract_chunk(
    wav_path: Path, output_path: Path, start_seconds: float, duration_seconds: float
) -> None:
    """Cut a [start, start+duration] slice out of an already-16k-mono WAV file."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(wav_path),
        "-ss", str(start_seconds),
        "-t", str(duration_seconds),
        "-c", "copy",
        str(output_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise AudioProcessingError(f"FFmpeg failed to chunk audio: {result.stderr[-500:]}")


def plan_chunks(total_duration: float, chunk_threshold_minutes: int, chunk_size_minutes: int):
    """Return a list of (start, duration) windows. Empty list means "process whole file"."""
    threshold = chunk_threshold_minutes * 60
    chunk_len = chunk_size_minutes * 60
    if total_duration <= threshold or chunk_len <= 0:
        return []
    windows = []
    start = 0.0
    while start < total_duration:
        windows.append((start, min(chunk_len, total_duration - start)))
        start += chunk_len
    return windows


def speaker_turns_from_segments(segments: list[dict], pause_threshold: float = 1.5) -> list[dict]:
    """Lightweight, voice-independent "diarization" approximation.

    This is NOT real speaker recognition — it has no idea what anyone sounds
    like. It just alternates a speaker label every time a pause longer than
    `pause_threshold` seconds appears between segments, which is a reasonable
    proxy for turn-taking in a two-person conversation. For genuine
    voice-based diarization, wire up pyannote.audio (needs a Hugging Face
    token and the pyannote model license accepted).
    """
    if not segments:
        return []

    turns: list[dict] = []
    current_speaker = 1
    current_start = segments[0]["start"]
    current_end = segments[0]["end"]
    prev_end = segments[0]["end"]

    for seg in segments[1:]:
        gap = seg["start"] - prev_end
        if gap >= pause_threshold:
            turns.append({"start": current_start, "end": current_end, "speaker": f"Speaker {current_speaker}"})
            current_speaker = 2 if current_speaker == 1 else 1
            current_start = seg["start"]
        current_end = seg["end"]
        prev_end = seg["end"]

    turns.append({"start": current_start, "end": current_end, "speaker": f"Speaker {current_speaker}"})
    return turns
