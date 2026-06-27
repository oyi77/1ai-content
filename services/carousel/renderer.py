#!/usr/bin/env python3
"""
Slide Renderer — Renders carousel slides as images using Pillow.

Generates visually appealing slides with text overlay, icons,
and platform-optimized dimensions for TikTok/Instagram.

Usage:
    from services.carousel.renderer import SlideRenderer
    renderer = SlideRenderer()
    paths = renderer.render_slides(slides_data, output_dir="/tmp/carousel")
"""

import os
import textwrap
from pathlib import Path
from typing import Optional

try:
    from PIL import Image, ImageDraw, ImageFont
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

# Platform resolutions
RESOLUTIONS = {
    "tiktok": (1080, 1920),
    "instagram": (1080, 1350),
    "square": (1080, 1080),
}

# Style color palettes
STYLE_PALETTES = {
    "outline": {
        "backgrounds": ["#1a1a2e", "#16213e", "#0f3460", "#533483", "#1a1a2e", "#16213e", "#0f3460"],
        "text": "#ffffff",
        "accent": "#e94560",
        "subtitle": "#e0e0e0",
    },
    "educational": {
        "backgrounds": ["#0d6efd", "#6610f2", "#d63384", "#fd7e14", "#20c997", "#0dcaf0", "#6c757d"],
        "text": "#ffffff",
        "accent": "#ffc107",
        "subtitle": "#e0e0e0",
    },
    "storytelling": {
        "backgrounds": ["#2d1b69", "#11998e", "#38ef7d", "#fc5c7d", "#6c5ce7", "#a29bfe", "#fd79a8"],
        "text": "#ffffff",
        "accent": "#ffd700",
        "subtitle": "#d0d0d0",
    },
    "minimal": {
        "backgrounds": ["#ffffff", "#f8f9fa", "#e9ecef", "#dee2e6", "#ced4da", "#adb5bd", "#6c757d"],
        "text": "#212529",
        "accent": "#dc3545",
        "subtitle": "#6c757d",
    },
    "bold": {
        "backgrounds": ["#ff6b6b", "#feca57", "#48dbfb", "#ff9ff3", "#54a0ff", "#5f27cd", "#01a3a4"],
        "text": "#ffffff",
        "accent": "#2d3436",
        "subtitle": "#f0f0f0",
    },
    "dark": {
        "backgrounds": ["#0d0d0d", "#1a1a1a", "#2d2d2d", "#404040", "#141414", "#1e1e1e", "#333333"],
        "text": "#e0e0e0",
        "accent": "#00ff88",
        "subtitle": "#888888",
    },
}


