import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from .config import settings
from .database import Base, engine, run_migrations
from .limiter import limiter
from .routers import admin, ai, auth_router, history, stream, transcribe

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

FRONTEND_DIR = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

run_migrations()
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="VoiceScribe API",
    description="Speech-to-text web application backend (FastAPI + Whisper)",
    version="1.1.0",
)

app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Too many requests — please slow down and try again shortly."},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(transcribe.router)
app.include_router(history.router)
app.include_router(stream.router)
app.include_router(ai.router)
app.include_router(admin.router)


@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/app/")


@app.get("/api/health", tags=["health"])
def health():
    return {
        "status": "ok",
        "app": settings.app_name,
        "ai_enabled": bool(settings.anthropic_api_key),
        "google_signin_configured": bool(settings.google_client_id and settings.google_client_secret),
    }


if FRONTEND_DIR.exists():
    app.mount("/app", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
