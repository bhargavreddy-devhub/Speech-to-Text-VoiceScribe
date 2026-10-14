"""Pure merge logic for the live-transcription WebSocket stream.

Kept separate from `routers/stream.py` (which owns the websocket/ffmpeg/model
plumbing) so the confirm/tentative merge rules — the part most prone to
duplicate or dropped words — can be unit tested without a websocket, ffmpeg,
or a loaded Whisper model.
"""

from dataclasses import dataclass

# How many seconds of trailing audio to keep "tentative" (re-transcribed and
# shown, but not yet locked in). Whisper can still revise wording near the
# end of the window as more audio arrives, so only text older than this is
# frozen into the confirmed transcript.
CONFIRM_LAG_SECONDS = 2.0

# How much trailing audio each incremental pass re-transcribes. Bounding this
# (instead of re-transcribing the whole growing recording every pass) keeps
# per-chunk latency roughly constant regardless of how long the session has
# been running.
WINDOW_SECONDS = 20.0

# How much of the confirmed transcript to feed back to Whisper as context for
# the next pass. Each pass otherwise starts "cold" with no memory of what was
# just said, which costs consistent spelling/capitalization and correct
# homophone choices right at the start of the window. Kept short so it
# nudges the decoder rather than dominating the prompt budget.
PROMPT_CONTEXT_CHARS = 200


def prompt_context(confirmed_text: str, max_chars: int = PROMPT_CONTEXT_CHARS) -> str:
    """Return a trailing slice of `confirmed_text` suitable as an initial_prompt.

    Trims to the last `max_chars` characters, then drops any partial leading
    word (cut mid-word by the slice) so the prompt reads as whole words -
    Whisper's prompting is sensitive to being handed a token fragment.
    """
    tail = confirmed_text.strip()[-max_chars:]
    if not tail:
        return ""
    first_space = tail.find(" ")
    if first_space > 0 and len(confirmed_text.strip()) > max_chars:
        tail = tail[first_space + 1 :]
    return tail.strip()


def _normalize_word(word: str) -> str:
    return word.strip(".,!?;:\"'()[]{}—-").lower()


# How many trailing confirmed words to search for an overlap match against a
# straddling segment. Bounded for both performance and correctness — a
# "match" found much further back than a typical segment's length would be
# coincidental rather than real overlap.
_OVERLAP_SEARCH_WORDS = 30


def _remainder_after_overlap(confirmed_text: str, segment_text: str) -> str:
    """A segment that straddles the confirmed boundary (it starts before
    `confirmed_until` but extends past it) is almost always a re-decode of
    some already-confirmed words followed by genuinely new ones — re-decoded
    because a later pass, with more audio and context, grouped the ASR
    output into different segment boundaries than the pass that confirmed
    the earlier words did. Find the longest run of trailing confirmed words
    that matches a leading run of the segment's words, and return only what
    comes after that overlap.

    If no overlap is found at all (wording actually differs across the
    straddle, not just re-segmentation), returns `segment_text` unchanged
    rather than silently discarding it — for a transcription product, a
    rare duplicated word is a far smaller problem than new speech vanishing
    with no trace, which is what skipping the segment entirely would do.
    """
    confirmed_words = confirmed_text.split()[-_OVERLAP_SEARCH_WORDS:]
    segment_words = segment_text.split()
    if not confirmed_words or not segment_words:
        return segment_text

    confirmed_norm = [_normalize_word(w) for w in confirmed_words]
    segment_norm = [_normalize_word(w) for w in segment_words]

    for n in range(min(len(confirmed_norm), len(segment_norm)), 0, -1):
        if confirmed_norm[-n:] == segment_norm[:n]:
            return " ".join(segment_words[n:])

    return segment_text


@dataclass
class MergeResult:
    confirmed_text: str
    confirmed_until: float
    tentative_text: str
    confirmed_segments: list[dict]


def merge_segments(
    segments: list[dict],
    confirmed_text: str,
    confirmed_until: float,
    duration: float,
    confirmed_segments: list[dict] | None = None,
    confirm_lag_seconds: float = CONFIRM_LAG_SECONDS,
) -> MergeResult:
    """Fold one ASR pass's segments into the running confirmed/tentative transcript.

    `segments` are absolute-timeline {start, end, text} dicts (offset-adjusted
    by the caller if they came from a trailing window rather than the full
    recording). A segment is locked into `confirmed_text` once it ends at
    least `confirm_lag_seconds` before the current audio edge, giving Whisper
    room to still revise it right up until then. Confirmed text is never
    rewritten, only appended to.

    Segmentation isn't stable across passes — a later pass (more audio, more
    context) can group words into different segment boundaries than an
    earlier pass did, so a segment can straddle `confirmed_until` (start
    before it, end after): partly already confirmed, partly new. Such a
    segment is matched against the tail of `confirmed_text` via
    `_remainder_after_overlap` and only its new portion is appended, instead
    of either re-adding the overlapping words (duplication) or dropping the
    segment outright (silently losing the new words in it too).

    `confirmed_segments` carries forward the individual segments locked in by
    earlier passes (not just their joined text), so a caller finalizing the
    session can assemble a complete segment list without ever re-transcribing
    already-confirmed audio. Pass `confirm_lag_seconds=0` to flush every
    pending segment regardless of how close it is to the audio edge — used
    for the final pass once no more audio is coming.
    """
    confirmed_segments = list(confirmed_segments) if confirmed_segments else []
    safe_boundary = max(0.0, duration - confirm_lag_seconds)

    old_enough = sorted(
        (seg for seg in segments if seg["end"] <= safe_boundary),
        key=lambda seg: seg["start"],
    )

    new_pieces = []
    for seg in old_enough:
        if seg["end"] <= confirmed_until + 1e-6:
            continue  # fully covered by what's already confirmed — nothing new here

        text = seg["text"].strip()
        if text and seg["start"] < confirmed_until - 1e-6:
            # Straddles the boundary — only part of it is new.
            text = _remainder_after_overlap(confirmed_text, text).strip()

        if text:
            new_pieces.append(text)
            confirmed_text = (confirmed_text + " " + text).strip()
        confirmed_segments.append(seg)
        confirmed_until = max(confirmed_until, seg["end"])

    tentative_text = " ".join(
        seg["text"].strip() for seg in segments
        if seg["end"] > safe_boundary and seg["text"].strip()
    ).strip()

    return MergeResult(
        confirmed_text=confirmed_text,
        confirmed_until=confirmed_until,
        tentative_text=tentative_text,
        confirmed_segments=confirmed_segments,
    )


def offset_segments(segments: list[dict], offset: float) -> list[dict]:
    """Shift relative {start, end, text} segments (e.g. from a trailing-window
    transcription that starts at local time 0) onto the recording's absolute
    timeline."""
    if not offset:
        return segments
    return [
        {"start": seg["start"] + offset, "end": seg["end"] + offset, "text": seg["text"]}
        for seg in segments
    ]
