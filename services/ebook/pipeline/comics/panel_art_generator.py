from __future__ import annotations
import io
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from services.ebook.ai_client import OmnirouteClient
from services.ebook.pipeline.comics.character_sheet import CharacterSheet
from services.ebook.logger import get_logger

logger = get_logger(__name__)

FORMAT_STYLE_PROMPTS = {
    "manga": "Japanese manga style, black and white, screen tones, detailed line art",
    "manhwa": "Korean manhwa style, full color, clean digital art, webtoon format",
    "manhua": "Chinese manhua style, full color webtoon, detailed backgrounds",
    "comics": "Western comics style, bold outlines, cel shading, vibrant colors",
}


class PanelArtGenerator:
    def __init__(
        self,
        ai_client: OmnirouteClient | None = None,
        max_workers: int = 4,
    ):
        self.ai_client = ai_client or OmnirouteClient()
        self.max_workers = max_workers

    def generate_page_panels(
        self,
        page: dict,
        character_sheet: CharacterSheet,
        style: str,
        panels_dir: Path,
    ) -> dict[str, Path]:
        panels = page.get("panels", [])
        style_prompt = FORMAT_STYLE_PROMPTS.get(style, FORMAT_STYLE_PROMPTS["comics"])
        results: dict[str, Path] = {}

        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = {
                executor.submit(
                    self._generate_one, panel, character_sheet, style_prompt, panels_dir
                ): panel
                for panel in panels
            }
            for future in as_completed(futures):
                panel = futures[future]
                try:
                    path = future.result()
                except Exception as e:
                    logger.warning(
                        "panel_generation_failed",
                        panel_id=panel.get("panel_id"),
                        error=str(e),
                    )
                    path = self._make_placeholder(panel, panels_dir)
                results[panel["panel_id"]] = path

        return results

    def _generate_one(
        self,
        panel: dict,
        character_sheet: CharacterSheet,
        style_prompt: str,
        panels_dir: Path,
    ) -> Path:
        panel_id = panel["panel_id"]
        panel_path = panels_dir / f"{panel_id}.png"

        # Resume-safe: skip if already exists
        if panel_path.exists():
            return panel_path

        char_context = character_sheet.get_panel_prompt_context(
            panel.get("characters_present", [])
        )
        scene = panel.get("scene_description", "")
        framing = panel.get("framing", "medium")
        prompt = f"{scene}. {char_context}. {framing} shot. {style_prompt}. No text, no speech bubbles."

        png_bytes = self.ai_client.generate_image(prompt=prompt)

        # Atomic write
        panels_dir.mkdir(parents=True, exist_ok=True)
        tmp_path = panels_dir / f"{panel_id}.tmp.png"
        tmp_path.write_bytes(png_bytes)
        tmp_path.rename(panel_path)

        return panel_path

    def _make_placeholder(self, panel: dict, panels_dir: Path) -> Path:
        """Create a PIL fallback placeholder — never raises."""
        panel_id = panel.get("panel_id", "unknown")
        panels_dir.mkdir(parents=True, exist_ok=True)
        panel_path = panels_dir / f"{panel_id}.png"

        try:
            img = Image.new("RGB", (400, 300), color=(200, 200, 200))
            draw = ImageDraw.Draw(img)
            scene = panel.get("scene_description", "")[:60]
            draw.text((10, 10), scene, fill=(80, 80, 80))
            draw.text((10, 260), "[AI image unavailable]", fill=(120, 120, 120))
            img.save(panel_path)
        except Exception:
            # Absolute last resort
            Image.new("RGB", (64, 64), color=(200, 200, 200)).save(panel_path)

        return panel_path
