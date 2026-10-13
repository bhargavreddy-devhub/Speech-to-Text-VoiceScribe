import re
from typing import Optional

from deep_translator import MyMemoryTranslator

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

    try:
        translator = MyMemoryTranslator(source=source_locale, target=target_locale)
        translated_chunks = []
        for chunk in _split_into_chunks(text):
            result = translator.translate(chunk)
            if result is None or "INVALID SOURCE LANGUAGE" in result.upper():
                raise TranslationError(f"Translation service rejected the request: {result}")
            translated_chunks.append(result)
        return " ".join(part for part in translated_chunks if part)
    except TranslationError:
        raise
    except Exception as exc:  # noqa: BLE001 - surface any backend failure uniformly
        raise TranslationError(str(exc)) from exc
