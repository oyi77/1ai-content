import pytest
import json
from pathlib import Path
from src.pipeline.style_context import StyleContext

# ============================================================================
# CREATION TESTS
# ============================================================================


def test_style_context_creation_minimal():
    """Test creating StyleContext with only required fields."""
    ctx = StyleContext(tone="conversational")
    assert ctx.tone == "conversational"
    assert ctx.vocabulary_level == "general"
    assert ctx.recurring_terms == []
    assert ctx.characters == []
    assert ctx.previous_chapter_ending == ""
    assert ctx.recurring_metaphors == []
    assert ctx.established_terminology == {}


def test_style_context_creation_full():
    """Test creating StyleContext with all fields populated."""
    ctx = StyleContext(
        tone="professional",
        vocabulary_level="technical",
        recurring_terms=["API", "microservices"],
        characters=[{"name": "Alice", "role": "protagonist"}],
        previous_chapter_ending="And so the journey began.",
        recurring_metaphors=["building blocks", "journey"],
        established_terminology={"API": "Application Programming Interface"},
    )
    assert ctx.tone == "professional"
    assert ctx.vocabulary_level == "technical"
    assert len(ctx.recurring_terms) == 2
    assert len(ctx.characters) == 1
    assert "journey began" in ctx.previous_chapter_ending
    assert len(ctx.recurring_metaphors) == 2
    assert ctx.established_terminology["API"] == "Application Programming Interface"


def test_style_context_vocabulary_levels():
    """Test different vocabulary level options."""
    for level in ["simple", "general", "technical"]:
        ctx = StyleContext(tone="neutral", vocabulary_level=level)
        assert ctx.vocabulary_level == level


# ============================================================================
# PROMPT BLOCK GENERATION TESTS
# ============================================================================


def test_to_prompt_block_basic():
    """Test basic prompt block generation."""
    ctx = StyleContext(tone="conversational")
    block = ctx.to_prompt_block()
    assert "Tone: conversational" in block
    assert "Vocabulary level: general" in block


def test_to_prompt_block_with_recurring_terms():
    """Test prompt block includes recurring terms."""
    ctx = StyleContext(
        tone="technical", recurring_terms=["TDD", "refactoring", "CI/CD"]
    )
    block = ctx.to_prompt_block()
    assert "Key terms to use consistently:" in block
    assert "TDD" in block
    assert "refactoring" in block
    assert "CI/CD" in block


def test_to_prompt_block_with_characters():
    """Test prompt block includes character information."""
    ctx = StyleContext(
        tone="dramatic",
        characters=[
            {
                "name": "Alice",
                "role": "protagonist",
                "description": "A brave hero who faces challenges",
            },
            {"name": "Bob", "role": "antagonist", "description": "A cunning villain"},
        ],
    )
    block = ctx.to_prompt_block()
    assert "Alice" in block
    assert "protagonist" in block
    assert "Bob" in block
    assert "antagonist" in block


def test_to_prompt_block_with_ending():
    """Test prompt block includes previous chapter ending."""
    ctx = StyleContext(tone="formal", previous_chapter_ending="And so it began.")
    block = ctx.to_prompt_block()
    assert "Previous chapter ended:" in block
    assert "And so it began." in block


def test_to_prompt_block_no_empty_sections():
    """Test prompt block omits empty sections."""
    ctx = StyleContext(tone="casual")
    block = ctx.to_prompt_block()
    # No characters section when empty
    assert "Characters:" not in block
    assert "Key terms" not in block
    assert "Previous chapter ended:" not in block


def test_to_prompt_block_character_description_truncation():
    """Test that long character descriptions are truncated to 50 chars."""
    long_desc = "A" * 100
    ctx = StyleContext(
        tone="epic",
        characters=[{"name": "Hero", "role": "main", "description": long_desc}],
    )
    block = ctx.to_prompt_block()
    # Description should be truncated to 50 chars
    assert long_desc[:50] in block
    assert long_desc not in block


# ============================================================================
# SERIALIZATION TESTS
# ============================================================================


def test_save_and_load(tmp_path):
    """Test saving and loading StyleContext."""
    ctx = StyleContext(tone="professional", previous_chapter_ending="Last words.")
    path = tmp_path / "style_context.json"
    ctx.save(path)
    assert path.exists()
    loaded = StyleContext.load(path)
    assert loaded.tone == "professional"
    assert loaded.previous_chapter_ending == "Last words."


def test_save_creates_parent_directories(tmp_path):
    """Test that save creates parent directories if they don't exist."""
    ctx = StyleContext(tone="formal")
    path = tmp_path / "nested" / "dir" / "style_context.json"
    ctx.save(path)
    assert path.exists()


def test_save_with_all_fields(tmp_path):
    """Test saving StyleContext with all fields populated."""
    ctx = StyleContext(
        tone="technical",
        vocabulary_level="technical",
        recurring_terms=["API", "REST"],
        characters=[{"name": "Dev", "role": "engineer"}],
        previous_chapter_ending="End of chapter.",
        recurring_metaphors=["journey", "building"],
        established_terminology={"REST": "Representational State Transfer"},
    )
    path = tmp_path / "sc.json"
    ctx.save(path)

    loaded = StyleContext.load(path)
    assert loaded.tone == "technical"
    assert loaded.vocabulary_level == "technical"
    assert "API" in loaded.recurring_terms
    assert len(loaded.characters) == 1
    assert loaded.previous_chapter_ending == "End of chapter."
    assert "journey" in loaded.recurring_metaphors
    assert loaded.established_terminology["REST"] == "Representational State Transfer"


