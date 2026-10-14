import threading
import wave
from pathlib import Path
from typing import Optional

import numpy as np

from ..config import settings

_model = None
_model_lock = threading.Lock()


def _read_wav_as_float32(wav_path: Path) -> np.ndarray:
    """Read a 16-bit PCM WAV file into a normalized float32 array.

    Audio is already converted to 16kHz mono PCM WAV by our own FFmpeg
    preprocessing step, so we decode it directly instead of going through
    faster-whisper's bundled PyAV decoder (whose API has had breaking
    changes across versions).
    """
    with wave.open(str(wav_path), "rb") as wf:
        frames = wf.readframes(wf.getnframes())
        sample_width = wf.getsampwidth()

    if sample_width != 2:
        raise ValueError(f"Expected 16-bit PCM WAV, got sample width {sample_width}")

    return np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0


def get_model():
    """Lazily load the faster-whisper model (heavy, so load once on first use)."""
    global _model
    if _model is None:
        with _model_lock:
            if _model is None:
                from faster_whisper import WhisperModel

                _model = WhisperModel(
                    settings.whisper_model_size,
                    device=settings.whisper_device,
                    compute_type=settings.whisper_compute_type,
                )
    return _model


def transcribe_file(
    wav_path: Path,
    language: Optional[str] = None,
    beam_size: int = 5,
    initial_prompt: Optional[str] = None,
):
    """Run ASR on a preprocessed WAV file.

    `initial_prompt` seeds Whisper's decoder with prior context (e.g. the
    already-confirmed text from earlier in a live session) without that audio
    being re-transcribed. This is what keeps spelling/capitalization/style
    consistent and disambiguates homophones across windows in a sliding-window
    live session, where each pass otherwise has no memory of previous passes.

    Returns (full_text, segments, detected_language) where segments is a
    list of {start, end, text} dicts.
    """
    model = get_model()
    audio = _read_wav_as_float32(wav_path)
    segments_iter, info = model.transcribe(
        audio,
        language=language,
        vad_filter=True,
        beam_size=beam_size,
        initial_prompt=initial_prompt or None,
    )

    segments = []
    text_parts = []
    for seg in segments_iter:
        segments.append({
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
        })
        text_parts.append(seg.text.strip())

    full_text = " ".join(text_parts).strip()
    detected_language = info.language if info else language
    return full_text, segments, detected_language
