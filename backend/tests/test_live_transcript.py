"""Unit tests for the live-transcript confirm/tentative merge logic.

These cover the scenarios from the live-transcription test plan that don't
require real audio hardware or a loaded Whisper model: stable incremental
confirmation, overlapping/out-of-order segments, repeated/duplicate segments,
and segment-boundary offsetting for the bounded trailing-window transcription.
"""

from app.services.live_transcript import (
    CONFIRM_LAG_SECONDS,
    _remainder_after_overlap,
    merge_segments,
    offset_segments,
    prompt_context,
)


def seg(start, end, text):
    return {"start": start, "end": end, "text": text}


def test_first_pass_confirms_nothing_new_within_lag_window():
    # Short clip: everything is within CONFIRM_LAG_SECONDS of the live edge,
    # so nothing should be locked in as confirmed yet.
    segments = [seg(0.0, 1.0, "hello"), seg(1.0, 1.8, "there")]
    result = merge_segments(segments, confirmed_text="", confirmed_until=0.0, duration=1.8)
    assert result.confirmed_text == ""
    assert result.tentative_text == "hello there"
    assert result.confirmed_until == 0.0


def test_confirms_segments_older_than_lag_and_keeps_tail_tentative():
    segments = [seg(0.0, 1.0, "hello"), seg(1.0, 2.0, "there"), seg(2.0, 3.5, "friend")]
    duration = 4.0  # safe_boundary = 4.0 - 2.0 = 2.0
    result = merge_segments(segments, confirmed_text="", confirmed_until=0.0, duration=duration)
    assert result.confirmed_text == "hello there"
    assert result.confirmed_until == 2.0
    assert result.tentative_text == "friend"


def test_confirmed_text_is_appended_not_rewritten_across_passes():
    # Pass 1 confirms "hello there".
    first = merge_segments(
        [seg(0.0, 1.0, "hello"), seg(1.0, 2.0, "there"), seg(2.0, 3.5, "friend")],
        confirmed_text="",
        confirmed_until=0.0,
        duration=4.0,
    )
    assert first.confirmed_text == "hello there"

    # Pass 2 (more audio arrived): "friend" is now old enough to confirm, and
    # a brand-new tentative word appears. The already-confirmed prefix must
    # be preserved verbatim, not regenerated.
    second = merge_segments(
        [seg(1.0, 2.0, "there"), seg(2.0, 3.5, "friend"), seg(3.5, 5.0, "today")],
        confirmed_text=first.confirmed_text,
        confirmed_until=first.confirmed_until,
        duration=6.0,  # safe_boundary = 4.0
    )
    assert second.confirmed_text == "hello there friend"
    assert second.tentative_text == "today"


def test_overlapping_segment_across_boundary_recovers_the_new_words():
    # A re-decoded pass splits the words differently near the old boundary:
    # "there friend" now starts before confirmed_until (re-stating the
    # already-confirmed "there") but ends after it (introducing the new
    # word "friend"). The overlapping "there" must not be duplicated, but
    # "friend" is genuinely new and must not be silently lost either.
    confirmed_until = 2.0
    segments = [seg(1.8, 2.6, "there friend"), seg(2.6, 4.0, "today")]
    result = merge_segments(
        segments, confirmed_text="hello there", confirmed_until=confirmed_until, duration=6.0,
    )
    assert result.confirmed_text == "hello there friend today"
    # the overlapping word appears exactly once, not duplicated
    assert result.confirmed_text.split().count("there") == 1


def test_straddling_segment_with_no_wording_overlap_keeps_full_text():
    # If the overlapping time range was re-transcribed with completely
    # different wording (no matching prefix at all), there's no safe way to
    # tell which part is "old" — keep the whole segment rather than risk
    # silently dropping new content. An occasional duplicated word is a far
    # smaller problem for a transcription product than vanished speech.
    segments = [seg(1.8, 3.0, "completely different wording")]
    result = merge_segments(
        segments, confirmed_text="hello there", confirmed_until=2.0, duration=6.0,
    )
    assert result.confirmed_text == "hello there completely different wording"


def test_straddling_segment_fully_covered_by_confirmed_text_adds_nothing():
    # The straddling segment's words are entirely a re-statement of what's
    # already confirmed (nothing new past the overlap) — advance the
    # boundary but don't append an empty remainder.
    segments = [seg(1.0, 2.0, "there"), seg(2.0, 3.0, "friend")]
    result = merge_segments(
        segments, confirmed_text="hello there", confirmed_until=1.5, duration=6.0,
    )
    assert result.confirmed_text == "hello there friend"
    assert result.confirmed_until == 3.0


def test_remainder_after_overlap_strips_matching_prefix_case_and_punctuation_insensitively():
    assert _remainder_after_overlap("hello There,", "there friend") == "friend"


