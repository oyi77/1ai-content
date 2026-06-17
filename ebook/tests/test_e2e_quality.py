"""End-to-end quality tests: verify the QA pipeline accepts good prose and rejects AI slop."""

import pytest
import json
from unittest.mock import MagicMock

# Professional prose that should PASS all quality checks
PROFESSIONAL_PROSE = """
The most effective leaders share one counterintuitive trait: they listen more than they speak.
In study after study, teams led by quiet, attentive managers outperform those run by charismatic talkers.
Why? Because listening creates the psychological safety that unlocks honest feedback.
When your team knows you hear them, they bring you problems before they become crises.
Start this week by holding a thirty-minute one-on-one with no agenda except to ask questions.

Consider Sarah, a regional director who inherited a team with forty percent turnover.
She spent her first month doing nothing but listening to frontline staff, customers, and data nobody had read.
By month three, she had a clear picture of three fixable problems her predecessor had missed entirely.
Her team's turnover dropped to eight percent within a year, not because she was smarter, but because she paid attention.

The technique is simple but requires discipline. Block your calendar for focused listening sessions.
Turn off notifications. Ask open-ended questions and resist the urge to jump in with solutions.
Your job in these sessions is to understand, not to fix.
The fixing comes later, and it will be far more accurate because of what you learned.

Most organizations have feedback mechanisms that look good on paper but fail in practice.
Annual performance reviews arrive too late to change anything meaningful.
Suggestion boxes collect dust. Town halls become one-way broadcasts.
The problem is not the format but the frequency and the follow-through.
People stop sharing when they see their input disappear without acknowledgment.

Listening at scale requires systems, not just intentions. Build a weekly cadence of brief check-ins.
Use structured questions so you gather comparable data over time.
Ask the same three questions every week: What is working? What is blocked? What do you need from me?
The consistency matters as much as the questions themselves.
""".strip()

# AI slop that should FAIL quality checks
AI_SLOP_PROSE = """
Moreover, in today's fast-paced world, it is worth noting that leadership is a pivotal and
comprehensive endeavor that fosters robust synergy across all dynamic organizational landscapes.
Furthermore, it is important to note that delving into the tapestry of modern business requires
a nuanced understanding of the cutting-edge paradigm shifts that are groundbreaking in nature.
Additionally, as we explore these meticulous frameworks, it becomes evident that the innovative
nexus of leadership and management showcases a profound tapestry of interconnected synergies.
Needless to say, these comprehensive and robust methodologies are pivotal for success.
Moreover, the vibrant and compelling landscape of leadership is intricate and seamlessly dynamic.
Furthermore, robust frameworks serve as pivotal pillars that underscore groundbreaking paradigms.
In conclusion, the realm of leadership is indeed a tapestry of nuanced and meticulous synergies.
""".strip()


def test_prose_scorer_passes_professional_prose():
    """ProseScorer must give a high score to professional, varied prose."""
    from src.pipeline.prose_scorer import ProseScorer

    scorer = ProseScorer()
    result = scorer.score(PROFESSIONAL_PROSE)
    assert result.score >= 0.6, f"Professional prose scored too low: {result.score}"
    assert (
        result.slop_hit_count < 3
    ), f"Professional prose flagged as AI slop: slop_hit_count={result.slop_hit_count}"


def test_prose_scorer_flags_ai_slop():
    """ProseScorer must give a low score to AI slop prose."""
    from src.pipeline.prose_scorer import ProseScorer

    scorer = ProseScorer()
    result = scorer.score(AI_SLOP_PROSE)
    assert result.score < 0.7, f"AI slop prose scored too high: {result.score}"
    assert (
        result.slop_hit_count > 3
    ), f"AI slop not detected: slop_hit_count={result.slop_hit_count}"
    slop_hits = result.details.get("slop_hits", [])
    assert len(slop_hits) > 3, f"Too few slop phrases detected: {slop_hits}"


def test_qa_engine_passes_professional_chapter():
    """QA engine must pass a chapter written in professional prose."""
    from src.pipeline.qa_engine import QAEngine

    engine = QAEngine()

    manuscript = {
        "chapters": [
            {
                "chapter": 1,
                "title": "The Listening Leader",
                "word_count": len(PROFESSIONAL_PROSE.split()),
                "content": f"# The Listening Leader\n\n{PROFESSIONAL_PROSE}\n\n## Action Steps\n\n- Do this\n\n## Chapter Summary\n\nSummary here.",
            }
        ]
    }
    outline = {
        "title": "Quality Test Ebook",
        "chapters": [
            {"number": 1, "title": "The Listening Leader", "estimated_word_count": 400}
        ],
    }
    strategy = {"tone": "professional", "language": "en"}

    report = engine.run(manuscript, outline, strategy)

    assert isinstance(report, dict)
    assert "scores" in report
    prose_score = report["scores"].get("prose_quality", 0)
    assert prose_score >= 0.5, f"Professional prose got prose_quality={prose_score}"


def test_qa_engine_fails_ai_slop_chapter():
    """QA engine must give a lower prose score to a chapter full of AI slop patterns."""
    from src.pipeline.qa_engine import QAEngine

    engine = QAEngine()

    manuscript = {
        "chapters": [
            {
                "chapter": 1,
                "title": "Chapter One",
                "word_count": len(AI_SLOP_PROSE.split()),
                "content": f"# Chapter One\n\n{AI_SLOP_PROSE}",
            }
        ]
    }
    outline = {
        "title": "Quality Test Ebook",
        "chapters": [
            {"number": 1, "title": "Chapter One", "estimated_word_count": 200}
        ],
    }
    strategy = {"tone": "professional", "language": "en"}

    report = engine.run(manuscript, outline, strategy)

    assert isinstance(report, dict)
    prose_score = report["scores"].get("prose_quality", 1.0)
    assert prose_score < 0.8, f"AI slop prose should score below 0.8, got {prose_score}"


def test_prose_scores_differ_significantly():
    """Professional prose must score meaningfully higher than AI slop."""
    from src.pipeline.prose_scorer import ProseScorer

    scorer = ProseScorer()
    good_result = scorer.score(PROFESSIONAL_PROSE)
    slop_result = scorer.score(AI_SLOP_PROSE)
    assert (
        good_result.score > slop_result.score
    ), f"Professional prose ({good_result.score}) should outscore AI slop ({slop_result.score})"
