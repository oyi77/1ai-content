from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

from services.ebook.ai_client import OmnirouteClient
from services.ebook.i18n.languages import language_instruction

if TYPE_CHECKING:
    from services.ebook.pipeline.pipeline_profile import PipelineProfile


class OutlineGenerator:
    def __init__(
        self,
        ai_client: OmnirouteClient | None = None,
        projects_dir: Path | str = "projects",
    ):
        self.ai_client = ai_client or OmnirouteClient()
        self.projects_dir = Path(projects_dir)

    def generate(
        self,
        project_brief: dict,
        strategy: dict,
        chapter_count: int,
        profile: PipelineProfile | None = None,
    ) -> dict:
        idea = project_brief.get("idea", "")
        target_language = project_brief.get("target_language", "en")

        system_prompt = f"""You are an expert ebook outline generator. Create compelling titles and chapter structure.

For the ebook idea: {idea}
Target audience: {strategy.get("audience", "")}
Tone: {strategy.get("tone", "conversational")}
Positioning: {strategy.get("positioning", "")}

Generate 3 title options, 3 subtitle options, and select the best ones.
Create {chapter_count} chapters with summaries, subchapters, and estimated word counts.
Each chapter should target 1500-2500 words minimum.

Return JSON with:
- titles: list of 3 title options
- subtitles: list of 3 subtitle options
- best_title: the selected title
- best_subtitle: the selected subtitle
- chapters: list of chapters with title, summary, subchapters (list of objects with "title" (string) and "summary" (1-sentence description)), estimated_word_count

{language_instruction(target_language)}"""

        if profile and getattr(profile, "is_fiction", False):
            system_prompt += (
                "\n\nFor this novel, also include:\n"
                "- character_sheets: list of major characters with name, role, description, and arc\n"
                "- act_structure: the narrative arc (setup/rising_action/climax/falling_action/resolution)\n"
                "For each chapter, add a 'narrative_purpose' field explaining its role in the story arc."
            )

        prompt = f"Generate outline for {chapter_count} chapters in {target_language}."

        response_schema = {
            "titles": list,
            "subtitles": list,
            "best_title": str,
            "best_subtitle": str,
            "chapters": [
                {
                    "title": str,
                    "summary": str,
                    "subchapters": [{"title": str, "summary": str}],
                    "estimated_word_count": int,
                }
            ],
        }

        outline = self.ai_client.generate_structured(
            prompt=prompt,
            system_prompt=system_prompt,
            response_schema=response_schema,
        )

        self._save_outline(project_brief["id"], outline)
        return outline

    def _save_outline(self, project_id: int, outline: dict) -> None:
        project_dir = self.projects_dir / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)

        with open(project_dir / "outline.json", "w") as f:
            json.dump(outline, f, indent=2)

        with open(project_dir / "toc.md", "w") as f:
            f.write(f"# {outline.get('best_title', 'Untitled')}\n\n")
            f.write(f"*{outline.get('best_subtitle', '')}*\n\n")
            f.write("---\n\n## Table of Contents\n\n")
            for i, chapter in enumerate(outline.get("chapters", []), 1):
                f.write(f"{i}. **{chapter.get('title', '')}**  \n")
                f.write(f"   _{chapter.get('summary', '')}_\n")
                for sub in chapter.get("subchapters", []):
                    if isinstance(sub, dict):
                        f.write(f"   - {sub.get('title', sub)}\n")
                    else:
                        f.write(f"   - {sub}\n")
                f.write("\n")
