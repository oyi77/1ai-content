from __future__ import annotations
import json
from pathlib import Path

from src.ai_client import OmnirouteClient
from src.logger import get_logger

logger = get_logger(__name__)

FORMAT_CONVENTIONS = {
    "manga": "Japanese manga conventions: RTL page order, B&W with screen tones, expressive chibi reactions",
    "manhwa": "Korean manhwa webtoon: LTR, full color, vertical scroll panels, clean digital art",
    "manhua": "Chinese manhua: LTR, full color webtoon, detailed backgrounds",
    "comics": "Western comics: LTR page layout, bold outlines, cel shading, dynamic superhero poses",
}

PANEL_SCHEMA = {
    "panel_id": str,
    "scene_description": str,
    "characters_present": list,
    "dialogue": list,
    "sfx": list,
    "framing": str,
    "panel_size": str,
}

PAGE_SCHEMA = {"page_number": int, "layout": str, "panels": list}
CHAPTER_SCHEMA = {"number": int, "title": str, "pages": list}
SCRIPT_SCHEMA = {
    "title": str,
    "format": str,
    "characters": list,
    "chapters": list,
}


class ComicsScriptEngine:
    def __init__(
        self,
        ai_client: OmnirouteClient | None = None,
        projects_dir: Path | str = "projects",
    ):
        self.ai_client = ai_client or OmnirouteClient()
        self.projects_dir = Path(projects_dir)

    def generate(self, project_brief: dict, strategy: dict) -> dict:
        product_mode = project_brief.get("product_mode", "manga")
        idea = project_brief.get("idea", "")
        chapter_count = project_brief.get("chapter_count", 3)
        pages_per_chapter = project_brief.get("pages_per_chapter", 8)
        layout = project_brief.get("panel_layout", "2x2")

        format_style = FORMAT_CONVENTIONS.get(
            product_mode, FORMAT_CONVENTIONS["comics"]
        )
        audience = strategy.get("audience", "general readers")

        system_prompt = self._build_system_prompt(product_mode, format_style)

        # Characters first
        char_prompt = f"""Create a list of main characters for a {product_mode} story about: {idea}
Audience: {audience}

Return JSON with key "characters", a list of objects each with: name (str), visual_description (str), role (str: protagonist|antagonist|supporting)."""
        char_data = self.ai_client.generate_structured(
            prompt=char_prompt,
            system_prompt=system_prompt,
            response_schema={"characters": list},
        )
        characters = char_data.get("characters", [])

        # Generate script chapter by chapter
        chapters = []
        for ch_num in range(1, chapter_count + 1):
            ch_script = self._generate_chapter_script(
                chapter_num=ch_num,
                idea=idea,
                characters=characters,
                pages_per_chapter=pages_per_chapter,
                layout=layout,
                system_prompt=system_prompt,
                product_mode=product_mode,
            )
            chapters.append(ch_script)

        script = {
            "title": strategy.get("promise", idea[:50]),
            "format": product_mode,
            "characters": characters,
            "chapters": chapters,
        }

        self._save_script(project_brief["id"], script)
        return script

    def _generate_chapter_script(
        self,
        chapter_num: int,
        idea: str,
        characters: list,
        pages_per_chapter: int,
        layout: str,
        system_prompt: str,
        product_mode: str,
    ) -> dict:
        char_names = [c.get("name", "") for c in characters]
        prompt = f"""Generate chapter {chapter_num} script for a {product_mode} about: {idea}
Characters: {', '.join(char_names)}
Pages: {pages_per_chapter} pages, layout: {layout} per page.

Return JSON with: number (int), title (str), pages (list).
Each page: page_number (int), layout ("{layout}"), panels (list).
Each panel: panel_id (str like "ch{chapter_num}-p<page>-pan<n>"), scene_description (str), characters_present (list of names), dialogue (list of {{character: str, text: str, is_sfx: bool}}), sfx (list of str), framing (str: wide_shot|close_up|medium|over_shoulder|extreme_close_up), panel_size (str: normal|large|splash)."""

        chapter_data = self.ai_client.generate_structured(
            prompt=prompt,
            system_prompt=system_prompt,
            response_schema=CHAPTER_SCHEMA,
            max_tokens=8192,
        )
        # Ensure required keys
        if "number" not in chapter_data:
            chapter_data["number"] = chapter_num
        if "title" not in chapter_data:
            chapter_data["title"] = f"Chapter {chapter_num}"
        if "pages" not in chapter_data:
            chapter_data["pages"] = []
        return chapter_data

    def _build_system_prompt(self, product_mode: str, format_style: str) -> str:
        return f"""You are a professional comics/manga scriptwriter.
Format: {product_mode}
Style conventions: {format_style}

Write vivid scene descriptions suitable for an artist to draw from. Each panel must have clear visual composition, character staging, and emotional beats. Dialogue should be brief and punchy — comics panels have limited space."""

    def _save_script(self, project_id: int, script: dict) -> None:
        project_dir = self.projects_dir / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        script_file = project_dir / "script.json"
        with open(script_file, "w") as f:
            json.dump(script, f, indent=2)
