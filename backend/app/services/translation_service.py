import re
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import requests

# MyMemory requires region-qualified locale codes rather than bare ISO-639-1
# codes (e.g. "hi-IN" instead of "hi"), and its "auto" source detection is
# unreliable (it intermittently rejects the request with a 200 OK whose body
# is an error string). So we always pass the explicit source language that
# faster-whisper already detected, mapped through this same table.
TARGET_LOCALE_MAP = {
    "en": "en-GB",
    "hi": "hi-IN",
    "te": "te-IN",
    "ta": "ta-IN",
    "kn": "kn-IN",
    "ml": "ml-IN",
    "bn": "bn-IN",
    "mr": "mr-IN",
    "gu": "gu-IN",
    "pa": "pa-IN",
    "ur": "ur-PK",
    "es": "es-ES",
    "fr": "fr-FR",
    "de": "de-DE",
    "it": "it-IT",
    "pt": "pt-PT",
    "ru": "ru-RU",
    "zh": "zh-CN",
    "ja": "ja-JP",
    "ko": "ko-KR",
    "ar": "ar-SA",
    "tr": "tr-TR",
    "vi": "vi-VN",
    "th": "th-TH",
    "id": "id-ID",
    "nl": "nl-NL",
    "pl": "pl-PL",
    "uk": "uk-UA",
    "el": "el-GR",
    "he": "he-IL",
    "sw": "sw-KE",
    "ne": "ne-NP",
    "si": "si-LK",
}

_MAX_CHUNK_CHARS = 450
_MYMEMORY_URL = "http://api.mymemory.translated.net/get"
# MyMemory's free endpoint is a slow, rate-limited third-party service (easily
# 1-5s per request) with no built-in timeout, so a hung request would otherwise
# block the background transcription task indefinitely.
_REQUEST_TIMEOUT_SECONDS = 15
# Chunks are independent network calls, so translating them concurrently turns
# N sequential round-trips (N * ~2-5s) into roughly one round-trip's worth of
# wall-clock time for multi-chunk transcripts.
_MAX_CONCURRENT_REQUESTS = 4


def _split_into_chunks(text: str, max_chars: int = _MAX_CHUNK_CHARS) -> list[str]:
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    chunks: list[str] = []
    current = ""
    for sentence in sentences:
        if not sentence:
            continue
        candidate = f"{current} {sentence}".strip() if current else sentence
        if len(candidate) > max_chars and current:
            chunks.append(current)
            current = sentence
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks or [text]


class TranslationError(Exception):
    pass


def _translate_chunk(chunk: str, source_locale: str, target_locale: str) -> str:
    try:
        response = requests.get(
            _MYMEMORY_URL,
            params={"q": chunk, "langpair": f"{source_locale}|{target_locale}"},
            timeout=_REQUEST_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise TranslationError(f"Translation service request failed: {exc}") from exc

    if response.status_code == 429:
        raise TranslationError("Translation service rate limit exceeded, try again shortly")
    if response.status_code >= 400:
        raise TranslationError(f"Translation service returned HTTP {response.status_code}")

    data = response.json()
    result = (data.get("responseData") or {}).get("translatedText")
    if result and "INVALID SOURCE LANGUAGE" in result.upper():
        raise TranslationError(f"Translation service rejected the request: {result}")
    if not result:
        # MyMemory sometimes returns an empty translatedText (its best cached
        # "match" happens to be blank) while still providing a real machine
        # translation further down in `matches` — fall back to that.
        for match in data.get("matches") or []:
            candidate = match.get("translation")
            if candidate:
                return candidate
        raise TranslationError("Translation service returned an empty result")
    return result


def translate_text(text: str, target_code: str, source_code: Optional[str] = None) -> str:
    """Translate text into the given short language code (e.g. 'hi', 'es').

    `source_code` should be the short language code faster-whisper detected
    for the audio; it is mapped through the same locale table. Falls back to
    English if the detected language isn't in our map.

    Raises TranslationError if the target code is unsupported or the
    translation service call fails.
    """
    if not text.strip():
        return ""

    target_locale = TARGET_LOCALE_MAP.get(target_code)
    if not target_locale:
        raise TranslationError(f"Unsupported translation target '{target_code}'")

    source_locale = TARGET_LOCALE_MAP.get(source_code or "en", TARGET_LOCALE_MAP["en"])

    chunks = _split_into_chunks(text)
    try:
        if len(chunks) == 1:
            translated_chunks = [_translate_chunk(chunks[0], source_locale, target_locale)]
        else:
            with ThreadPoolExecutor(max_workers=min(_MAX_CONCURRENT_REQUESTS, len(chunks))) as pool:
                translated_chunks = list(
                    pool.map(lambda c: _translate_chunk(c, source_locale, target_locale), chunks)
                )
        return " ".join(part for part in translated_chunks if part)
    except TranslationError:
        raise
    except Exception as exc:  # noqa: BLE001 - surface any backend failure uniformly
        raise TranslationError(str(exc)) from exc
