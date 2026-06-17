from __future__ import annotations
import json
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass
class StyleContext:
    tone: str
    vocabulary_level: str = "general"  # "simple", "general", "technical"
    recurring_terms: list[str] = field(default_factory=list)
    characters: list[dict] = field(default_factory=list)  # populated for novel mode
    previous_chapter_ending: str = ""  # last 400 chars of previous chapter
    recurring_metaphors: list = field(default_factory=list)
    established_terminology: dict = field(default_factory=dict)

    def save(self, path: Path | str) -> None:
        """Persist StyleContext to disk after each chapter."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w") as f:
            json.dump(asdict(self), f, indent=2)

    @classmethod
    def load(cls, path: Path | str) -> "StyleContext":
        """Load StyleContext from disk."""
        with open(Path(path)) as f:
            data = json.load(f)
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})

    @classmethod
    def load_or_default(cls, path: Path | str, **defaults) -> "StyleContext":
        """Load from disk if exists, else return default instance."""
        try:
            return cls.load(path)
        except (FileNotFoundError, Exception):
            return cls(**defaults)

    def to_prompt_block(self) -> str:
        lines = [
            f"Tone: {self.tone}",
            f"Vocabulary level: {self.vocabulary_level}",
        ]
        if self.recurring_terms:
            lines.append(
                f"Key terms to use consistently: {', '.join(self.recurring_terms)}"
            )
        if self.characters:
            summaries = [
                f"{c['name']} ({c.get('role', 'character')}): {c.get('description', '')[:50]}"
                for c in self.characters
            ]
            lines.append(f"Characters: {'; '.join(summaries)}")
        if self.previous_chapter_ending:
            lines.append(f'Previous chapter ended: "{self.previous_chapter_ending}"')
        return "\n".join(lines)
