import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=True)  # null for Google-only accounts
    name = Column(String, nullable=True)
    created_at = Column(DateTime, default=_now)

    is_admin = Column(Boolean, default=False)
    preferred_language = Column(String, default="en")
    theme = Column(String, default="system")  # system|light|dark
    google_sub = Column(String, unique=True, nullable=True, index=True)

    transcripts = relationship(
        "Transcript", back_populates="owner", cascade="all, delete-orphan"
    )


class Transcript(Base):
    __tablename__ = "transcripts"

    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)

    original_name = Column(String, nullable=False)
    audio_path = Column(String, nullable=True)
    source = Column(String, default="upload")  # upload | live

    status = Column(String, default="pending")  # pending|processing|completed|failed|cancelled
    error_message = Column(Text, nullable=True)
    cancel_requested = Column(Boolean, default=False)
    retry_count = Column(Integer, default=0)

    language = Column(String, nullable=True)
    duration_seconds = Column(Float, nullable=True)

    text = Column(Text, default="")
    segments_json = Column(Text, default="[]")
    speakers_json = Column(Text, default="[]")

    translated_text = Column(Text, nullable=True)
    translated_language = Column(String, nullable=True)

    is_favorite = Column(Boolean, default=False)
    folder = Column(String, nullable=True)
    tags_json = Column(Text, default="[]")

    created_at = Column(DateTime, default=_now)
    updated_at = Column(DateTime, default=_now, onupdate=_now)

    owner = relationship("User", back_populates="transcripts")