class SlideRenderer:
    """Render carousel slides as PNG images."""

    def __init__(self, font_dir: Optional[str] = None):
        self.font_dir = font_dir or "/usr/share/fonts"
        self._fonts = {}

    def render_slides(
        self,
        slides: list[dict],
        output_dir: str,
        platform: str = "tiktok",
        style: str = "outline",
        title: str = "",
    ) -> list[str]:
        """
        Render all slides to PNG files.

        Args:
            slides: List of slide dicts with headline, body, icon, type
            output_dir: Directory to save rendered images
            platform: Target platform (tiktok, instagram, square)
            style: Visual style preset
            title: Carousel title (used for cover slide)

        Returns:
            List of file paths to rendered PNG images
        """
        if not HAS_PIL:
            return self._fallback_text_slides(slides, output_dir)

        os.makedirs(output_dir, exist_ok=True)
        resolution = RESOLUTIONS.get(platform, RESOLUTIONS["tiktok"])
        palette = STYLE_PALETTES.get(style, STYLE_PALETTES["outline"])
        paths = []

        for i, slide in enumerate(slides):
            output_path = os.path.join(output_dir, f"slide_{i:02d}.png")
            self._render_single_slide(
                slide=slide,
                output_path=output_path,
                resolution=resolution,
                palette=palette,
                slide_index=i,
                total_slides=len(slides),
                title=title,
            )
            paths.append(output_path)

        return paths

    def _render_single_slide(
        self,
        slide: dict,
        output_path: str,
        resolution: tuple,
        palette: dict,
        slide_index: int,
        total_slides: int,
        title: str,
    ) -> None:
        """Render a single slide to PNG."""
        width, height = resolution
        bg_colors = palette.get("backgrounds", ["#1a1a2e"])
        bg_color = bg_colors[slide_index % len(bg_colors)]

        img = Image.new("RGB", (width, height), bg_color)
        draw = ImageDraw.Draw(img)

        # Load fonts
        font_title = self._get_font(72)
        font_body = self._get_font(42)
        font_small = self._get_font(32)
        font_icon = self._get_font(120)

        text_color = palette.get("text", "#ffffff")
        accent_color = palette.get("accent", "#e94560")
        subtitle_color = palette.get("subtitle", "#b8b8d0")

        slide_type = slide.get("type", "content")
        headline = slide.get("headline", "")
        body = slide.get("body", "")
        icon = slide.get("icon", "")
        cta = slide.get("cta", "")

        padding = 80
        y_cursor = 200

        # ── Slide number indicator (top-right) ──
        indicator = f"{slide_index + 1}/{total_slides}"
        draw.text((width - padding - 100, 60), indicator, fill=subtitle_color, font=font_small)

        # ── Icon (centered, top area) ──
        if icon:
            icon_bbox = draw.textbbox((0, 0), icon, font=font_icon)
            icon_w = icon_bbox[2] - icon_bbox[0]
            draw.text(((width - icon_w) // 2, y_cursor), icon, fill=text_color, font=font_icon)
            y_cursor += 180

        # ── Accent line ──
        line_y = y_cursor
        line_width = 200
        draw.rectangle(
            [(width // 2 - line_width // 2, line_y), (width // 2 + line_width // 2, line_y + 6)],
            fill=accent_color,
        )
        y_cursor += 60

        if slide_type == "cover":
            # ── Cover slide: big title ──
            display_text = headline or title
            wrapped = textwrap.wrap(display_text, width=18)
            for line in wrapped[:4]:
                bbox = draw.textbbox((0, 0), line, font=font_title)
                tw = bbox[2] - bbox[0]
                draw.text(((width - tw) // 2, y_cursor), line, fill=text_color, font=font_title)
                y_cursor += 100

            if body:
                y_cursor += 20
                wrapped_body = textwrap.wrap(body, width=30)
                for line in wrapped_body[:3]:
                    bbox = draw.textbbox((0, 0), line, font=font_body)
                    tw = bbox[2] - bbox[0]
                    draw.text(((width - tw) // 2, y_cursor), line, fill=subtitle_color, font=font_body)
                    y_cursor += 60

        elif slide_type == "closing":
            # ── Closing slide: CTA ──
            wrapped = textwrap.wrap(headline, width=18)
            for line in wrapped[:3]:
                bbox = draw.textbbox((0, 0), line, font=font_title)
                tw = bbox[2] - bbox[0]
                draw.text(((width - tw) // 2, y_cursor), line, fill=text_color, font=font_title)
                y_cursor += 100

            if cta:
                y_cursor += 40
                # CTA button background
                cta_bbox = draw.textbbox((0, 0), cta, font=font_body)
                cta_w = cta_bbox[2] - cta_bbox[0]
                cta_h = cta_bbox[3] - cta_bbox[1]
                btn_pad = 30
                btn_x = (width - cta_w) // 2 - btn_pad
                draw.rounded_rectangle(
                    [(btn_x, y_cursor), (btn_x + cta_w + btn_pad * 2, y_cursor + cta_h + btn_pad * 2)],
                    radius=20,
                    fill=accent_color,
                )
                draw.text(((width - cta_w) // 2, y_cursor + btn_pad), cta, fill="#ffffff", font=font_body)

        else:
            # ── Content slide ──
            wrapped = textwrap.wrap(headline, width=20)
            for line in wrapped[:3]:
                bbox = draw.textbbox((0, 0), line, font=font_title)
                tw = bbox[2] - bbox[0]
                draw.text(((width - tw) // 2, y_cursor), line, fill=text_color, font=font_title)
                y_cursor += 100

            if body:
                y_cursor += 30
                wrapped_body = textwrap.wrap(body, width=28)
                for line in wrapped_body[:6]:
                    bbox = draw.textbbox((0, 0), line, font=font_body)
                    tw = bbox[2] - bbox[0]
                    draw.text(((width - tw) // 2, y_cursor), line, fill=subtitle_color, font=font_body)
                    y_cursor += 60

        # ── Brand watermark (bottom) ──
        watermark = "Made with 1AI Content"
        wm_bbox = draw.textbbox((0, 0), watermark, font=font_small)
        wm_w = wm_bbox[2] - wm_bbox[0]
        draw.text(((width - wm_w) // 2, height - 100), watermark, fill=subtitle_color, font=font_small)

        img.save(output_path, "PNG", quality=95)

    def _get_font(self, size: int):
        """Get a font, falling back to default if not available."""
        cache_key = size
        if cache_key in self._fonts:
            return self._fonts[cache_key]

        font = None
        font_paths = [
            os.path.join(self.font_dir, "truetype/dejavu/DejaVuSans-Bold.ttf"),
            os.path.join(self.font_dir, "truetype/liberation/LiberationSans-Bold.ttf"),
            os.path.join(self.font_dir, "truetype/noto/NotoSans-Bold.ttf"),
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ]

        for fp in font_paths:
            if os.path.exists(fp):
                try:
                    font = ImageFont.truetype(fp, size)
                    break
                except Exception:
                    continue

        if font is None:
            font = ImageFont.load_default()

        self._fonts[cache_key] = font
        return font

    def _fallback_text_slides(self, slides: list[dict], output_dir: str) -> list[str]:
        """Fallback when PIL is not available — save slide data as JSON."""
        os.makedirs(output_dir, exist_ok=True)
        import json
        output_path = os.path.join(output_dir, "slides_data.json")
        with open(output_path, "w") as f:
            json.dump(slides, f, indent=2, ensure_ascii=False)
        return [output_path]
