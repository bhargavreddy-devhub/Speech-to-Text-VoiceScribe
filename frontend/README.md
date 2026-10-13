# VoiceScribe frontend

React + TypeScript (Vite) single-page app for the VoiceScribe speech-to-text workspace. Talks to
the FastAPI backend in `../backend` over `/api/...` (REST) and `/ws/stream` (WebSocket, live
transcription).

## Develop

```bash
npm install
npm run dev
```

The dev server runs on `http://localhost:5173` and proxies `/api` and `/ws` to
`http://localhost:8000` (see `vite.config.ts`), so start the backend separately:

```bash
cd ../backend
uvicorn app.main:app --reload
```

## Build

```bash
npm run build
```

Outputs to `dist/`, which `backend/app/main.py` serves at `/app` in production (and what the
Docker build produces via the `frontend-build` stage in `backend/Dockerfile`).

## Stack

- **Vite + React + TypeScript**
- **react-router-dom** (`HashRouter`, so URLs stay `#/workspace` etc. — no server-side route
  catch-all needed)
- **TanStack Query** for all server state (transcripts, admin data, health, job-status polling)
- **Zustand** for small cross-cutting client state (auth token/user, theme/contrast/font-size)
