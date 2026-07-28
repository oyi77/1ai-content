from __future__ import annotations

import re
from dataclasses import dataclass, field
from collections import Counter


@dataclass
class ProseScorerResult:
    score: float
    flesch_score: float
    passive_ratio: float
    slop_hit_count: int
    repetition_ratio: float
    details: dict = field(default_factory=dict)


# AI slop phrases to penalise
_SLOP_PHRASES = [
    "delve",
    "it's worth noting",
    "it is worth noting",
    "in conclusion",
    "as we explore",
    "in today's fast-paced world",
    "it is important to note",
    "furthermore",
    "moreover",
    "additionally",
    "needless to say",
    "tapestry",
    "synergy",
    "synergies",
    "paradigm shift",
    "cutting-edge",
    "groundbreaking",
    "robust",
    "pivotal",
    "comprehensive",
    "nuanced",
    "meticulous",
    "innovative nexus",
    "seamlessly",
]

# Passive voice pattern: "was/were/is/are/been + past participle"
_PASSIVE_RE = re.compile(
    r"\b(was|were|is|are|been|be|being)\s+\w+ed\b",
    re.IGNORECASE,
)

_SENTENCE_SPLIT_RE = re.compile(r"[.!?]+")


def _split_sentences(text: str) -> list[str]:
    parts = _SENTENCE_SPLIT_RE.split(text)
    return [s.strip() for s in parts if len(s.strip()) > 5]


def _flesch_reading_ease(text: str) -> float:
    """Compute Flesch Reading Ease via textstat."""
    import textstat

    return textstat.flesch_reading_ease(text)


def _passive_ratio(text: str) -> float:
    sentences = _split_sentences(text)
    if not sentences:
        return 0.0
    passive_count = sum(1 for s in sentences if _PASSIVE_RE.search(s))
    return passive_count / len(sentences)


def _slop_hit_count(text: str) -> tuple[int, list[str]]:
    lower = text.lower()
    hits = [p for p in _SLOP_PHRASES if p in lower]
    return len(hits), hits


def _repetition_ratio(text: str) -> float:
    """Ratio of top-3 most-common content words to total word count."""
    words = re.findall(r"\b[a-z]{4,}\b", text.lower())
    if not words:
        return 0.0
    stopwords = {
        "that",
        "this",
        "with",
        "from",
        "they",
        "have",
        "been",
        "were",
        "their",
        "there",
        "which",
        "when",
        "what",
        "will",
        "would",
        "could",
        "should",
        "after",
        "before",
        "more",
        "also",
        "into",
        "than",
        "then",
        "some",
        "each",
        "about",
        "over",
        "your",
        "just",
        "because",
    }
    content = [w for w in words if w not in stopwords]
    if not content:
        return 0.0
    counts = Counter(content)
    top3_count = sum(v for _, v in counts.most_common(3))
    return top3_count / len(content)


class ProseScorer:
    """Score prose quality using readability, passive voice, slop detection, and repetition."""

    def __init__(
        self,
        flesch_min: float = 40.0,
        passive_max: float = 0.3,
        slop_max: int = 2,
        repetition_max: float = 0.2,
    ) -> None:
        self.flesch_min = flesch_min
        self.passive_max = passive_max
        self.slop_max = slop_max
        self.repetition_max = repetition_max

    def score(self, text: str) -> ProseScorerResult:
        flesch = _flesch_reading_ease(text)
        passive = _passive_ratio(text)
        slop_count, slop_hits = _slop_hit_count(text)
        repetition = _repetition_ratio(text)

        # Each dimension contributes up to 0.25 to the overall score
        flesch_score = min(1.0, max(0.0, (flesch - 0) / 100)) * 0.25
        # Invert passive: 0 passive = full score
        passive_score = max(0.0, 1.0 - passive / max(self.passive_max, 0.01)) * 0.25
        passive_score = min(0.25, passive_score)
        # Slop: 0 hits = full score, each hit reduces proportionally
        slop_score = max(0.0, 1.0 - slop_count / max(self.slop_max * 3, 1)) * 0.25
        # Repetition: lower is better
        rep_score = (
            max(0.0, 1.0 - repetition / max(self.repetition_max * 2, 0.01)) * 0.25
        )

        total = round(flesch_score + passive_score + slop_score + rep_score, 4)
        total = max(0.0, min(1.0, total))

        details = {
            "flesch_score": round(flesch, 2),
            "passive_ratio": round(passive, 4),
            "slop_hit_count": slop_count,
            "slop_hits": slop_hits,
            "repetition_ratio": round(repetition, 4),
        }

        return ProseScorerResult(
            score=total,
            flesch_score=round(flesch, 2),
            passive_ratio=round(passive, 4),
            slop_hit_count=slop_count,
            repetition_ratio=round(repetition, 4),
            details=details,
        )
