from __future__ import annotations

import json
from pathlib import Path
from typing import TYPE_CHECKING

from PIL import Image, ImageDraw, ImageFont

from services.ebook.ai_client import OmnirouteClient
from services.ebook.config import get_config
from services.ebook.logger import get_logger

logger = get_logger(__name__)

if TYPE_CHECKING:
    from services.ebook.pipeline.pipeline_profile import PipelineProfile


class CoverGenerator:
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
        topic: str,
        tone: str,
        product_mode: str = "lead_magnet",
        profile: "PipelineProfile | None" = None,
    ) -> dict:
        try:
            prompt = self.generate_prompt(title, topic, tone, product_mode)
        except Exception as e:
            error_type = type(e).__name__
            context = {
                "operation": "cover_prompt_generation",
                "project_id": project_id,
                "title": title,
            }
            logger.warning(
                "Cover prompt generation failed, using fallback",
                error=str(e),
                error_type=error_type,
                context=context,
                severity="warning",
            )
            prompt = f"A professional ebook cover for '{title}'. Clean, modern design."

        project_dir = self.projects_dir / str(project_id) / "cover"
        project_dir.mkdir(parents=True, exist_ok=True)

        with open(project_dir / "prompt.txt", "w") as f:
            f.write(prompt)

        # Try AI image generation; fall back to HTML cover (Playwright), then Pillow
        image_method = "pillow"
        try:
            image_bytes = self.ai_client.generate_image(prompt)
            with open(project_dir / "cover.png", "wb") as f:
                f.write(image_bytes)
            image_method = "ai"
        except (RuntimeError, Exception) as e:
            error_type = type(e).__name__
            context = {
                "operation": "ai_image_generation",
                "project_id": project_id,
                "title": title,
            }
            logger.warning(
                "AI image generation failed, falling back to HTML/Pillow cover",
                error=str(e),
                error_type=error_type,
                context=context,
                severity="warning",
            )
            try:
                from services.ebook.cover.html_cover_generator import HTMLCoverGenerator

                cover_path = project_dir / "cover.png"
                html_gen = HTMLCoverGenerator()
                html_gen.generate(
                    title=title,
                    subtitle="",
                    author="AI Generated",
                    product_mode=product_mode,
                    output_path=cover_path,
                )
                logger.info("cover_generated_html", path=str(cover_path))
                image_method = "html"
            except Exception as html_err:
                error_type_html = type(html_err).__name__
                context_html = {
                    "operation": "html_cover_generation",
                    "project_id": project_id,
                    "title": title,
                }
                logger.warning(
                    "HTML cover generation failed, falling back to Pillow",
                    error=str(html_err),
                    error_type=error_type_html,
                    context=context_html,
                    severity="warning",
                )
                html_ok = self._generate_html_cover(
                    project_dir, title, topic, tone, product_mode
                )
                if not html_ok:
                    self._generate_cover_image(project_dir, title, product_mode)
                image_method = "html_ai" if html_ok else "pillow"

        with open(project_dir / "brief.json", "w") as f:
            json.dump(
                {
                    "title": title,
                    "topic": topic,
                    "tone": tone,
                    "product_mode": product_mode,
                    "prompt": prompt,
                    "method": image_method,
                },
                f,
                indent=2,
            )

        return {"cover": project_dir / "cover.png", "prompt": prompt}

    def generate_prompt(
        self,
        title: str,
        topic: str,
        tone: str,
        product_mode: str,
    ) -> str:
        system_prompt = f"""You are a creative cover designer. Generate an abstract visual description for an ebook cover.

Product mode: {product_mode}
- lead_magnet: clean, accessible, eye-catching
- paid_ebook: professional, premium, sophisticated
- bonus_content: warm, inviting, value-focused
- authority: authoritative, expert, credible

Generate a concise visual description (1-2 sentences) for an abstract cover image.

Return only the description, no explanations."""

        prompt = f"Ebook title: {title}\nTopic: {topic}\nTone: {tone}"

        response = self.ai_client.generate_text(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=200,
            temperature=0.8,
        )

        return response

    def _generate_html_cover(
        self,
        project_dir: Path,
        title: str,
        topic: str,
        tone: str,
        product_mode: str,
    ) -> bool:
        system_prompt = (
            "You are an expert web designer. Generate a stunning, professional ebook cover as a "
            "single self-contained HTML file with inline CSS only (no external dependencies, no CDN links). "
            "The cover must be exactly 1200x1600px, with the title prominently displayed using modern design: "
            "gradients, beautiful typography, and strong visual hierarchy. "
            "Return ONLY the raw HTML string, no explanation, no markdown, no code fences."
        )
        prompt = f"Create an ebook cover for:\nTitle: {title}\nTopic: {topic}\nTone: {tone}\nStyle: {product_mode}"
        try:
            html = self.ai_client.generate_text(
                prompt=prompt,
                system_prompt=system_prompt,
                max_tokens=2000,
                temperature=0.7,
            )
        except Exception as e:
            error_type = type(e).__name__
            context = {
                "operation": "html_cover_ai_generation",
                "title": title,
            }
            logger.warning(
                "HTML cover AI generation failed",
                error=str(e),
                error_type=error_type,
                context=context,
                severity="warning",
            )
            return False

        html_path = project_dir / "cover.html"
        with open(html_path, "w") as f:
            f.write(html)

        # Try playwright first
        try:
            from playwright.sync_api import sync_playwright

            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 1200, "height": 1600})
                page.set_content(html)
                page.screenshot(
                    path=str(project_dir / "cover.png"),
                    clip={"x": 0, "y": 0, "width": 1200, "height": 1600},
                )
                browser.close()
            return True
        except Exception as e:
            error_type = type(e).__name__
            context = {
                "operation": "playwright_cover_render",
                "title": title,
            }
            logger.info(
                "Playwright cover render failed, trying weasyprint",
                error=str(e),
                error_type=error_type,
                context=context,
                severity="info",
            )

        # Try weasyprint as fallback
        try:
            import weasyprint

            weasyprint.HTML(string=html).write_png(str(project_dir / "cover.png"))
            return True
        except Exception as e:
            error_type = type(e).__name__
            context = {
                "operation": "weasyprint_cover_render",
                "title": title,
            }
            logger.info(
                "Weasyprint cover render failed",
                error=str(e),
                error_type=error_type,
                context=context,
                severity="info",
            )

        return False

    def _find_font(self, name: str, size: int):
        candidates = [
            f"/usr/share/fonts/truetype/dejavu/{name}",
            f"/usr/share/fonts/dejavu/{name}",
            "/System/Library/Fonts/Helvetica.ttc",
            "C:/Windows/Fonts/arial.ttf",
        ]
        for path in candidates:
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
        return ImageFont.load_default()

    def _generate_cover_image(
        self,
        project_dir: Path,
        title: str,
        product_mode: str,
    ) -> None:
        colors = {
            "lead_magnet": (59, 130, 246),
            "paid_ebook": (30, 64, 175),
            "bonus_content": (34, 197, 94),
            "authority": (107, 33, 168),
            "novel": (180, 60, 80),
        }

        bg_color = colors.get(product_mode, (59, 130, 246))
        cfg = get_config()
        width, height = cfg.cover_width, cfg.cover_height

        # Draw subtle gradient by blending base color with a lighter shade row by row
        img = Image.new("RGB", (width, height), bg_color)
        draw = ImageDraw.Draw(img)

        r, g, b = bg_color
        light_r = min(255, r + 60)
        light_g = min(255, g + 60)
        light_b = min(255, b + 60)

        for y in range(height):
            t = y / height  # 0.0 at top, 1.0 at bottom
            row_r = int(light_r * (1 - t) + r * t)
            row_g = int(light_g * (1 - t) + g * t)
            row_b = int(light_b * (1 - t) + b * t)
            draw.line([(0, y), (width, y)], fill=(row_r, row_g, row_b))

        # Draw thin white border (4px) inside image edges
        border = 4
        draw.rectangle(
            [border, border, width - border - 1, height - border - 1],
            outline=(255, 255, 255),
            width=border,
        )

        font_large = self._find_font("DejaVuSans-Bold.ttf", cfg.cover_title_font_size)
        font_small = self._find_font("DejaVuSans.ttf", cfg.cover_watermark_font_size)

        bbox = draw.textbbox((0, 0), title, font=font_large)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]

        x = (width - text_width) // 2
        y = (height - text_height) // 2

        draw.text((x, y), title, fill=(255, 255, 255), font=font_large)

        # Watermark at bottom
        watermark = "AI-Generated Content"
        wm_bbox = draw.textbbox((0, 0), watermark, font=font_small)
        wm_width = wm_bbox[2] - wm_bbox[0]
        wm_x = (width - wm_width) // 2
        draw.text(
            (wm_x, height - 80), watermark, fill=(255, 255, 255, 180), font=font_small
        )

        img.save(project_dir / "cover.png")
