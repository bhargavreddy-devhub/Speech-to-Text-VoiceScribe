import json
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models import Transcript, User
from ..schemas import TranscriptDetail, TranscriptMetaUpdate, TranscriptOut, TranscriptUpdate
from ..services.export_service import export_docx, export_md, export_pdf, export_srt, export_txt, export_vtt

router = APIRouter(prefix="/api/transcripts", tags=["history"])

_SORT_FIELDS = {
    "created_at": Transcript.created_at,
    "updated_at": Transcript.updated_at,
    "name": Transcript.original_name,
    "duration": Transcript.duration_seconds,
}


def _get_owned_transcript(db: Session, transcript_id: str, user: User) -> Transcript:
    transcript = (
        db.query(Transcript)
        .filter(Transcript.id == transcript_id, Transcript.user_id == user.id)
        .first()
    )
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    return transcript


def _to_out(transcript: Transcript) -> TranscriptOut:
    data = TranscriptOut.model_validate(transcript)
    data.tags = json.loads(transcript.tags_json or "[]")
    return data


@router.get("", response_model=list[TranscriptOut])
def list_transcripts(
    search: Optional[str] = Query(default=None),
    language: Optional[str] = Query(default=None),
    source: Optional[str] = Query(default=None),
    folder: Optional[str] = Query(default=None),
    favorite: Optional[bool] = Query(default=None),
    date_from: Optional[str] = Query(default=None, description="ISO date, inclusive"),
    date_to: Optional[str] = Query(default=None, description="ISO date, inclusive"),
    sort_by: str = Query(default="created_at"),
    sort_dir: str = Query(default="desc", pattern="^(asc|desc)$"),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Transcript).filter(Transcript.user_id == current_user.id)
    if search:
        like = f"%{search}%"
        query = query.filter(
            or_(Transcript.text.ilike(like), Transcript.original_name.ilike(like))
        )
    if language:
        query = query.filter(Transcript.language == language)
    if source:
        query = query.filter(Transcript.source == source)
    if folder:
        query = query.filter(Transcript.folder == folder)
    if favorite is not None:
        query = query.filter(Transcript.is_favorite == favorite)
    if date_from:
        query = query.filter(Transcript.created_at >= date_from)
    if date_to:
        query = query.filter(Transcript.created_at <= date_to)

    sort_col = _SORT_FIELDS.get(sort_by, Transcript.created_at)
    sort_col = sort_col.asc() if sort_dir == "asc" else sort_col.desc()

    rows = query.order_by(sort_col).offset(skip).limit(limit).all()
    return [_to_out(r) for r in rows]


@router.get("/folders", response_model=list[str])
def list_folders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = (
        db.query(Transcript.folder)
        .filter(Transcript.user_id == current_user.id, Transcript.folder.isnot(None))
        .distinct()
        .all()
    )
    return sorted({r[0] for r in rows if r[0]})


@router.get("/{transcript_id}", response_model=TranscriptDetail)
def get_transcript(
    transcript_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transcript = _get_owned_transcript(db, transcript_id, current_user)
    data = TranscriptDetail.model_validate(transcript)
    data.segments = json.loads(transcript.segments_json or "[]")
    data.speakers = json.loads(transcript.speakers_json or "[]")
    data.tags = json.loads(transcript.tags_json or "[]")
    return data


@router.get("/{transcript_id}/audio")
def get_transcript_audio(
    transcript_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transcript = _get_owned_transcript(db, transcript_id, current_user)
    if not transcript.audio_path or not Path(transcript.audio_path).exists():
        raise HTTPException(status_code=404, detail="Original audio is not available")
    return FileResponse(transcript.audio_path, filename=transcript.original_name)


@router.put("/{transcript_id}", response_model=TranscriptOut)
def update_transcript(
    transcript_id: str,
    payload: TranscriptUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transcript = _get_owned_transcript(db, transcript_id, current_user)
    transcript.text = payload.text
    db.commit()
    db.refresh(transcript)
    return _to_out(transcript)


@router.patch("/{transcript_id}", response_model=TranscriptOut)
def update_transcript_meta(
    transcript_id: str,
    payload: TranscriptMetaUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Rename, favorite/unfavorite, move to a folder, or set tags — independent of the text edit."""
    transcript = _get_owned_transcript(db, transcript_id, current_user)
    if payload.original_name is not None:
        transcript.original_name = payload.original_name
    if payload.is_favorite is not None:
        transcript.is_favorite = payload.is_favorite
    if payload.folder is not None:
        transcript.folder = payload.folder or None
    if payload.tags is not None:
        transcript.tags_json = json.dumps(payload.tags)
    db.commit()
    db.refresh(transcript)
    return _to_out(transcript)


@router.delete("/{transcript_id}", status_code=204)
def delete_transcript(
    transcript_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transcript = _get_owned_transcript(db, transcript_id, current_user)
    if transcript.audio_path:
        Path(transcript.audio_path).unlink(missing_ok=True)
    db.delete(transcript)
    db.commit()
    return Response(status_code=204)


_EXPORTERS = {
    "txt": (export_txt, "text/plain"),
    "srt": (export_srt, "application/x-subrip"),
    "vtt": (export_vtt, "text/vtt"),
    "md": (export_md, "text/markdown"),
    "pdf": (export_pdf, "application/pdf"),
    "docx": (export_docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
}


@router.get("/{transcript_id}/export")
def export_transcript(
    transcript_id: str,
    fmt: str = Query(default="txt", pattern="^(txt|pdf|srt|vtt|md|docx)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transcript = _get_owned_transcript(db, transcript_id, current_user)
    if transcript.status != "completed":
        raise HTTPException(status_code=400, detail="Transcript is not ready yet")

    base_name = Path(transcript.original_name).stem or "transcript"
    exporter, media_type = _EXPORTERS[fmt]
    content = exporter(transcript)

    filename = f"{base_name}.{fmt}"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
