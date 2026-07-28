from __future__ import annotations
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from services.ebook.config import PipelineConfig


@dataclass
class StyleGuide:
    voice_anchor: str = ""
    pov: str = "second-person"
    banned_phrases: list = field(
        default_factory=lambda: [
            # Original set
            "delve",
            "it's worth noting",
            "in conclusion",
            "as we explore",
            "in today's fast-paced world",
            "it is important to note",
            "furthermore",
            "moreover",
            "additionally",
            "needless to say",
            "in today's world",
            "it is worth noting",
            # New additions
            "tapestry",
            "landscape",
            "realm",
            "notably",
            "indeed",
            "it should be noted",
            "in summary",
            "serves as",
            "stands as",
            "fosters",
            "underscores",
            "showcases",
            "bolsters",
            "garners",
            "enhances",
            "pivotal",
            "crucial",
            "robust",
            "comprehensive",
            "meticulous",
            "intricate",
            "nuanced",
            "profound",
            "groundbreaking",
            "cutting-edge",
            "innovative",
            "let's explore",
            "we will explore",
            "in this chapter we will",
            "this chapter covers",
            "it goes without saying",
            "thereby fostering",
            "not just",
            "synergy",
            "nexus",
            "paradigm shift",
            "game-changer",
            "vibrant",
            "compelling",
            "seamlessly",
        ]
    )
    sentence_length_range: tuple = field(default_factory=lambda: (12, 18))
    tone_adjectives: list = field(default_factory=list)
    gold_standard_paragraph: str = ""
    readability_target: dict = field(
        default_factory=lambda: {
            "nonfiction": {"fre_min": 60, "fre_max": 75, "fog_max": 13},
            "academic": {"fre_min": 30, "fre_max": 50, "fog_max": 18},
            "fiction": {"fre_min": 70, "fre_max": 80, "fog_max": 11},
        }
    )
    passive_voice_threshold: float = 0.10
    paragraph_max_sentences: int = 8

    def to_system_prompt_block(self, tier: str = "medium") -> str:
        """Return a formatted style constraint block for injection into system prompts.

        tier: 'small' = minimal (banned phrases + tone only)
               'medium' = standard
               'large' = full including gold standard paragraph
        """
        lines = ["## Style Guide (MUST FOLLOW)"]

        # Always include banned phrases
        lines.append(
            f"BANNED phrases (never use): {', '.join(self.banned_phrases[:8])}"
        )

        # Always include POV
        lines.append(f"POV: {self.pov} ('you', not 'one' or 'the reader')")

        if tier in ("medium", "large"):
            if self.tone_adjectives:
                lines.append(f"Tone: {', '.join(self.tone_adjectives)}")
            if self.voice_anchor:
                lines.append(f"Reader profile: {self.voice_anchor}")
            lines.append(
                f"Sentence length: avg {self.sentence_length_range[0]}–{self.sentence_length_range[1]} words; vary rhythm (short punchy sentences after long ones)"
            )

        if tier == "large" and self.gold_standard_paragraph:
            lines.append(
                f"\nVoice reference paragraph:\n{self.gold_standard_paragraph}"
            )

        if tier == "large":
            nf = self.readability_target["nonfiction"]
            lines.append(
                f"Target Flesch Reading Ease of {nf['fre_min']}–{nf['fre_max']} (grade level 8–11). "
                "Use short sentences for emphasis and vary sentence length."
            )

        lines.append(
            "NEVER start chapters with 'In today's world', 'As we explore', or 'It is important to note'."
        )
        return "\n".join(lines)

    def detect_violations(self, text: str) -> tuple[list[str], float]:
        """Return (violations, density) where density = violations_count / (word_count / 500)."""
        violations = [p for p in self.banned_phrases if p.lower() in text.lower()]
        word_count = len(text.split()) or 1
        density = len(violations) / (word_count / 500)
        return violations, density
