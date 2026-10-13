import json

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..config import settings
from ..database import get_db
from ..limiter import limiter
from ..models import Transcript, User
from ..schemas import (
    AskRequest,
    AskResponse,
    MeetingNotesOut,
    RewriteRequest,
    SpeakerAnalyticsOut,
    SummarizeRequest,
    TextResult,
)
from ..services import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


def _get_owned_transcript(db: Session, transcript_id: str, user: User) -> Transcript:
    transcript = (
        db.query(Transcript)
        .filter(Transcript.id == transcript_id, Transcript.user_id == user.id)
        .first()
    )
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not found")
    if transcript.status != "completed" or not transcript.text.strip():
        raise HTTPException(status_code=400, detail="Transcript has no text to work with yet")
    return transcript


def _handle_ai_errors(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except ai_service.AINotConfigured as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except ai_service.AIError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@router.post("/transcripts/{transcript_id}/summarize", response_model=TextResult)
@limiter.limit(settings.rate_limit_ai)
def summarize(
    request: Request,
    transcript_id: str,
    payload: SummarizeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transcript = _get_owned_transcript(db, transcript_id, current_user)
    result = _handle_ai_errors(ai_service.summarize, transcript.text, payload.mode)
    return TextResult(result=result)


@router.post("/transcripts/{transcript_id}/meeting-notes", response_model=MeetingNotesOut)
@limiter.limit(settings.rate_limit_ai)
def get_meeting_notes(
    request: Request,
    transcript_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transcript = _get_owned_transcript(db, transcript_id, current_user)
    notes = _handle_ai_errors(ai_service.meeting_notes, transcript.text)
    return MeetingNotesOut(
        summary=notes.get("summary", ""),
        decisions=notes.get("decisions", []) or [],
        action_items=notes.get("action_items", []) or [],
        key_points=notes.get("key_points", []) or [],
    )


@router.post("/transcripts/{transcript_id}/ask", response_model=AskResponse)
@limiter.limit(settings.rate_limit_ai)
def ask(
    request: Request,
    transcript_id: str,
    payload: AskRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transcript = _get_owned_transcript(db, transcript_id, current_user)
    answer = _handle_ai_errors(ai_service.ask_question, transcript.text, payload.question)
    return AskResponse(answer=answer)


@router.post("/transcripts/{transcript_id}/rewrite", response_model=TextResult)
@limiter.limit(settings.rate_limit_ai)
def rewrite(
    request: Request,
    transcript_id: str,
    payload: RewriteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transcript = _get_owned_transcript(db, transcript_id, current_user)
    result = _handle_ai_errors(ai_service.rewrite, transcript.text, payload.style)
    return TextResult(result=result)


@router.get("/transcripts/{transcript_id}/speaker-analytics", response_model=list[SpeakerAnalyticsOut])
def speaker_analytics(
    transcript_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transcript = _get_owned_transcript(db, transcript_id, current_user)
    turns = json.loads(transcript.speakers_json or "[]")
    if not turns:
        raise HTTPException(status_code=400, detail="No speaker data available for this transcript")

    stats: dict[str, dict] = {}
    for turn in turns:
        entry = stats.setdefault(turn["speaker"], {"speaking_seconds": 0.0, "turns": 0})
        entry["speaking_seconds"] += turn["end"] - turn["start"]
        entry["turns"] += 1

    return [
        SpeakerAnalyticsOut(speaker=speaker, speaking_seconds=round(data["speaking_seconds"], 1), turns=data["turns"])
        for speaker, data in sorted(stats.items())
    ]
