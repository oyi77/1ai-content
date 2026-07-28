from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

from services.ebook.ai_client import OmnirouteClient
from services.ebook.i18n.languages import language_instruction
from services.ebook.logger import get_logger
from services.ebook.pipeline.style_guide import StyleGuide

if TYPE_CHECKING:
    from services.ebook.pipeline.pipeline_profile import PipelineProfile

logger = get_logger(__name__)


class StrategyPlanner:
    def __init__(
        self,
        ai_client: OmnirouteClient | None = None,
        projects_dir: Path | str = "projects",
    ):
        self.ai_client = ai_client or OmnirouteClient()
        self.projects_dir = Path(projects_dir)

    def generate(
        self, project_brief: dict, profile: PipelineProfile | None = None
    ) -> dict:
        product_mode = project_brief.get("product_mode", "lead_magnet")
        target_language = project_brief.get("target_language", "en")
        idea = project_brief.get("idea", "")

        system_prompt = self._build_system_prompt(product_mode, target_language)
        prompt = self._build_prompt(idea, target_language)

        response_schema = {
            "audience": str,
            "pain_points": list,
            "promise": str,
            "positioning": str,
            "tone": str,
            "goal": str,
        }

        if product_mode in ("novel", "short_story"):
            response_schema.update(
                {
                    "protagonist": str,
                    "antagonist": str,
                    "setting": str,
                    "central_conflict": str,
                    "narrative_arc": str,
                    "genre": str,
                    "pov": str,
                }
            )
        elif product_mode == "memoir":
            response_schema.update(
                {
                    "time_period": str,
                    "central_theme": str,
                    "narrative_arc": str,
                    "emotional_journey": str,
                }
            )
        elif product_mode == "how_to_guide":
            response_schema.update(
                {
                    "skill_level": str,
                    "prerequisites": str,
                    "end_result": str,
                }
            )
        elif product_mode == "textbook":
            response_schema.update(
                {
                    "subject": str,
                    "academic_level": str,
                    "learning_objectives": str,
                }
            )
        elif product_mode == "academic_paper":
            response_schema.update(
                {
                    "research_question": str,
                    "methodology": str,
                    "field": str,
                    "citation_style": str,
                }
            )
        elif profile and getattr(profile, "is_fiction", False):
            response_schema.update(
                {
                    "protagonist": str,
                    "antagonist": str,
                    "setting": str,
                    "central_conflict": str,
                    "narrative_arc": str,
                    "genre": str,
                }
            )

        strategy = self.ai_client.generate_structured(
            prompt=prompt,
            system_prompt=system_prompt,
            response_schema=response_schema,
        )

        self._save_strategy(project_brief["id"], strategy)

        style_guide = self._generate_style_guide(strategy)
        self._save_style_guide(project_brief["id"], style_guide)

        return {**strategy, "style_guide": style_guide}

    def _generate_style_guide(self, strategy: dict) -> StyleGuide:
        audience = strategy.get("audience", "")
        voice_anchor = (
            f"A professional who wants practical, actionable guidance"
            if not audience
            else audience
        )

        raw_tone = strategy.get("tone", "conversational").lower()
        tone_map = {
            "conversational": ["direct", "warm", "clear", "practical"],
            "professional": ["authoritative", "precise", "credible", "confident"],
            "academic": ["rigorous", "thorough", "evidence-based"],
        }
        tone_adjectives = tone_map.get(raw_tone, ["engaging", "clear", "accessible"])

        gold_standard_paragraph = ""
        topic = strategy.get("promise", strategy.get("goal", "this topic"))
        try:
            result = self.ai_client.generate_text(
                prompt=f"Write a single 3-sentence paragraph in the {raw_tone} voice about {topic}. This is the gold standard voice for the entire ebook. No headings. Just prose.",
                system_prompt="You are an expert writing coach. Write exactly 3 sentences of prose with no headings or lists.",
            )
            if isinstance(result, str):
                gold_standard_paragraph = result
        except Exception as exc:
            logger.info("Could not generate gold standard paragraph", error=str(exc))

        return StyleGuide(
            voice_anchor=voice_anchor,
            tone_adjectives=tone_adjectives,
            gold_standard_paragraph=gold_standard_paragraph,
        )

    def _save_style_guide(self, project_id: int, style_guide: StyleGuide) -> None:
        project_dir = self.projects_dir / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        style_guide_file = project_dir / "style_guide.json"
        import dataclasses

        data = dataclasses.asdict(style_guide)
        # tuple is not JSON-serializable; convert to list
        data["sentence_length_range"] = list(data["sentence_length_range"])
        with open(style_guide_file, "w") as f:
            json.dump(data, f, indent=2)

    def _build_system_prompt(
        self, product_mode: str, target_language: str = "en"
    ) -> str:
        mode_context = {
            "lead_magnet": "free content to build an email list",
            "paid_ebook": "premium paid nonfiction content",
            "bonus_content": "bonus material for existing customers",
            "authority": "thought leadership and authority-positioning content",
            "novel": "a full-length fiction novel with characters and narrative arc",
            "short_story": "a short fiction story (5,000–20,000 words) with a tight single arc",
            "memoir": "a personal memoir in narrative nonfiction form, written in first person",
            "how_to_guide": "a practical step-by-step how-to guide with numbered procedures and actionable instructions",
            "textbook": "an educational textbook with learning objectives, concept explanations, examples, and review exercises",
            "academic_paper": "a formal academic paper following APA 7th edition structure: abstract, introduction, literature review, methodology, results, discussion, conclusion, and references",
        }
        mode_instructions = {
            "memoir": "\n\nFor memoir: the strategy must emphasize first-person narrative voice, specific scenes over generalizations, and an emotional arc that transforms the narrator.",
            "how_to_guide": "\n\nFor how-to guide: every chapter must produce a tangible outcome. Use action verbs for all steps. Include prerequisites and expected result per chapter.",
            "textbook": "\n\nFor textbook: each chapter must open with explicit learning objectives and close with review questions and exercises. Use progressive complexity across chapters.",
            "academic_paper": "\n\nFor academic paper: tone must be formal, objective, and evidence-based. Structure must follow IMRaD convention. Citation style defaults to APA 7th unless specified.",
            "short_story": "\n\nFor short story: the entire arc must resolve within the word count. Every scene must advance plot or reveal character. Avoid subplots that cannot be resolved.",
        }
        extra = mode_instructions.get(product_mode, "")
        return f"""You are an expert book strategist. Generate a strategy for a book that serves as {mode_context.get(product_mode, "content")}.{extra}

Return a JSON object with these fields:
- audience: Target audience description
- pain_points: List of key pain points the audience faces
- promise: The main promise/value proposition
- positioning: How the ebook positions itself in the market
- tone: Writing tone (e.g., conversational, authoritative, friendly)
- goal: The ebook's conversion goal

{language_instruction(target_language)}"""

    def _build_prompt(self, idea: str, target_language: str) -> str:
        return f"""Create a comprehensive strategy for an ebook with this idea: {idea}

Target language: {target_language}

Generate the strategy as JSON."""

    def _save_strategy(self, project_id: int, strategy: dict) -> None:
        project_dir = self.projects_dir / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        strategy_file = project_dir / "strategy.json"
        with open(strategy_file, "w") as f:
            json.dump(strategy, f, indent=2)
