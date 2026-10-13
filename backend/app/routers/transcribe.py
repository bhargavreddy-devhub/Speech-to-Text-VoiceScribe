import json
import uuid
from pathlib import Path
from typing import Optional

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..config import settings
from ..database import SessionLocal, get_db
from ..limiter import limiter
from ..models import Transcript, User
from ..schemas import TranscriptOut
from ..services.audio_processing import (
    AudioProcessingError,
    convert_to_wav,
    extract_chunk,
    get_duration_seconds,
    plan_chunks,
    speaker_turns_from_segments,
)
from ..services.translation_service import TARGET_LOCALE_MAP, TranslationError, translate_text
from ..services.whisper_service import transcribe_file

router = APIRouter(prefix="/api/transcribe", tags=["transcribe"])


def _validate_upload(upload: UploadFile) -> str:
    ext = Path(upload.filename or "").suffix.lower()
    if ext not in settings.allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed: {sorted(settings.allowed_extensions)}",
        )
    return ext


def _run_transcription(wav_path: Path, duration: float, language: Optional[str]):
    """Transcribe a WAV file, automatically chunking very long files so memory
    stays bounded, and merging the resulting segments back with correct
    absolute timestamps."""
    windows = plan_chunks(duration, settings.chunk_threshold_minutes, settings.chunk_size_minutes)
    if not windows:
        return transcribe_file(wav_path, language=language)

    all_segments = []
    text_parts = []
    detected_lang = language
    for idx, (start, dur) in enumerate(windows):
        chunk_path = wav_path.with_name(f"{wav_path.stem}.chunk{idx}.wav")
        try:
            extract_chunk(wav_path, chunk_path, start, dur)
            chunk_text, chunk_segments, chunk_lang = transcribe_file(chunk_path, language=language)
            detected_lang = detected_lang or chunk_lang
            for seg in chunk_segments:
                seg["start"] = round(seg["start"] + start, 2)
                seg["end"] = round(seg["end"] + start, 2)
            all_segments.extend(chunk_segments)
            if chunk_text:
                text_parts.append(chunk_text)
        finally:
            chunk_path.unlink(missing_ok=True)

    return " ".join(text_parts).strip(), all_segments, detected_lang


def process_transcription(transcript_id: str, raw_path: Path, translate_to: Optional[str]) -> None:
    """Runs in a background task so the request can return immediately."""
    db = SessionLocal()
    try:
        transcript = db.query(Transcript).filter(Transcript.id == transcript_id).first()
        if not transcript:
            return
        transcript.status = "processing"
        db.commit()

        wav_path = raw_path.with_suffix(".proc.wav")
        try:
            convert_to_wav(raw_path, wav_path)
            duration = get_duration_seconds(wav_path)

            if settings.max_duration_minutes and duration > settings.max_duration_minutes * 60:
                transcript.status = "failed"
                transcript.error_message = (
                    f"Audio is {duration / 60:.1f} min, which exceeds the "
                    f"{settings.max_duration_minutes}-minute limit."
                )
                db.commit()
                return

            db.refresh(transcript)
            if transcript.cancel_requested:
                transcript.status = "cancelled"
                db.commit()
                return

            text, segments, detected_lang = _run_transcription(wav_path, duration, language=None)

            db.refresh(transcript)
            if transcript.cancel_requested:
                transcript.status = "cancelled"
                db.commit()
                return

            transcript.text = text
            transcript.segments_json = json.dumps(segments)
            transcript.speakers_json = json.dumps(speaker_turns_from_segments(segments))
            transcript.language = detected_lang
            transcript.duration_seconds = duration
            transcript.status = "completed"
            transcript.error_message = None

            if translate_to and translate_to != detected_lang and text.strip():
                try:
                    transcript.translated_text = translate_text(text, translate_to, source_code=detected_lang)
                    transcript.translated_language = translate_to
                except TranslationError as exc:
                    transcript.translated_text = None
                    transcript.translated_language = None
                    transcript.error_message = f"Translation failed: {exc}"
        except AudioProcessingError as exc:
            transcript.status = "failed"
            transcript.error_message = str(exc)
        except Exception as exc:  # noqa: BLE001 - surface any ASR failure to the user
            transcript.status = "failed"
            transcript.error_message = f"Transcription failed: {exc}"
        finally:
            wav_path.unlink(missing_ok=True)

        db.commit()
    finally:
        db.close()


