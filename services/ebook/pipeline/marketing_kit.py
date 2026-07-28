from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import TYPE_CHECKING

from services.ebook.ai_client import OmnirouteClient

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)


class MarketingKitGenerator:
    def __init__(
        self,
        ai_client: OmnirouteClient | None = None,
        projects_dir: Path | str = "projects",
    ):
        self.ai_client = ai_client or OmnirouteClient()
        self.projects_dir = Path(projects_dir)

    def generate(
        self,
        project_id: int,
        title: str,
        strategy: dict,
        outline: dict,
    ) -> dict:
        total_words = sum(
            ch.get("estimated_word_count", 0) for ch in outline.get("chapters", [])
        )
        product_mode = strategy.get("product_mode", "")

        kit: dict = {
            "suggested_price": self._compute_price(product_mode, total_words),
            "book_description": "",
            "keywords": [],
            "ad_hooks": [],
            "social_posts": {"facebook": "", "instagram": "", "tiktok": ""},
            "audience_persona": "",
        }

        try:
            ai_content = self._generate_ai_content(
                title, strategy, outline, total_words
            )
            kit.update(ai_content)
        except Exception as exc:
            logger.warning(
                "MarketingKitGenerator: AI generation failed — returning partial kit. Error: %s",
                exc,
            )

        self._save_kit(project_id, kit)
        return kit

    def _compute_price(self, product_mode: str, total_words: int) -> str:
        if product_mode == "lead_magnet":
            return "Free"
        if product_mode == "paid_ebook":
            if total_words < 10000:
                return "$7.99"
            if total_words < 25000:
                return "$14.99"
            return "$19.99"
        if product_mode == "bonus_content":
            return "$0 (bundled)"
        if product_mode == "authority":
            return "$24.99"
        if product_mode == "novel":
            if total_words < 30000:
                return "$2.99"
            if total_words < 80000:
                return "$4.99"
            return "$9.99"
        return "$9.99"

    def _generate_ai_content(
        self,
        title: str,
        strategy: dict,
        outline: dict,
        total_words: int,
    ) -> dict:
        audience = strategy.get("audience", "")
        tone = strategy.get("tone", "conversational")
        promise = strategy.get("promise", "")
        chapters = outline.get("chapters", [])
        chapter_titles = [ch.get("title", "") for ch in chapters]

        prompt = f"""You are an expert marketing copywriter. Generate marketing assets for an ebook.

Title: {title}
Target audience: {audience}
Tone: {tone}
Core promise: {promise}
Chapters: {", ".join(chapter_titles)}
Total word count: {total_words}

Return a JSON object with these exact keys:
- book_description: 150-200 word Amazon-style sales description
- keywords: list of exactly 5 SEO/ad keywords (strings)
- ad_hooks: list of exactly 3 short punchy ad hook lines for Meta/TikTok
- social_posts: object with keys "facebook", "instagram", "tiktok" each containing a ready-to-post social media caption
- audience_persona: 1-paragraph buyer description
"""

        response_schema = {
            "book_description": str,
            "keywords": list,
            "ad_hooks": list,
            "social_posts": dict,
            "audience_persona": str,
        }

        result = self.ai_client.generate_structured(
            prompt=prompt,
            system_prompt="You are an expert marketing copywriter. Respond with JSON only.",
            response_schema=response_schema,
        )

        return {
            "book_description": result.get("book_description", ""),
            "keywords": result.get("keywords", []),
            "ad_hooks": result.get("ad_hooks", []),
            "social_posts": result.get(
                "social_posts", {"facebook": "", "instagram": "", "tiktok": ""}
            ),
            "audience_persona": result.get("audience_persona", ""),
        }

    def _save_kit(self, project_id: int, kit: dict) -> None:
        project_dir = self.projects_dir / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)
        kit_file = project_dir / "marketing_kit.json"
        with open(kit_file, "w") as f:
            json.dump(kit, f, indent=2)
