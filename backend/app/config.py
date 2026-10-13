import os
from pathlib import Path

from pydantic_settings import BaseSettings


BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    app_name: str = "VoiceScribe"

    database_url: str = f"sqlite:///{(BASE_DIR / 'storage' / 'voicescribe.db').as_posix()}"

    secret_key: str = "change-this-secret-key-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    storage_dir: Path = BASE_DIR / "storage"
    audio_dir: Path = BASE_DIR / "storage" / "audio"
    export_dir: Path = BASE_DIR / "storage" / "exports"

    whisper_model_size: str = os.getenv("WHISPER_MODEL_SIZE", "base")
    whisper_device: str = os.getenv("WHISPER_DEVICE", "cpu")
    whisper_compute_type: str = os.getenv("WHISPER_COMPUTE_TYPE", "int8")

    max_upload_mb: int = 100
    # Audio + video containers; video is demuxed to audio by FFmpeg same as any other input.
    allowed_extensions: set[str] = {
        ".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac", ".webm", ".mp4", ".mov",
    }
    # Files longer than this are processed in sequential chunks to keep memory bounded.
    chunk_threshold_minutes: int = 15
    chunk_size_minutes: int = 10
    # 0 disables the cap.
    max_duration_minutes: int = 180

    cors_origins: list[str] = ["*"]

    # ---- AI features (Anthropic Claude) ----
    # Leave blank to disable summarizer/meeting-notes/ask/rewrite endpoints
    # (they respond 503 with a clear "not configured" message instead of failing oddly).
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    anthropic_model: str = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")

    # ---- Google sign-in (stub until real credentials are supplied) ----
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    google_redirect_uri: str = os.getenv("GOOGLE_REDIRECT_URI", "")

    # Comma-separated list of emails that are granted admin rights on register/login.
    admin_emails: set[str] = {
        e.strip().lower()
        for e in os.getenv("ADMIN_EMAILS", "").split(",")
        if e.strip()
    }

    # ---- Rate limiting ----
    rate_limit_auth: str = "10/minute"
    rate_limit_transcribe: str = "20/minute"
    rate_limit_ai: str = "30/minute"

    # ---- Free-tier usage limits (minutes of audio processed per rolling 30 days) ----
    free_tier_minutes_per_month: int = 120

    class Config:
        env_file = ".env"
        env_prefix = "VOICESCRIBE_"
        arbitrary_types_allowed = True


settings = Settings()

settings.storage_dir.mkdir(parents=True, exist_ok=True)
settings.audio_dir.mkdir(parents=True, exist_ok=True)
settings.export_dir.mkdir(parents=True, exist_ok=True)
