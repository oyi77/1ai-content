import pytest
import json
from pathlib import Path
from src.pipeline.style_context import StyleContext


def test_save_and_load(tmp_path):
    ctx = StyleContext(tone="professional", previous_chapter_ending="Last words.")
    path = tmp_path / "style_context.json"
    ctx.save(path)
    assert path.exists()
    loaded = StyleContext.load(path)
    assert loaded.tone == "professional"
    assert loaded.previous_chapter_ending == "Last words."


def test_save_creates_parent_directories(tmp_path):
    ctx = StyleContext(tone="formal")
    path = tmp_path / "nested" / "dir" / "style_context.json"
    ctx.save(path)
    assert path.exists()


def test_load_or_default_missing_file(tmp_path):
    path = tmp_path / "nonexistent.json"
    ctx = StyleContext.load_or_default(path, tone="casual")
    assert ctx.tone == "casual"


def test_load_or_default_existing_file(tmp_path):
    ctx = StyleContext(tone="academic")
    path = tmp_path / "sc.json"
    ctx.save(path)
    loaded = StyleContext.load_or_default(path)
    assert loaded.tone == "academic"


def test_recurring_metaphors_field():
    ctx = StyleContext(tone="conversational")
    assert hasattr(ctx, "recurring_metaphors")
    assert isinstance(ctx.recurring_metaphors, list)


def test_established_terminology_field():
    ctx = StyleContext(tone="conversational")
    assert hasattr(ctx, "established_terminology")
    assert isinstance(ctx.established_terminology, dict)


def test_save_load_with_new_fields(tmp_path):
    ctx = StyleContext(
        tone="technical",
        recurring_metaphors=["journey", "building blocks"],
        established_terminology={"API": "Application Programming Interface"},
    )
    path = tmp_path / "sc.json"
    ctx.save(path)
    loaded = StyleContext.load(path)
    assert "journey" in loaded.recurring_metaphors
    assert (
        loaded.established_terminology.get("API") == "Application Programming Interface"
    )


def test_load_produces_valid_json_on_disk(tmp_path):
    ctx = StyleContext(tone="casual", recurring_terms=["TDD", "refactor"])
    path = tmp_path / "sc.json"
    ctx.save(path)
    with open(path) as f:
        data = json.load(f)
    assert data["tone"] == "casual"
    assert "TDD" in data["recurring_terms"]
