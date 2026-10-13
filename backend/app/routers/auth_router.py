import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ..auth import authenticate_user, create_access_token, get_current_user, get_password_hash
from ..config import settings
from ..database import get_db
from ..limiter import limiter
from ..models import User
from ..schemas import Token, UserCreate, UserOut, UserProfileUpdate

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _apply_admin_flag(user: User) -> None:
    if user.email.lower() in settings.admin_emails:
        user.is_admin = True


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.rate_limit_auth)
def register(request: Request, payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email,
        hashed_password=get_password_hash(payload.password),
        name=payload.name,
    )
    _apply_admin_flag(user)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
@limiter.limit(settings.rate_limit_auth)
def login(request: Request, form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = create_access_token(subject=user.id)
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UserProfileUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if payload.name is not None:
        current_user.name = payload.name
    if payload.preferred_language is not None:
        current_user.preferred_language = payload.preferred_language
    if payload.theme is not None:
        current_user.theme = payload.theme
    db.commit()
    db.refresh(current_user)
    return current_user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Delete the account and all owned transcripts (cascade)."""
    db.delete(current_user)
    db.commit()


# ---- Google sign-in (stub) ----
#
# Fully wiring this up requires a Google Cloud OAuth client: create one at
# https://console.cloud.google.com/apis/credentials, set its redirect URI to
# this server's /api/auth/google/callback, and put the client id/secret into
# backend/.env as VOICESCRIBE_GOOGLE_CLIENT_ID / VOICESCRIBE_GOOGLE_CLIENT_SECRET
# / VOICESCRIBE_GOOGLE_REDIRECT_URI. Until those are set, these routes return a
# clear "not configured" response instead of silently failing.

@router.get("/google/login")
def google_login():
    if not (settings.google_client_id and settings.google_redirect_uri):
        raise HTTPException(
            status_code=503,
            detail="Google sign-in isn't configured on this server yet. "
            "Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI in backend/.env.",
        )
    params = (
        "response_type=code"
        f"&client_id={settings.google_client_id}"
        f"&redirect_uri={settings.google_redirect_uri}"
        "&scope=openid%20email%20profile"
        "&prompt=select_account"
    )
    return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}")


@router.get("/google/callback")
def google_callback(request: Request, code: str = "", db: Session = Depends(get_db)):
    if not (settings.google_client_id and settings.google_client_secret):
        raise HTTPException(status_code=503, detail="Google sign-in isn't configured on this server yet.")

    import httpx

    token_res = httpx.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "redirect_uri": settings.google_redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=10,
    )
    if token_res.status_code != 200:
        raise HTTPException(status_code=400, detail="Google sign-in failed during token exchange")
    id_info = httpx.get(
        "https://www.googleapis.com/oauth2/v3/userinfo",
        headers={"Authorization": f"Bearer {token_res.json().get('access_token')}"},
        timeout=10,
    ).json()

    sub = id_info.get("sub")
    email = id_info.get("email")
    if not sub or not email:
        raise HTTPException(status_code=400, detail="Google did not return a usable profile")

    user = db.query(User).filter((User.google_sub == sub) | (User.email == email)).first()
    if not user:
        user = User(
            email=email,
            name=id_info.get("name"),
            hashed_password=get_password_hash(secrets.token_urlsafe(32)),  # unusable random password
            google_sub=sub,
        )
        _apply_admin_flag(user)
        db.add(user)
    elif not user.google_sub:
        user.google_sub = sub
    db.commit()
    db.refresh(user)

    token = create_access_token(subject=user.id)
    return RedirectResponse(url=f"/app/#/oauth-complete?token={token}")
