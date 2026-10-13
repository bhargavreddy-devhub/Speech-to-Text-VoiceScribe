import json
from typing import Optional

from ..config import settings

_client = None


class AIError(Exception):
    pass


class AINotConfigured(AIError):
    pass


def _get_client():
    global _client
    if not settings.anthropic_api_key:
        raise AINotConfigured(
            "AI features aren't configured on this server. Set ANTHROPIC_API_KEY "
            "(as VOICESCRIBE_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY) in backend/.env."
        )
    if _client is None:
        import anthropic

        _client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    return _client


def _complete(prompt: str, system: str = "", max_tokens: int = 1024) -> str:
    client = _get_client()
    try:
        response = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=max_tokens,
            system=system or None,
            messages=[{"role": "user", "content": prompt}],
        )
        return "".join(
            block.text for block in response.content if getattr(block, "type", "") == "text"
        ).strip()
    except AINotConfigured:
        raise
    except Exception as exc:  # noqa: BLE001 - surface any provider error uniformly
        raise AIError(f"AI request failed: {exc}") from exc


_SUMMARY_PROMPTS = {
    "short": "Summarize the following transcript in 2-3 sentences.",
    "detailed": "Write a detailed, well-organized summary of the following transcript, "
                "covering all major topics discussed, in a few paragraphs.",
    "bullet": "Summarize the following transcript as a concise bulleted list of the key points.",
}


def summarize(text: str, mode: str = "short") -> str:
    instruction = _SUMMARY_PROMPTS.get(mode, _SUMMARY_PROMPTS["short"])
    return _complete(
        f"{instruction}\n\nTranscript:\n\"\"\"\n{text}\n\"\"\"",
        system="You are a precise assistant that summarizes spoken-word transcripts. "
        "Only use information present in the transcript.",
    )


def meeting_notes(text: str) -> dict:
    prompt = (
        "Read the following meeting/call transcript and extract structured notes. "
        "Respond with ONLY a JSON object with keys: "
        '"summary" (string, 2-3 sentences), '
        '"decisions" (array of strings — decisions that were made), '
        '"action_items" (array of strings — tasks, each including who/deadline if mentioned), '
        '"key_points" (array of strings — other important points discussed). '
        "Use empty arrays if a category doesn't apply. No text outside the JSON.\n\n"
        f"Transcript:\n\"\"\"\n{text}\n\"\"\""
    )
    raw = _complete(prompt, system="You extract structured meeting notes as strict JSON.", max_tokens=1536)
    return _parse_json_object(raw)


def ask_question(text: str, question: str) -> str:
    prompt = (
        f"Transcript:\n\"\"\"\n{text}\n\"\"\"\n\n"
        f"Question: {question}\n\n"
        "Answer using only information found in the transcript above. If the transcript "
        "doesn't contain the answer, say so explicitly."
    )
    return _complete(prompt, system="You answer questions strictly grounded in the given transcript.")


_REWRITE_PROMPTS = {
    "formal": "Rewrite the following text in clear, formal, professional language, preserving meaning.",
    "simple": "Rewrite the following text in simple, plain language that's easy to read, preserving meaning.",
    "grammar": "Fix grammar, punctuation, and capitalization in the following text without changing "
               "the wording or meaning otherwise.",
}


def rewrite(text: str, style: str = "formal") -> str:
    instruction = _REWRITE_PROMPTS.get(style, _REWRITE_PROMPTS["formal"])
    return _complete(
        f"{instruction} Return only the rewritten text, no commentary.\n\nText:\n\"\"\"\n{text}\n\"\"\"",
        system="You rewrite text faithfully without adding or removing information.",
    )


def _parse_json_object(raw: str) -> dict:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        if raw.startswith("json"):
            raw = raw[4:]
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(raw[start : end + 1])
            except json.JSONDecodeError:
                pass
        raise AIError("The AI response wasn't valid JSON")
