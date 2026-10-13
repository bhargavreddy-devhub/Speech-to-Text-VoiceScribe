# VoiceScribe — Speech-to-Text Web Application

Full-stack speech-to-text app built with **FastAPI** + **faster-whisper** (Whisper ASR), JWT auth,
SQLAlchemy, WebSocket live transcription, an AI tools layer (Anthropic Claude), and a **React +
TypeScript** (Vite) frontend.

## Features

- **Live transcription**: start/pause/resume/stop recording, interim + final text, duration, a
  noise-level meter, mic-permission error recovery, and a `Ctrl+Shift+R` shortcut.
- **File transcription**: WAV/MP3/M4A/AAC/OGG/FLAC/WebM audio and MP4/MOV video, drag-and-drop,
  batch upload, upload progress bar, size/duration validation, automatic chunking of long files,
  and background processing with cancel/retry.
- **30+ languages**, auto-detection, and optional translation of the transcript.
- **Transcript editor**: undo/redo, find & replace, autosave with a last-saved indicator,
  per-segment timestamps that jump the audio player, and lightweight pause-based speaker-turn
  labeling ("Speaker 1 / Speaker 2" — an approximation, not real voice diarization).
- **Export**: TXT, Markdown, SRT, VTT, DOCX, PDF.
- **Organization**: favorites, folders, tags, search, filter (language/source/folder/date), sort.
- **AI tools** (Anthropic Claude, optional): summarize (short/detailed/bullet), meeting notes &
  action items, ask-a-question, rewrite (formal/simple/grammar), speaker analytics.
- **Multi-page app** (client-side routed with React Router): Home, Dashboard, Workspace, History,
  Profile & Settings, Pricing (UI only — no payment processor wired up), Help/FAQ, Admin dashboard
  (for admin users).
- **Accounts**: email/password auth, optional Google sign-in (needs your own OAuth credentials),
  profile settings, account deletion, rate limiting on auth/transcribe/AI endpoints.
- **Accessibility**: dark/light/system theme, high-contrast mode, adjustable font size, skip link,
  keyboard navigation, `aria-live` regions, responsive layout down to ~400px.
- Dockerized for easy deployment.

## Project layout

```
backend/
  app/
    main.py            FastAPI app, routing, rate limiting, static frontend mount
    config.py           settings (env-driven)
    database.py          SQLAlchemy engine/session + lightweight additive migrations
    limiter.py             shared slowapi Limiter instance
    models.py                User, Transcript ORM models
    schemas.py                 Pydantic request/response models
    auth.py                      JWT + password hashing + admin dependency
    routers/
      auth_router.py     register/login/me/profile/Google sign-in
      transcribe.py        upload/batch/cancel/retry -> background transcription
      history.py            list/filter/get/audio/update/delete/export transcripts
      stream.py              WebSocket live transcription
      ai.py                    summarize/meeting-notes/ask/rewrite/speaker-analytics
      admin.py                  admin-only stats/users/jobs
    services/
      audio_processing.py  FFmpeg conversion, duration, chunking, speaker-turn heuristic
      whisper_service.py   faster-whisper model wrapper
      live_transcript.py     incremental assembly of partial/final WebSocket segments
      translation_service.py translation via MyMemory
      export_service.py    TXT/MD/SRT/VTT/DOCX/PDF generation
      ai_service.py           Anthropic Claude wrapper
  tests/                 pytest suite
  requirements.txt
  Dockerfile
frontend/                React 19 + TypeScript, built with Vite
  index.html
  src/
    main.tsx                   entrypoint
    App.tsx                      router + providers setup
    routes/                        RequireAuth / RequireAdmin / RedirectIfAuthed guards
    pages/                           Home, Dashboard, Workspace, History, Profile/Auth,
                                     Pricing, Help, Admin, NotFound, OAuth-complete
    components/
      layout/                         TopBar, MainNav, Footer, UserMenu, A11yControls
      workspace/                        Dropzone, FileChipList, LiveRecorderPanel, NoiseMeter,
                                        UploadResultPanel
      history/                           HistoryFilters, HistoryItem, HistoryListRow
      detail/                             DetailModal, Editor, SegmentsList, AiPanel,
                                          OrganizePanel
      admin/                               UsersTable, JobsTable
      common/                               Badge, LangSelect, StatTile
    hooks/                     data fetching (TanStack Query) + live recording/WebSocket logic
    store/                     Zustand stores (auth, UI, accessibility)
    lib/                       API client, query client
    constants/, utils/, types.ts
  vite.config.ts            dev server + /api and /ws proxy to the backend
docker-compose.yml
```

## Running locally (without Docker)

