import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path

from src.pipeline.chapter_generator import ChapterGenerator
from src.pipeline.style_context import StyleContext


@pytest.fixture
def mock_ai_client():
    client = MagicMock()
    client.generate_text = MagicMock(
        return_value="Generated content with multiple paragraphs covering the topic in depth."
    )
    client.generate_structured = MagicMock(
        return_value={
            "chapter_summary_bullets": ["Key point 1", "Key point 2", "Key point 3"],
            "callout_insight": "This is a powerful insight.",
            "case_study": {
                "name": "John",
                "conflict": "Problem",
                "resolution": "Solution",
            },
            "action_steps": ["Step 1", "Step 2", "Step 3"],
            "bridge_sentence": "Next chapter will cover...",
        }
    )
    return client


@pytest.fixture
def mock_model_tracker():
    tracker = MagicMock()
    tracker.best_model = MagicMock(return_value="gpt-4")
    tracker.record = MagicMock()
    return tracker


@pytest.fixture
def mock_token_calibrator():
    calibrator = MagicMock()
    calibrator.calibrated_tokens = MagicMock(return_value=1000)
    calibrator.record = MagicMock()
    return calibrator


@pytest.fixture
def sample_chapter():
    return {
        "title": "Getting Started",
        "summary": "Introduction to the topic",
        "subchapters": [
            {"title": "First Steps", "summary": "How to begin"},
            {"title": "Common Mistakes", "summary": "What to avoid"},
        ],
        "estimated_word_count": 2000,
    }


@pytest.fixture
def sample_strategy():
    return {
        "tone": "conversational",
        "audience": "beginners",
    }


def test_chapter_generator_initialization():
    generator = ChapterGenerator()
    assert generator.ai_client is not None
    assert generator.model_tracker is not None
    assert generator.token_calibrator is not None


def test_chapter_generator_with_custom_dependencies(
    mock_ai_client, mock_model_tracker, mock_token_calibrator
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )
    assert generator.ai_client == mock_ai_client
    assert generator.model_tracker == mock_model_tracker
    assert generator.token_calibrator == mock_token_calibrator


