import pytest
from unittest.mock import MagicMock, patch


def test_qa_pass_for_well_formed_manuscript():
    from src.pipeline.qa_engine import QAEngine

    engine = QAEngine()

    manuscript = {
        "chapters": [
            {"title": "Ch1", "word_count": 500},
            {"title": "Ch2", "word_count": 550},
            {"title": "Ch3", "word_count": 480},
        ]
    }
    outline = {
        "chapters": [
            {"title": "Ch1"},
            {"title": "Ch2"},
            {"title": "Ch3"},
        ]
    }
    strategy = {"tone": "conversational"}

    report = engine.run(manuscript, outline, strategy)

    assert report["passed"] == True
    assert "structure" in report["scores"]


def test_qa_detects_missing_chapter():
    from src.pipeline.qa_engine import QAEngine

    engine = QAEngine()

    manuscript = {
        "chapters": [
            {"title": "Ch1", "word_count": 500},
            {"title": "Ch3", "word_count": 500},
        ]
    }
    outline = {
        "chapters": [
            {"title": "Ch1"},
            {"title": "Ch2"},
            {"title": "Ch3"},
        ]
    }

    report = engine.run(manuscript, outline, {})

    assert report["passed"] == False
    assert any("chapter" in issue.lower() for issue in report["issues"])


def test_qa_detects_word_count_outside_tolerance():
    from src.pipeline.qa_engine import QAEngine

    engine = QAEngine()

    manuscript = {
        "chapters": [
            {"title": "Ch1", "word_count": 100},
            {"title": "Ch2", "word_count": 100},
        ]
    }
    outline = {
        "chapters": [
            {"title": "Ch1", "estimated_word_count": 500},
            {"title": "Ch2", "estimated_word_count": 500},
        ]
    }

    report = engine.run(manuscript, outline, {})

    assert report["passed"] == False
    assert "word" in str(report["issues"]).lower()


def test_qa_report_json_structure():
    from src.pipeline.qa_engine import QAEngine

    engine = QAEngine()
    report = engine.run({"chapters": []}, {"chapters": []}, {})

    assert "issues" in report
    assert "scores" in report
    assert "passed" in report


def test_qa_word_count_error_message_uses_config_tolerance(tmp_path):
    """The word count error message should reflect the configured tolerance value, not hardcode ±20%."""
    import inspect
    from src.pipeline.qa_engine import QAEngine

    source = inspect.getsource(QAEngine)
    assert (
        "±20%" not in source
    ), "Hardcoded ±20% found — should use f-string with tolerance variable"
