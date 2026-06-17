import pytest
from src.pipeline.style_guide import StyleGuide


def test_to_system_prompt_block_small_tier():
    sg = StyleGuide(banned_phrases=["delve", "furthermore"], tone_adjectives=["direct"])
    block = sg.to_system_prompt_block(tier="small")
    assert "delve" in block
    assert "furthermore" in block
    # small tier should NOT include gold standard paragraph
    assert "gold standard" not in block.lower() or sg.gold_standard_paragraph == ""


def test_to_system_prompt_block_large_tier():
    sg = StyleGuide(gold_standard_paragraph="This is a reference paragraph.")
    block = sg.to_system_prompt_block(tier="large")
    assert "This is a reference paragraph." in block


def test_to_system_prompt_block_medium_tier():
    sg = StyleGuide(
        voice_anchor="A 35-year-old developer", tone_adjectives=["direct", "warm"]
    )
    block = sg.to_system_prompt_block(tier="medium")
    assert "35-year-old developer" in block
    assert "direct" in block


def test_to_system_prompt_block_large_omits_gold_standard_when_empty():
    sg = StyleGuide(gold_standard_paragraph="")
    block = sg.to_system_prompt_block(tier="large")
    # No reference paragraph section when gold_standard_paragraph is empty
    assert "Voice reference paragraph" not in block


def test_to_system_prompt_block_small_omits_tone():
    sg = StyleGuide(tone_adjectives=["warm", "direct"])
    block = sg.to_system_prompt_block(tier="small")
    # small tier skips tone adjectives
    assert "Tone:" not in block


def test_detect_violations_finds_banned_phrases():
    sg = StyleGuide(banned_phrases=["delve", "furthermore"])
    violations, density = sg.detect_violations(
        "Let us delve into this topic. Furthermore, we should note..."
    )
    assert "delve" in violations
    assert "furthermore" in violations


def test_detect_violations_empty():
    sg = StyleGuide(banned_phrases=["delve"])
    violations, density = sg.detect_violations("This is clean prose.")
    assert violations == []


def test_detect_violations_case_insensitive():
    sg = StyleGuide(banned_phrases=["delve"])
    violations, density = sg.detect_violations("Let us DELVE into this.")
    assert "delve" in violations


def test_detect_violations_density():
    sg = StyleGuide(banned_phrases=["delve", "furthermore"])
    # 500 words with 2 violations → density = 2 / (500/500) = 2.0
    text = "word " * 500 + "delve furthermore"
    violations, density = sg.detect_violations(text)
    assert len(violations) == 2
    assert density > 0


def test_default_banned_phrases_present():
    sg = StyleGuide()
    assert len(sg.banned_phrases) > 5
    assert "delve" in sg.banned_phrases


def test_to_system_prompt_block_always_includes_pov():
    sg = StyleGuide()
    for tier in ("small", "medium", "large"):
        block = sg.to_system_prompt_block(tier=tier)
        assert "POV" in block