def _create_pending_transcript(db: Session, user: User, filename: str, raw_path: Path) -> Transcript:
    transcript = Transcript(
        user_id=user.id,
        original_name=filename,
        audio_path=str(raw_path),
        source="upload",
        status="pending",
    )
    db.add(transcript)
    db.commit()
    db.refresh(transcript)
    return transcript


async def _save_upload(file: UploadFile) -> tuple[Path, str]:
    ext = _validate_upload(file)
    contents = await file.read()
    size_mb = len(contents) / (1024 * 1024)
    if size_mb > settings.max_upload_mb:
        raise HTTPException(
            status_code=413,
            detail=f"File is {size_mb:.1f} MB, which exceeds the {settings.max_upload_mb} MB limit.",
        )
    stored_name = f"{uuid.uuid4()}{ext}"
    raw_path = settings.audio_dir / stored_name
    raw_path.write_bytes(contents)
    return raw_path, (file.filename or stored_name)


@router.post("", response_model=TranscriptOut, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit(settings.rate_limit_transcribe)
async def transcribe_upload(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    translate_to: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if translate_to and translate_to not in TARGET_LOCALE_MAP:
        raise HTTPException(status_code=400, detail=f"Unsupported translation target '{translate_to}'")

    raw_path, original_name = await _save_upload(file)
    transcript = _create_pending_transcript(db, current_user, original_name, raw_path)

    background_tasks.add_task(process_transcription, transcript.id, raw_path, translate_to or None)
    return transcript


@router.post("/batch", response_model=list[TranscriptOut], status_code=status.HTTP_202_ACCEPTED)
@limiter.limit(settings.rate_limit_transcribe)
async def transcribe_batch(
    request: Request,
    background_tasks: BackgroundTasks,
    files: list[UploadFile] = File(...),
    translate_to: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if translate_to and translate_to not in TARGET_LOCALE_MAP:
        raise HTTPException(status_code=400, detail=f"Unsupported translation target '{translate_to}'")
    if len(files) > 20:
        raise HTTPException(status_code=400, detail="Batch uploads are limited to 20 files at a time")

    created: list[Transcript] = []
    for file in files:
        raw_path, original_name = await _save_upload(file)
        transcript = _create_pending_transcript(db, current_user, original_name, raw_path)
        background_tasks.add_task(process_transcription, transcript.id, raw_path, translate_to or None)
        created.append(transcript)
    return created


def _get_owned_transcript(db: Session, transcript_id: str, user: User) -> Transcript:
    transcript = (
        db.query(Transcript)
        .filter(Transcript.id == transcript_id, Transcript.user_id == user.id)
        .first()
    )
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    return transcript


@router.post("/{transcript_id}/cancel", response_model=TranscriptOut)
def cancel_transcription(
    transcript_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Best-effort cancel: pending jobs never start; a job already mid-flight
    is flagged and stops at its next checkpoint (chunk boundary) rather than
    being killed mid-decode."""
    transcript = _get_owned_transcript(db, transcript_id, current_user)
    if transcript.status not in ("pending", "processing"):
        raise HTTPException(status_code=400, detail=f"Cannot cancel a job that is already {transcript.status}")
    transcript.cancel_requested = True
    if transcript.status == "pending":
        transcript.status = "cancelled"
    db.commit()
    db.refresh(transcript)
    return transcript


@router.post("/{transcript_id}/retry", response_model=TranscriptOut, status_code=status.HTTP_202_ACCEPTED)
def retry_transcription(
    transcript_id: str,
    background_tasks: BackgroundTasks,
    translate_to: Optional[str] = Form(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transcript = _get_owned_transcript(db, transcript_id, current_user)
    if transcript.status not in ("failed", "cancelled"):
        raise HTTPException(status_code=400, detail="Only failed or cancelled jobs can be retried")
    if not transcript.audio_path or not Path(transcript.audio_path).exists():
        raise HTTPException(status_code=400, detail="Original audio file is no longer available")

    transcript.status = "pending"
    transcript.cancel_requested = False
    transcript.error_message = None
    transcript.retry_count = (transcript.retry_count or 0) + 1
    db.commit()
    db.refresh(transcript)

    raw_path = Path(transcript.audio_path)
    background_tasks.add_task(process_transcription, transcript.id, raw_path, translate_to or None)
    return transcript
