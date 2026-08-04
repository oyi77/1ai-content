#!/usr/bin/env python3
"""Meme Engine — render impact-style meme PNGs with Pillow only.

Purely local rendering: no network except an *optional* user-supplied image
URL. Layouts come from ``MemeEngine.TEMPLATES`` (pure layout parameters, no
copyrighted images). Unknown template ids fall back to ``"default"``.
"""

import io
import tempfile
import uuid
from pathlib import Path
from typing import Optional

import httpx
from PIL import Image, ImageDraw, ImageFont

CANVAS_W = 800
CANVAS_H = 600
DEFAULT_FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


class MemeEngine:
    """Render top/bottom-text meme PNGs from layout presets."""

    # Layout presets: pure geometry/colors — no image assets.
    TEMPLATES = {
        "default": {
            "name": "Classic Impact",
            "bg": (26, 26, 46),  # #1a1a2e
            "top_y": 20,
            "top_max_h": 130,
            "bottom_y": CANVAS_H - 160,
            "bottom_max_h": 140,
            "text": (255, 255, 255),
            "stroke": (0, 0, 0),
            "sparkles": False,
        },
        "drake": {
            "name": "Drake Split",
            "bg": (22, 22, 22),
            "top_y": 0,
            "top_max_h": CANVAS_H // 2,
            "bottom_y": CANVAS_H // 2,
            "bottom_max_h": CANVAS_H // 2,
            "text": (255, 255, 255),
            "stroke": (0, 0, 0),
            "sparkles": False,
        },
        "distracted": {
            "name": "Distracted",
            "bg": (24, 30, 54),
            "top_y": 30,
            "top_max_h": 160,
            "bottom_y": CANVAS_H - 130,
            "bottom_max_h": 110,
            "text": (255, 255, 255),
            "stroke": (0, 0, 0),
            "sparkles": False,
        },
        "galaxy": {
            "name": "Galaxy Sparkle",
            "bg": (24, 12, 56),
            "top_y": 20,
            "top_max_h": 120,
            "bottom_y": CANVAS_H - 150,
            "bottom_max_h": 130,
            "text": (255, 255, 255),
            "stroke": (0, 0, 0),
            "sparkles": True,
        },
    }

    def __init__(
        self,
        font_path: str = DEFAULT_FONT,
        output_base: Optional[str] = None,
    ):
        self.font_path = font_path
        self.output_base = Path(output_base) if output_base else None

    # ── public API ────────────────────────────────────────────────────────
    def generate(
        self,
        template_id: str = "default",
        top_text: str = "",
        bottom_text: str = "",
        image_url: Optional[str] = None,
        output_dir: Optional[str] = None,
    ) -> dict:
        """Render a meme PNG and return ``{"success": True, ...}``.

        ``image_url`` is downloaded with a 10s timeout and pasted as the
        base image; on any download/decode failure the template background
        color is used instead (never crashes).
        """
        effective_id = template_id if template_id in self.TEMPLATES else "default"
        tpl = self.TEMPLATES[effective_id]

        base = self._load_base_image(tpl, image_url)
        draw = ImageDraw.Draw(base)

        if tpl.get("sparkles"):
            self._draw_sparkles(draw, tpl)

        if top_text:
            self._draw_text_block(
                draw,
                tpl,
                text=top_text,
                region_y=tpl["top_y"],
                region_h=tpl["top_max_h"],
            )
        if bottom_text:
            self._draw_text_block(
                draw,
                tpl,
                text=bottom_text,
                region_y=tpl["bottom_y"],
                region_h=tpl["bottom_max_h"],
            )

        out_dir = Path(output_dir) if output_dir else (
            self.output_base or Path(tempfile.mkdtemp(prefix="meme_"))
        )
        out_dir.mkdir(parents=True, exist_ok=True)
        image_path = out_dir / f"meme_{effective_id}_{uuid.uuid4().hex[:8]}.png"
        base.save(image_path, format="PNG")

        return {
            "success": True,
            "image_path": str(image_path),
            "template_id": effective_id,
            "width": CANVAS_W,
            "height": CANVAS_H,
            "image_url": bool(image_url),
        }

    # ── internals ─────────────────────────────────────────────────────────
    def _load_base_image(self, tpl: dict, image_url: Optional[str]) -> Image.Image:
        """Return an RGB canvas: downloaded image (cover-fit) or bg color."""
        if image_url:
            try:
                with httpx.Client(timeout=10.0, follow_redirects=True) as client:
                    resp = client.get(image_url)
                    resp.raise_for_status()
                img = Image.open(io.BytesIO(resp.content)).convert("RGB")
            except Exception:
                img = None
            if img is not None:
                return self._cover_resize(img)
        return Image.new("RGB", (CANVAS_W, CANVAS_H), tpl["bg"])

    def _cover_resize(self, img: Image.Image) -> Image.Image:
        """Scale to cover the canvas and center-crop, as RGB."""
        img = img.convert("RGB")
        ratio = max(CANVAS_W / img.width, CANVAS_H / img.height)
        new_w = max(1, round(img.width * ratio))
        new_h = max(1, round(img.height * ratio))
        img = img.resize((new_w, new_h), Image.LANCZOS)
        left = (new_w - CANVAS_W) // 2
        top = (new_h - CANVAS_H) // 2
        return img.crop((left, top, left + CANVAS_W, top + CANVAS_H))

    def _load_font(self, size: int) -> ImageFont.ImageFont:
        try:
            return ImageFont.truetype(self.font_path, size=size)
        except Exception:
            try:
                return ImageFont.load_default(size=size)
            except TypeError:  # Pillow < 9.2
                return ImageFont.load_default()

    def _wrap_text(
        self, draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont,
        max_width: int,
    ) -> list:
        words = text.upper().split()
        lines: list = []
        cur = ""
        for word in words:
            trial = f"{cur} {word}".strip() if cur else word
            if draw.textlength(trial, font=font) <= max_width:
                cur = trial
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        return lines or [text.upper()]

    def _fit_text(
        self, draw: ImageDraw.ImageDraw, text: str,
        max_width: int, max_height: int, start_size: int,
    ) -> tuple:
        """Return ``(font, lines)`` with the largest size that fits."""
        size = start_size
        while size >= 16:
            font = self._load_font(size)
            lines = self._wrap_text(draw, text, font, max_width)
            total_h = len(lines) * int(size * 1.25)
            if total_h <= max_height:
                return font, lines
            size -= 4
        font = self._load_font(16)
        return font, self._wrap_text(draw, text, font, max_width)

    def _draw_text_block(
        self, draw: ImageDraw.ImageDraw, tpl: dict,
        text: str, region_y: int, region_h: int,
    ) -> None:
        font, lines = self._fit_text(
            draw, text,
            max_width=CANVAS_W - 48,
            max_height=region_h,
            start_size=64,
        )
        line_h = int(font.size * 1.25)
        total_h = len(lines) * line_h
        y = region_y + max(0, (region_h - total_h) // 2)
        for line in lines:
            draw.text(
                (CANVAS_W // 2, y),
                line,
                font=font,
                fill=tpl["text"],
                stroke_width=2,
                stroke_fill=tpl["stroke"],
                anchor="ma",
            )
            y += line_h

    def _draw_sparkles(self, draw: ImageDraw.ImageDraw, tpl: dict) -> None:
        """Deterministic sparkle accent circles for the galaxy template."""
        spots = [
            (90, 90, 5), (150, 180, 3), (250, 60, 4), (620, 110, 4),
            (700, 200, 5), (560, 250, 3), (120, 420, 4), (660, 430, 3),
            (400, 90, 3), (720, 520, 4),
        ]
        accent = tpl.get("accent", (255, 240, 150))
        for x, y, r in spots:
            draw.ellipse((x - r, y - r, x + r, y + r), fill=accent)
