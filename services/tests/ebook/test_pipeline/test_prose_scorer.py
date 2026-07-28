import pytest
from services.ebook.pipeline.prose_scorer import ProseScorer, ProseScorerResult

CLEAN_PROSE = """
The most effective leaders share one counterintuitive trait: they listen more than they speak.
In study after study, teams led by quiet, attentive managers outperform those run by charismatic talkers.
Why? Because listening creates the psychological safety that unlocks honest feedback.
When your team knows you hear them, they bring you problems before they become crises.
Start this week by holding a thirty-minute one-on-one with no agenda except to ask questions.

Consider Sarah, a regional director who inherited a team with forty percent turnover.
She spent her first month doing nothing but listening — to frontline staff, to customers, to the data nobody had read in years.
By month three, she had a clear picture of three fixable problems that her predecessor had missed entirely.
Her team's turnover dropped to eight percent within a year, not because she was smarter, but because she paid attention.

The technique is simple but requires discipline. Block your calendar for focused listening sessions.
Turn off notifications. Ask open-ended questions and resist the urge to jump in with solutions.
Your job in these sessions is to understand, not to fix.
The fixing comes later, and it will be far more accurate because of what you learned.
"""

SLOP_PROSE = """
Moreover, in today's fast-paced world, it is worth noting that leadership is a pivotal and
comprehensive endeavor that fosters robust synergy across all dynamic organizational landscapes.
Furthermore, it is important to note that delving into the tapestry of modern business requires
a nuanced understanding of the cutting-edge paradigm shifts that are groundbreaking in nature.
Additionally, as we explore these meticulous frameworks, it becomes evident that the innovative
nexus of leadership and management showcases a profound tapestry of interconnected synergies.
Needless to say, these comprehensive and robust methodologies are pivotal for success.
In conclusion, the landscape of leadership is intricate, vibrant, and seamlessly dynamic.
"""

PASSIVE_PROSE = """
The report was written by the committee after the meeting was held by the board.
The decision was made by the manager and the policy was implemented by the team.
The results were analyzed by the researchers and the findings were presented by the director.
The budget was approved by the council and the funds were allocated by the treasurer.
The project was completed by the engineers and the review was conducted by the auditors.
"""

REPETITIVE_PROSE = " ".join(
    ["the manager said the manager told the manager asked the manager replied"] * 50
)


class TestProseScorerResult:
    def test_result_is_dataclass_or_namedtuple(self):
        result = ProseScorerResult(
            score=0.85,
            flesch_score=65.0,
            passive_ratio=0.1,
            slop_hit_count=0,
            repetition_ratio=0.05,
            details={},
        )
        assert result.score == 0.85
        assert result.flesch_score == 65.0
        assert result.passive_ratio == 0.1
        assert result.slop_hit_count == 0
        assert result.repetition_ratio == 0.05
        assert result.details == {}


class TestProseScorerInit:
    def test_default_init(self):
        scorer = ProseScorer()
        assert scorer is not None

    def test_custom_thresholds(self):
        scorer = ProseScorer(
            flesch_min=50.0, passive_max=0.2, slop_max=3, repetition_max=0.15
        )
        assert scorer.flesch_min == 50.0
        assert scorer.passive_max == 0.2
        assert scorer.slop_max == 3
        assert scorer.repetition_max == 0.15


class TestFleschScore:
    def test_clean_prose_has_good_flesch(self):
        scorer = ProseScorer()
        result = scorer.score(CLEAN_PROSE)
        # Flesch reading ease >= 40 for clean non-fiction prose
        assert result.flesch_score >= 40.0

    def test_slop_prose_flesch_is_lower(self):
        scorer = ProseScorer()
        clean_result = scorer.score(CLEAN_PROSE)
        slop_result = scorer.score(SLOP_PROSE)
        # Clean prose should have higher or equal readability
        assert clean_result.flesch_score >= slop_result.flesch_score - 5


class TestPassiveVoiceDetection:
    def test_passive_prose_has_high_passive_ratio(self):
        scorer = ProseScorer()
        result = scorer.score(PASSIVE_PROSE)
        assert result.passive_ratio >= 0.4

    def test_clean_prose_has_low_passive_ratio(self):
        scorer = ProseScorer()
        result = scorer.score(CLEAN_PROSE)
        assert result.passive_ratio <= 0.3


class TestSlopDetection:
    def test_slop_prose_has_many_slop_hits(self):
        scorer = ProseScorer()
        result = scorer.score(SLOP_PROSE)
        assert result.slop_hit_count >= 3

    def test_clean_prose_has_few_slop_hits(self):
        scorer = ProseScorer()
        result = scorer.score(CLEAN_PROSE)
        assert result.slop_hit_count <= 1


class TestRepetitionDetection:
    def test_repetitive_prose_has_high_repetition(self):
        scorer = ProseScorer()
        result = scorer.score(REPETITIVE_PROSE)
        assert result.repetition_ratio >= 0.3

    def test_clean_prose_has_low_repetition(self):
        scorer = ProseScorer()
        result = scorer.score(CLEAN_PROSE)
        assert result.repetition_ratio <= 0.2


class TestOverallScore:
    def test_clean_prose_scores_high(self):
        scorer = ProseScorer()
        result = scorer.score(CLEAN_PROSE)
        assert result.score >= 0.7

    def test_slop_prose_scores_low(self):
        scorer = ProseScorer()
        result = scorer.score(SLOP_PROSE)
        assert result.score <= 0.6

    def test_score_bounded_zero_to_one(self):
        scorer = ProseScorer()
        for text in [CLEAN_PROSE, SLOP_PROSE, PASSIVE_PROSE, REPETITIVE_PROSE]:
            result = scorer.score(text)
            assert 0.0 <= result.score <= 1.0

    def test_details_dict_present(self):
        scorer = ProseScorer()
        result = scorer.score(CLEAN_PROSE)
        assert isinstance(result.details, dict)
