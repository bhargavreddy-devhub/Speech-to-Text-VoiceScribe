FROM node:20-alpine AS frontend-build

WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
RUN npm run build

FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Build context is the repository root (see docker-compose.yml)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY --from=frontend-build /frontend/dist /frontend/dist

ENV PYTHONUNBUFFERED=1 \
    WHISPER_MODEL_SIZE=base \
    WHISPER_DEVICE=cpu \
    WHISPER_COMPUTE_TYPE=int8

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
