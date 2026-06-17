from __future__ import annotations
from typing import TYPE_CHECKING

from src.logger import get_logger

logger = get_logger(__name__)

if TYPE_CHECKING:
    from src.ai_client import OmnirouteClient


class RefinementEngine:
    def __init__(
        self,
        ai_client: "OmnirouteClient | None" = None,
        language: str = "en",
        tone: str = "conversational",
        quality_level: str = "fast",
    ):
        self.ai_client = ai_client
        self.language = language
        self.tone = tone
        self.quality_level = quality_level

    def refine(self, content: str) -> str:
        """Refine grammar and prose. Returns original when quality_level='fast' or AI unavailable."""
        if self.quality_level != "thorough" or self.ai_client is None:
            return content
        from src.i18n.languages import SUPPORTED_LANGUAGES

        lang_name = SUPPORTED_LANGUAGES.get(self.language, {}).get(
            "name", self.language
        )
        system_prompt = (
            f"You are a professional editor. Improve the grammar and prose of the following text. "
            f"Fix awkward phrasing, ensure {self.tone} tone throughout, and maintain consistent style. "
            f"Write entirely in {lang_name}. Return only the improved text with no commentary."
        )
        try:
            return self.ai_client.generate_text(
                prompt=content,
                system_prompt=system_prompt,
                max_tokens=3000,
                temperature=0.3,
            )
        except Exception as e:
            logger.warning(
                "Refinement failed, returning original content", error=str(e)
            )
            return content
