from __future__ import annotations
import json
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Optional


@dataclass
class Character:
    name: str
    visual_description: str
    role: str  # "protagonist|antagonist|supporting"


class CharacterSheet:
    def __init__(self):
        self._characters: dict[str, Character] = {}

    def build_from_script(self, script: dict) -> None:
        for char_data in script.get("characters", []):
            name = char_data.get("name", "")
            if name:
                self._characters[name] = Character(
                    name=name,
                    visual_description=char_data.get("visual_description", ""),
                    role=char_data.get("role", "supporting"),
                )

    def get_panel_prompt_context(self, characters_present: list[str]) -> str:
        descriptions = []
        for name in characters_present:
            char = self._characters.get(name)
            if char and char.visual_description:
                descriptions.append(f"{char.name}: {char.visual_description}")
        if not descriptions:
            return ""
        return "Characters: " + "; ".join(descriptions)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {name: asdict(char) for name, char in self._characters.items()}
        path.write_text(json.dumps(data, indent=2))

    def load(self, path: Path) -> None:
        data = json.loads(path.read_text())
        self._characters = {}
        for name, char_data in data.items():
            self._characters[name] = Character(**char_data)

    @property
    def characters(self) -> dict[str, Character]:
        return dict(self._characters)
