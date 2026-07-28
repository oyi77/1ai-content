import pytest
from services.ebook.pipeline.qa_engine import QAEngine


@pytest.fixture
def qa():
    return QAEngine()


def test_prose_quality_clean_chapter(qa):
    # Well-structured chapter with varied sentences and required sections
    content = (
        "The framework works. It solves a specific problem that most developers encounter daily. "
        "Here's the key insight you need to understand before proceeding.\n\n"
        "### Chapter Summary\n\n- Key point one\n- Key point two\n\n"
        "### Action Steps\n\n1. Do this first\n2. Then do this\n3. Finally do that"
    )
    result = qa._check_prose_quality(content, language="en")
    assert result["skipped"] == False
    assert result["prose_quality"] >= 0.7


def test_prose_quality_detects_banned_phrases(qa):
    content = (
        "Let us delve into this topic. Furthermore, it is important to note that "
        "additionally we should explore.\n\n"
        "### Chapter Summary\n\n- point\n\n### Action Steps\n\n1. step"
    )
    result = qa._check_prose_quality(content, language="en")
    assert len(result["details"]["banned_phrases_found"]) >= 2
    assert result["prose_quality"] < 0.9


def test_prose_quality_detects_abstract_opener(qa):
    content = (
        "In today's fast-paced world, everything is changing rapidly. We must adapt."
    )
    result = qa._check_prose_quality(content, language="en")
    assert result["details"]["has_abstract_opener"] == True
    assert result["prose_quality"] < 0.9


def test_prose_quality_skips_non_english(qa):
    result = qa._check_prose_quality(
        "Halo dunia ini adalah teks Bahasa Indonesia.", language="id"
    )
    assert result["skipped"] == True
    assert result["prose_quality"] is None


def test_prose_quality_architecture_check(qa):
    # Chapter with action steps and summary should score better than without
    with_structure = (
        "Some content here. More content follows. This is the third sentence.\n\n"
        "### Chapter Summary\n\n- point\n\n### Action Steps\n\n1. Do it"
    )
    without_structure = (
        "Some content here. More content. No structure at all. "
        "Just sentences. No sections anywhere."
    )
    score_with = qa._check_prose_quality(with_structure)["prose_quality"]
    score_without = qa._check_prose_quality(without_structure)["prose_quality"]
    assert score_with > score_without


def test_prose_quality_returns_details_dict(qa):
    content = "Simple clean content. No issues here. Third sentence."
    result = qa._check_prose_quality(content, language="en")
    assert "details" in result
    details = result["details"]
    assert "banned_phrases_found" in details
    assert "has_abstract_opener" in details
    assert "has_action_steps" in details
    assert "has_summary" in details


def test_prose_quality_no_banned_phrases_when_clean(qa):
    content = (
        "This chapter covers practical techniques. You will learn specific methods. "
        "Each method solves a real problem.\n\n"
        "### Chapter Summary\n\n- Method A\n\n### Action Steps\n\n1. Apply method A"
    )
    result = qa._check_prose_quality(content, language="en")
    assert result["details"]["banned_phrases_found"] == []


def test_prose_quality_score_between_zero_and_one(qa):
    content = (
        "delve furthermore additionally moreover needless to say. "
        "In today's fast-paced world everything is the same. Same length sentence repeated. "
        "Same length sentence repeated. Same length sentence repeated."
    )
    result = qa._check_prose_quality(content, language="en")
    assert 0.0 <= result["prose_quality"] <= 1.0