def test_remainder_after_overlap_with_no_match_returns_full_text():
    assert _remainder_after_overlap("hello there", "completely different") == "completely different"


def test_remainder_after_overlap_full_duplicate_returns_empty():
    assert _remainder_after_overlap("hello there friend", "there friend") == ""


def test_out_of_order_segments_are_sorted_before_joining():
    segments = [seg(2.0, 3.0, "world"), seg(0.0, 1.0, "hello"), seg(1.0, 2.0, "there")]
    result = merge_segments(segments, confirmed_text="", confirmed_until=0.0, duration=6.0)
    assert result.confirmed_text == "hello there world"


def test_empty_segments_produce_no_change():
    result = merge_segments([], confirmed_text="hello", confirmed_until=2.0, duration=5.0)
    assert result.confirmed_text == "hello"
    assert result.confirmed_until == 2.0
    assert result.tentative_text == ""


def test_blank_text_segments_are_skipped():
    segments = [seg(0.0, 1.0, "   "), seg(1.0, 2.0, "hello")]
    result = merge_segments(segments, confirmed_text="", confirmed_until=0.0, duration=4.0)
    assert result.confirmed_text == "hello"


def test_confirmed_until_never_moves_backward():
    segments = [seg(0.5, 1.0, "stale")]  # starts before confirmed_until
    result = merge_segments(segments, confirmed_text="x", confirmed_until=3.0, duration=10.0)
    assert result.confirmed_until == 3.0


def test_offset_segments_shifts_onto_absolute_timeline():
    segments = [seg(0.0, 1.0, "a"), seg(1.0, 2.0, "b")]
    shifted = offset_segments(segments, offset=10.0)
    assert shifted == [seg(10.0, 11.0, "a"), seg(11.0, 12.0, "b")]


def test_offset_segments_zero_offset_is_identity():
    segments = [seg(0.0, 1.0, "a")]
    assert offset_segments(segments, offset=0.0) is segments


def test_confirm_lag_seconds_is_positive():
    assert CONFIRM_LAG_SECONDS > 0


def test_confirmed_segments_accumulate_across_passes():
    # Pass 1 confirms "hello there" (two segments).
    first = merge_segments(
        [seg(0.0, 1.0, "hello"), seg(1.0, 2.0, "there"), seg(2.0, 3.5, "friend")],
        confirmed_text="",
        confirmed_until=0.0,
        duration=4.0,
    )
    assert first.confirmed_segments == [seg(0.0, 1.0, "hello"), seg(1.0, 2.0, "there")]

    # Pass 2 carries the prior confirmed_segments forward and appends the
    # newly-confirmed "friend" segment — it must not re-add "hello"/"there".
    second = merge_segments(
        [seg(1.0, 2.0, "there"), seg(2.0, 3.5, "friend"), seg(3.5, 5.0, "today")],
        confirmed_text=first.confirmed_text,
        confirmed_until=first.confirmed_until,
        duration=6.0,
        confirmed_segments=first.confirmed_segments,
    )
    assert second.confirmed_segments == [
        seg(0.0, 1.0, "hello"), seg(1.0, 2.0, "there"), seg(2.0, 3.5, "friend"),
    ]


def test_confirm_lag_zero_flushes_everything_pending():
    # Simulates the final pass on Stop: nothing more is coming, so even a
    # segment right at the live edge (which an in-progress pass would hold
    # back as tentative) must be locked into confirmed.
    segments = [seg(0.0, 1.0, "hello"), seg(1.0, 1.8, "there")]
    result = merge_segments(
        segments, confirmed_text="", confirmed_until=0.0, duration=1.8, confirm_lag_seconds=0.0,
    )
    assert result.confirmed_text == "hello there"
    assert result.tentative_text == ""
    assert result.confirmed_segments == segments


def test_confirmed_segments_defaults_to_empty_list():
    result = merge_segments([seg(0.0, 1.0, "hi")], confirmed_text="", confirmed_until=0.0, duration=10.0)
    assert result.confirmed_segments == [seg(0.0, 1.0, "hi")]


def test_prompt_context_empty_for_no_confirmed_text():
    assert prompt_context("") == ""
    assert prompt_context("   ") == ""


def test_prompt_context_returns_short_text_unchanged():
    assert prompt_context("hello there") == "hello there"


def test_prompt_context_truncates_and_drops_leading_partial_word():
    # max_chars=10 lands mid-word inside "brown" (chars [-10:] = "n fox jump");
    # the leading fragment "n" must be dropped, not kept as a fake word.
    text = "the quick brown fox jump"
    result = prompt_context(text, max_chars=10)
    assert result == "fox jump"


def test_prompt_context_does_not_cut_a_word_in_half():
    text = "the quick brown fox jumps over the lazy dog"
    result = prompt_context(text, max_chars=10)
    # every word in the trimmed prompt must be a whole word from the source
    assert all(word in text.split() for word in result.split())