def test_load_produces_valid_json_on_disk(tmp_path):
    """Test that saved file is valid JSON."""
    ctx = StyleContext(tone="casual", recurring_terms=["TDD", "refactor"])
    path = tmp_path / "sc.json"
    ctx.save(path)
    with open(path) as f:
        data = json.load(f)
    assert data["tone"] == "casual"
    assert "TDD" in data["recurring_terms"]


def test_load_with_path_string(tmp_path):
    """Test loading with string path instead of Path object."""
    ctx = StyleContext(tone="formal")
    path = tmp_path / "sc.json"
    ctx.save(str(path))
    loaded = StyleContext.load(str(path))
    assert loaded.tone == "formal"


def test_load_or_default_missing_file(tmp_path):
    """Test load_or_default returns default when file doesn't exist."""
    path = tmp_path / "nonexistent.json"
    ctx = StyleContext.load_or_default(path, tone="casual")
    assert ctx.tone == "casual"


def test_load_or_default_existing_file(tmp_path):
    """Test load_or_default loads existing file."""
    ctx = StyleContext(tone="academic")
    path = tmp_path / "sc.json"
    ctx.save(path)
    loaded = StyleContext.load_or_default(path)
    assert loaded.tone == "academic"


def test_load_or_default_with_defaults(tmp_path):
    """Test load_or_default applies defaults when file missing."""
    path = tmp_path / "missing.json"
    ctx = StyleContext.load_or_default(
        path,
        tone="dramatic",
        vocabulary_level="simple",
        recurring_terms=["hero", "quest"],
    )
    assert ctx.tone == "dramatic"
    assert ctx.vocabulary_level == "simple"
    assert "hero" in ctx.recurring_terms


# ============================================================================
# EDGE CASE TESTS
# ============================================================================


def test_load_ignores_unknown_fields(tmp_path):
    """Test that load ignores fields not in dataclass."""
    path = tmp_path / "sc.json"
    # Manually write JSON with extra field
    with open(path, "w") as f:
        json.dump(
            {
                "tone": "formal",
                "vocabulary_level": "general",
                "unknown_field": "should be ignored",
                "recurring_terms": [],
                "characters": [],
                "previous_chapter_ending": "",
                "recurring_metaphors": [],
                "established_terminology": {},
            },
            f,
        )

    # Should load without error, ignoring unknown_field
    ctx = StyleContext.load(path)
    assert ctx.tone == "formal"
    assert not hasattr(ctx, "unknown_field")


def test_load_missing_file_raises_error(tmp_path):
    """Test that load raises error for missing file."""
    path = tmp_path / "nonexistent.json"
    with pytest.raises(FileNotFoundError):
        StyleContext.load(path)


def test_load_invalid_json_raises_error(tmp_path):
    """Test that load raises error for invalid JSON."""
    path = tmp_path / "invalid.json"
    with open(path, "w") as f:
        f.write("not valid json{")

    with pytest.raises(json.JSONDecodeError):
        StyleContext.load(path)


def test_empty_characters_list():
    """Test handling of empty characters list."""
    ctx = StyleContext(tone="neutral", characters=[])
    block = ctx.to_prompt_block()
    assert "Characters:" not in block


def test_character_without_description():
    """Test character without description field."""
    ctx = StyleContext(tone="casual", characters=[{"name": "Alice", "role": "hero"}])
    block = ctx.to_prompt_block()
    assert "Alice" in block
    assert "hero" in block


def test_character_without_role():
    """Test character without role field defaults to 'character'."""
    ctx = StyleContext(
        tone="casual", characters=[{"name": "Bob", "description": "A person"}]
    )
    block = ctx.to_prompt_block()
    assert "Bob" in block
    assert "character" in block


def test_very_long_previous_chapter_ending():
    """Test handling of very long previous chapter ending."""
    long_ending = "A" * 1000
    ctx = StyleContext(tone="epic", previous_chapter_ending=long_ending)
    block = ctx.to_prompt_block()
    assert long_ending in block


def test_special_characters_in_fields(tmp_path):
    """Test handling of special characters in fields."""
    ctx = StyleContext(
        tone="quirky",
        recurring_terms=["API's", "micro-services", "CI/CD"],
        established_terminology={"<tag>": "HTML element", "A&B": "A and B"},
    )
    path = tmp_path / "sc.json"
    ctx.save(path)
    loaded = StyleContext.load(path)
    assert "API's" in loaded.recurring_terms
    assert loaded.established_terminology["<tag>"] == "HTML element"


def test_unicode_in_fields(tmp_path):
    """Test handling of unicode characters."""
    ctx = StyleContext(
        tone="international",
        recurring_terms=["café", "naïve", "résumé"],
        previous_chapter_ending="Et voilà! 你好",
    )
    path = tmp_path / "sc.json"
    ctx.save(path)
    loaded = StyleContext.load(path)
    assert "café" in loaded.recurring_terms
    assert "你好" in loaded.previous_chapter_ending


def test_empty_established_terminology():
    """Test empty established terminology dict."""
    ctx = StyleContext(tone="simple", established_terminology={})
    assert ctx.established_terminology == {}
    block = ctx.to_prompt_block()
    # Should not cause errors
    assert "Tone: simple" in block


def test_load_or_default_handles_corrupted_file(tmp_path):
    """Test load_or_default returns default for corrupted file."""
    path = tmp_path / "corrupted.json"
    with open(path, "w") as f:
        f.write("corrupted{json")

    ctx = StyleContext.load_or_default(path, tone="fallback")
    assert ctx.tone == "fallback"