Requirements: Python 3.10+, Node.js 20+, [FFmpeg](https://ffmpeg.org/download.html) on your PATH.

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
copy .env.example .env         # Windows, or `cp` on macOS/Linux — then edit SECRET_KEY

uvicorn app.main:app --reload --port 8000
```

The first transcription request will download the chosen Whisper model (default: `base`) via
faster-whisper/CTranslate2 — this requires an internet connection the first time only.

Run the backend test suite with `pytest` from the `backend` directory.

### Frontend

For day-to-day development, run the Vite dev server in a second terminal — it proxies `/api` and
`/ws` to the backend on port 8000 (see `frontend/vite.config.ts`) and hot-reloads on save:

```bash
cd frontend
npm install
npm run dev
```

Open the app at **http://localhost:5173**. The backend's interactive API docs are at
**http://localhost:8000/docs**.

To serve the frontend from the backend instead (as production/Docker does), build it and let
`uvicorn` mount the static output:

```bash
cd frontend
npm run build
```

Then open **http://localhost:8000/app/**.

Other frontend scripts: `npm run lint` (oxlint), `npm test` (vitest).

## Running with Docker

```bash
docker compose up --build
```

Then visit http://localhost:8000/app/. Set `VOICESCRIBE_SECRET_KEY` and optionally
`WHISPER_MODEL_SIZE` (`tiny`/`base`/`small`/`medium`/`large-v3`) via a `.env` file or environment
variables before `docker compose up` for production use.

## Configuration

Environment variables (see `backend/.env.example`):

| Variable | Purpose | Default |
|---|---|---|
| `VOICESCRIBE_SECRET_KEY` | JWT signing secret — **change in production** | dev placeholder |
| `VOICESCRIBE_DATABASE_URL` | SQLAlchemy DB URL (swap to PostgreSQL for deployment) | local SQLite file |
| `WHISPER_MODEL_SIZE` | Whisper model size | `base` |
| `WHISPER_DEVICE` | `cpu` or `cuda` | `cpu` |
| `WHISPER_COMPUTE_TYPE` | CTranslate2 compute type (`int8`, `float16`, …) | `int8` |
| `ANTHROPIC_API_KEY` | Enables summarize/meeting-notes/ask/rewrite. Blank = those endpoints return 503. | blank |
| `ANTHROPIC_MODEL` | Claude model id | `claude-sonnet-5` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | Enables "Continue with Google". Create an OAuth client at the [Google Cloud Console](https://console.cloud.google.com/apis/credentials). Blank = the button sends users to a clear "not configured" response. | blank |
| `ADMIN_EMAILS` | Comma-separated emails auto-granted `is_admin` on register/login | blank |

SQLite schema upgrades (new columns from this feature set) are applied automatically and
non-destructively on startup — no manual migration step needed for existing databases.

## API overview

- `POST /api/auth/register`, `POST /api/auth/login`, `GET/PATCH/DELETE /api/auth/me`
- `GET /api/auth/google/login`, `GET /api/auth/google/callback` — Google sign-in (needs config)
- `POST /api/transcribe` / `POST /api/transcribe/batch` — multipart upload, returns immediately
  with `status: pending`
- `POST /api/transcribe/{id}/cancel`, `POST /api/transcribe/{id}/retry`
- `GET /api/transcripts?search=&language=&source=&folder=&favorite=&date_from=&date_to=&sort_by=`
- `GET/PUT/PATCH/DELETE /api/transcripts/{id}` — `PUT` replaces the text, `PATCH` updates
  name/favorite/folder/tags
- `GET /api/transcripts/{id}/audio` — stream the original/converted audio file
- `GET /api/transcripts/{id}/export?fmt=txt|md|srt|vtt|docx|pdf`
- `GET /api/transcripts/folders`
- `POST /api/ai/transcripts/{id}/summarize|meeting-notes|ask|rewrite`,
  `GET /api/ai/transcripts/{id}/speaker-analytics`
- `GET /api/admin/stats|users|jobs`, `DELETE /api/admin/users/{id}` (admin only)
- `WS /ws/stream?token=<jwt>&language=` — binary audio in, `{type: partial|final, text}` JSON out
- `GET /api/health` — reports whether AI/Google sign-in are configured

## Known limitations / explicitly out of scope

- **Speaker diarization** is a pause-based heuristic, not real voice-based diarization. Swap in
  `pyannote.audio` (needs a Hugging Face token and its model license accepted) for the real thing.
- **Payments** are UI-only — the Pricing page has no payment processor wired up. Stripe (or
  similar) integration is a deliberate follow-up, not included here.
- **Google sign-in** requires you to create your own OAuth client; the code path is complete but
  inert without credentials.