def test_generate_chapter_basic(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    result = generator.generate_chapter(
        chapter=sample_chapter,
        strategy=sample_strategy,
        chapter_num=1,
        total_chapters=5,
    )

    assert isinstance(result, str)
    assert len(result) > 0
    assert mock_ai_client.generate_text.call_count >= 3


def test_generate_chapter_with_subchapters(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    result = generator.generate_chapter(
        chapter=sample_chapter,
        strategy=sample_strategy,
        chapter_num=1,
        total_chapters=5,
    )

    assert "### First Steps" in result
    assert "### Common Mistakes" in result


def test_generate_chapter_calls_model_tracker(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    generator.generate_chapter(
        chapter=sample_chapter,
        strategy=sample_strategy,
        chapter_num=1,
        total_chapters=5,
    )

    assert mock_model_tracker.record.call_count >= 3


def test_generate_chapter_calls_token_calibrator(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    generator.generate_chapter(
        chapter=sample_chapter,
        strategy=sample_strategy,
        chapter_num=1,
        total_chapters=5,
    )

    assert mock_token_calibrator.calibrated_tokens.call_count >= 3
    assert mock_token_calibrator.record.call_count >= 3


def test_generate_chapter_with_style_context(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    style_ctx = StyleContext(
        tone="professional",
        vocabulary_level="technical",
        recurring_terms=["API", "endpoint"],
        established_terminology={"REST": "Representational State Transfer"},
    )

    result = generator.generate_chapter(
        chapter=sample_chapter,
        strategy=sample_strategy,
        chapter_num=1,
        total_chapters=5,
        style_ctx=style_ctx,
    )

    assert isinstance(result, str)
    assert len(result) > 0


def test_generate_chapter_with_extra_instruction(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    result = generator.generate_chapter(
        chapter=sample_chapter,
        strategy=sample_strategy,
        chapter_num=1,
        total_chapters=5,
        extra_instruction="Focus on practical examples.",
    )

    assert isinstance(result, str)
    assert len(result) > 0


def test_generate_chapter_with_language(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    result = generator.generate_chapter(
        chapter=sample_chapter,
        strategy=sample_strategy,
        chapter_num=1,
        total_chapters=5,
        language="es",
    )

    assert isinstance(result, str)
    assert len(result) > 0


def test_generate_chapter_with_enrichment_enabled(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    with patch("src.pipeline.chapter_generator.get_config") as mock_config:
        mock_config.return_value.chapter_enrichment_enabled = True
        mock_config.return_value.default_model = "gpt-4"
        mock_config.return_value.model_capability_tier = "high"

        result = generator.generate_chapter(
            chapter=sample_chapter,
            strategy=sample_strategy,
            chapter_num=1,
            total_chapters=5,
        )

        assert isinstance(result, str)
        assert mock_ai_client.generate_structured.called


def test_generate_chapter_enrichment_fallback(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    mock_ai_client.generate_structured.side_effect = Exception("Enrichment failed")

    with patch("src.pipeline.chapter_generator.get_config") as mock_config:
        mock_config.return_value.chapter_enrichment_enabled = True
        mock_config.return_value.default_model = "gpt-4"
        mock_config.return_value.model_capability_tier = "high"

        result = generator.generate_chapter(
            chapter=sample_chapter,
            strategy=sample_strategy,
            chapter_num=1,
            total_chapters=5,
        )

        assert isinstance(result, str)
        assert len(result) > 0


def test_generate_chapter_without_enrichment(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    with patch("src.pipeline.chapter_generator.get_config") as mock_config:
        mock_config.return_value.chapter_enrichment_enabled = False
        mock_config.return_value.default_model = "gpt-4"

        result = generator.generate_chapter(
            chapter=sample_chapter,
            strategy=sample_strategy,
            chapter_num=1,
            total_chapters=5,
        )

        assert isinstance(result, str)
        assert not mock_ai_client.generate_structured.called


def test_generate_chapter_hook_rotation(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    for chapter_num in [1, 2, 3, 4]:
        result = generator.generate_chapter(
            chapter=sample_chapter,
            strategy=sample_strategy,
            chapter_num=chapter_num,
            total_chapters=5,
        )
        assert isinstance(result, str)


def test_generate_chapter_with_fiction_profile(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    fiction_profile = MagicMock()
    fiction_profile.is_fiction = True

    result = generator.generate_chapter(
        chapter=sample_chapter,
        strategy=sample_strategy,
        chapter_num=1,
        total_chapters=5,
        profile=fiction_profile,
    )

    assert isinstance(result, str)
    assert len(result) > 0


def test_generate_chapter_with_manuscript_model(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    result = generator.generate_chapter(
        chapter=sample_chapter,
        strategy=sample_strategy,
        chapter_num=1,
        total_chapters=5,
        manuscript_model="gpt-4-turbo",
    )

    assert isinstance(result, str)
    assert len(result) > 0


def test_generate_chapter_with_style_guide(
    mock_ai_client,
    mock_model_tracker,
    mock_token_calibrator,
    sample_chapter,
    sample_strategy,
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    style_guide = MagicMock()
    style_guide.to_system_prompt_block = MagicMock(return_value="Style guide content")

    with patch("src.pipeline.chapter_generator.get_config") as mock_config:
        mock_config.return_value.model_capability_tier = "high"
        mock_config.return_value.default_model = "gpt-4"
        mock_config.return_value.chapter_enrichment_enabled = False

        result = generator.generate_chapter(
            chapter=sample_chapter,
            strategy=sample_strategy,
            chapter_num=1,
            total_chapters=5,
            style_guide=style_guide,
        )

        assert isinstance(result, str)
        assert style_guide.to_system_prompt_block.called


def test_generate_chapter_empty_subchapters(
    mock_ai_client, mock_model_tracker, mock_token_calibrator, sample_strategy
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    chapter = {
        "title": "Simple Chapter",
        "summary": "A chapter without subchapters",
        "subchapters": [],
        "estimated_word_count": 1000,
    }

    result = generator.generate_chapter(
        chapter=chapter,
        strategy=sample_strategy,
        chapter_num=1,
        total_chapters=5,
    )

    assert isinstance(result, str)
    assert len(result) > 0


def test_generate_chapter_string_subchapters(
    mock_ai_client, mock_model_tracker, mock_token_calibrator, sample_strategy
):
    generator = ChapterGenerator(
        ai_client=mock_ai_client,
        model_tracker=mock_model_tracker,
        token_calibrator=mock_token_calibrator,
    )

    chapter = {
        "title": "Chapter with String Subchapters",
        "summary": "Testing string subchapters",
        "subchapters": ["Section One", "Section Two"],
        "estimated_word_count": 1500,
    }

    result = generator.generate_chapter(
        chapter=chapter,
        strategy=sample_strategy,
        chapter_num=1,
        total_chapters=5,
    )

    assert isinstance(result, str)
    assert "### Section One" in result
    assert "### Section Two" in result
