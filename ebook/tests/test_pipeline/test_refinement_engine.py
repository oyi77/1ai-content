import pytest
from unittest.mock import MagicMock
from src.pipeline.refinement_engine import RefinementEngine


def test_fast_mode_returns_original():
    engine = RefinementEngine(quality_level="fast")
    content = "Some text with bad grammer."
    assert engine.refine(content) == content


def test_no_client_returns_original():
    engine = RefinementEngine(ai_client=None, quality_level="thorough")
    content = "Some text."
    assert engine.refine(content) == content


def test_thorough_mode_calls_ai(mock_ai_client):
    mock_ai_client.generate_text.return_value = "Improved text."
    engine = RefinementEngine(ai_client=mock_ai_client, quality_level="thorough")
    result = engine.refine("Original text.")
    assert result == "Improved text."
    mock_ai_client.generate_text.assert_called_once()


def test_thorough_mode_graceful_degradation(mock_ai_client):
    mock_ai_client.generate_text.side_effect = Exception("API error")
    engine = RefinementEngine(ai_client=mock_ai_client, quality_level="thorough")
    original = "Original text."
    result = engine.refine(original)
    assert result == original  # graceful degradation
