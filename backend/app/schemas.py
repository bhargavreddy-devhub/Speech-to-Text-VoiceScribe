from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


# ---- Auth ----

class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    name: Optional[str] = None


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: Optional[str] = None
    created_at: datetime
    is_admin: bool = False
    preferred_language: str = "en"
    theme: str = "system"

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    preferred_language: Optional[str] = None
    theme: Optional[str] = Field(default=None, pattern="^(system|light|dark)$")


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---- Transcripts ----

class SegmentOut(BaseModel):
    start: float
    end: float
    text: str


class SpeakerSegmentOut(BaseModel):
    start: float
    end: float
    speaker: str


class TranscriptOut(BaseModel):
    id: str
    original_name: str
    source: str
    status: str
    error_message: Optional[str] = None
    language: Optional[str] = None
    duration_seconds: Optional[float] = None
    text: str
    translated_text: Optional[str] = None
    translated_language: Optional[str] = None
    is_favorite: bool = False
    folder: Optional[str] = None
    tags: list[str] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TranscriptDetail(TranscriptOut):
    segments: list[SegmentOut] = []
    speakers: list[SpeakerSegmentOut] = []


class TranscriptUpdate(BaseModel):
    text: str


class TranscriptMetaUpdate(BaseModel):
    original_name: Optional[str] = None
    is_favorite: Optional[bool] = None
    folder: Optional[str] = None
    tags: Optional[list[str]] = None


# ---- AI features ----

class SummarizeRequest(BaseModel):
    mode: str = Field(default="short", pattern="^(short|detailed|bullet)$")


class MeetingNotesOut(BaseModel):
    summary: str
    decisions: list[str] = []
    action_items: list[str] = []
    key_points: list[str] = []


class AskRequest(BaseModel):
    question: str = Field(min_length=1, max_length=2000)


class AskResponse(BaseModel):
    answer: str


class RewriteRequest(BaseModel):
    style: str = Field(default="formal", pattern="^(formal|simple|grammar)$")


class TextResult(BaseModel):
    result: str


class SpeakerAnalyticsOut(BaseModel):
    speaker: str
    speaking_seconds: float
    turns: int


# ---- Admin ----

class AdminUserOut(BaseModel):
    id: str
    email: EmailStr
    name: Optional[str] = None
    is_admin: bool
    created_at: datetime
    transcript_count: int = 0
    total_minutes: float = 0.0

    class Config:
        from_attributes = True


class AdminStatsOut(BaseModel):
    total_users: int
    total_transcripts: int
    total_minutes_processed: float
    jobs_pending: int
    jobs_processing: int
    jobs_failed: int
    jobs_completed: int
