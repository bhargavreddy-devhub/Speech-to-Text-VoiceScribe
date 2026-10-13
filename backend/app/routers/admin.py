from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..database import get_db
from ..models import Transcript, User
from ..schemas import AdminStatsOut, AdminUserOut

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/stats", response_model=AdminStatsOut)
def stats(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    total_users = db.query(func.count(User.id)).scalar() or 0
    total_transcripts = db.query(func.count(Transcript.id)).scalar() or 0
    total_seconds = db.query(func.coalesce(func.sum(Transcript.duration_seconds), 0.0)).scalar() or 0.0

    def _count(status: str) -> int:
        return db.query(func.count(Transcript.id)).filter(Transcript.status == status).scalar() or 0

    return AdminStatsOut(
        total_users=total_users,
        total_transcripts=total_transcripts,
        total_minutes_processed=round(total_seconds / 60, 1),
        jobs_pending=_count("pending"),
        jobs_processing=_count("processing"),
        jobs_failed=_count("failed"),
        jobs_completed=_count("completed"),
    )


@router.get("/users", response_model=list[AdminUserOut])
def list_users(db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    users = db.query(User).order_by(User.created_at.desc()).all()
    out = []
    for user in users:
        count = db.query(func.count(Transcript.id)).filter(Transcript.user_id == user.id).scalar() or 0
        seconds = (
            db.query(func.coalesce(func.sum(Transcript.duration_seconds), 0.0))
            .filter(Transcript.user_id == user.id)
            .scalar()
            or 0.0
        )
        item = AdminUserOut.model_validate(user)
        item.transcript_count = count
        item.total_minutes = round(seconds / 60, 1)
        out.append(item)
    return out


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: str, db: Session = Depends(get_db), _admin: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if user:
        db.delete(user)
        db.commit()


@router.get("/jobs", response_model=list[dict])
def list_jobs(
    limit: int = 100,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    rows = (
        db.query(Transcript)
        .order_by(Transcript.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": t.id,
            "user_id": t.user_id,
            "original_name": t.original_name,
            "status": t.status,
            "error_message": t.error_message,
            "duration_seconds": t.duration_seconds,
            "created_at": t.created_at.isoformat(),
        }
        for t in rows
    ]
