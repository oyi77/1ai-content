import re
from dataclasses import dataclass, field


@dataclass
class ChapterStructureResult:
    has_narrative_hook: bool  # first paragraph is NOT a meta-description
    h2_count: int  # target: 2–8
    has_case_study: bool  # H2 or paragraph with "case study|example|story"
    prohibited_openers: list  # banned opening phrases detected
    structure_score: float  # 0.0–1.0


class ChapterStructureChecker:
    PROHIBITED_OPENERS = [
        r"^In this chapter(?:,?\s+we will)?",
        r"^This chapter (?:covers|explores|discusses|will cover|will explore)",
        r"^As we (?:discussed|saw|learned|explored) in the previous chapter",
        r"^\w[\w\s]{0,20} is defined as",
        r"^In today\'s",
        r"^Welcome to chapter",
    ]

    CASE_STUDY_PATTERNS = [
        r"(?i)##\s+.*(?:case study|example|story|scenario)",
        r"(?i)case study",
        r"(?i)\b(?:consider|meet|take|imagine)\s+\w+,?\s+(?:a|an|the)\s+\w+",
        r"(?i)(?:situation|complication|action|result)",
    ]

    def check(self, chapter_text: str) -> ChapterStructureResult:
        # Count H2 headings
        h2_count = len(re.findall(r"^##\s+", chapter_text, re.MULTILINE))

        # Check prohibited openers — look at first non-empty paragraph
        paragraphs = [p.strip() for p in chapter_text.split("\n\n") if p.strip()]
        # Skip the H1 title line for opener check
        opener_text = ""
        for para in paragraphs:
            if not para.startswith("#"):
                opener_text = para
                break

        prohibited_openers = []
        for pattern in self.PROHIBITED_OPENERS:
            if re.search(pattern, opener_text, re.IGNORECASE | re.MULTILINE):
                prohibited_openers.append(pattern)

        # Narrative hook: opener exists and is NOT a prohibited opener
        has_narrative_hook = bool(opener_text) and len(prohibited_openers) == 0

        # Case study detection
        has_case_study = any(
            re.search(p, chapter_text) for p in self.CASE_STUDY_PATTERNS
        )

        # Score: weight each element
        score = 1.0
        if not has_narrative_hook:
            score -= 0.25
        if h2_count < 2:
            score -= 0.30
        elif h2_count > 8:
            score -= 0.20
        if not has_case_study:
            score -= 0.15
        if prohibited_openers:
            score -= 0.20
        score = max(0.0, min(1.0, score))

        return ChapterStructureResult(
            has_narrative_hook=has_narrative_hook,
            h2_count=h2_count,
            has_case_study=has_case_study,
            prohibited_openers=prohibited_openers,
            structure_score=score,
        )
