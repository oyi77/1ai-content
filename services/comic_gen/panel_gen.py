"""
Panel Generator — Generate panel images via AI image APIs.

Fallback chain:
1. OmniRoute image endpoint (if available)
2. AgentCash stablestudio (if configured)
3. Placeholder (colored panel with scene description text)
"""

import asyncio
import base64
import io
import json
import os
from pathlib import Path
from typing import Optional

import httpx

from services.comic_gen.comic_types import ComicFormat, Panel, PanelShape

# ── Try OmniRoute image endpoint ──────────────────────────────────────

OMNIROUTE_BASE = os.environ.get("OMNIROUTE_URL", "http://localhost:8000")
OMNIROUTE_IMAGE_MODEL = os.environ.get(
    "OMNIROUTE_IMAGE_MODEL", "black-forest-labs/flux-1-dev"
)


async def _try_omniroute(
    scene_description: str,
    style_hint: str,
    shape: PanelShape,
) -> Optional[bytes]:
    """Generate panel image via OmniRoute. Returns PNG bytes or None."""
    width, height = _shape_dimensions(shape)
    prompt = _build_image_prompt(scene_description, style_hint)

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{OMNIROUTE_BASE}/v1/images/generations",
                json={
                    "model": OMNIROUTE_IMAGE_MODEL,
                    "prompt": prompt,
                    "n": 1,
                    "size": f"{width}x{height}",
                    "response_format": "b64_json",
                },
                headers={"Authorization": f"Bearer {os.environ.get('OMNIROUTE_KEY', '')}"},
            )
            if resp.status_code != 200:
                return None
            data = resp.json()
            b64 = data["data"][0]["b64_json"]
            return base64.b64decode(b64)
    except Exception:
        return None


# ── AgentCash fallback ─────────────────────────────────────────────────

AGENTCASH_BASE = "https://stablestudio.dev"
AGENTCASH_MODEL = os.environ.get("AGENTCASH_IMAGE_MODEL", "stable-diffusion-3.5-large")


async def _try_agentcash(
    scene_description: str,
    style_hint: str,
    shape: PanelShape,
) -> Optional[bytes]:
    """Generate panel image via AgentCash stablestudio. Returns PNG bytes or None."""
    width, height = _shape_dimensions(shape)
    prompt = _build_image_prompt(scene_description, style_hint)

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            # Step 1: submit generation job
            resp = await client.post(
                f"{AGENTCASH_BASE}/api/v1/images/generations",
                json={
                    "model": AGENTCASH_MODEL,
                    "prompt": prompt,
                    "width": width,
                    "height": height,
                    "response_format": "url",
                },
            )
            if resp.status_code != 200:
                return None
            result = resp.json()

            # Step 2: poll for completion (if async)
            job_id = result.get("id")
            if job_id:
                for _ in range(30):
                    await asyncio.sleep(2)
                    poll = await client.get(
                        f"{AGENTCASH_BASE}/api/v1/jobs/{job_id}",
                    )
                    if poll.status_code != 200:
                        break
                    status = poll.json().get("status")
                    if status == "completed":
                        image_url = poll.json()["output"]["url"]
                        break
                    elif status in ("failed", "error"):
                        return None
                else:
                    return None  # timeout
            else:
                # Sync response — direct image URL
                image_url = result["data"][0]["url"]

            # Download image
            img_resp = await client.get(image_url)
            if img_resp.status_code == 200:
                return img_resp.content
    except Exception:
        return None
    return None


# ── Placeholder fallback ───────────────────────────────────────────────

from PIL import Image, ImageDraw, ImageFont


def _shape_dimensions(shape: PanelShape) -> tuple[int, int]:
    """Return (width, height) for a panel shape."""
    dims = {
        PanelShape.WIDE: (400, 225),
        PanelShape.SQUARE: (300, 300),
        PanelShape.TALL: (250, 350),
        PanelShape.FULL: (400, 600),
    }
    return dims.get(shape, (300, 300))


_SHAPE_COLORS = {
    PanelShape.WIDE: (60, 80, 120),
    PanelShape.SQUARE: (80, 60, 100),
    PanelShape.TALL: (100, 70, 60),
    PanelShape.FULL: (50, 60, 80),
}


def _build_image_prompt(scene_description: str, style_hint: str) -> str:
    """Combine scene desc + style hint into an image prompt."""
    parts = [scene_description]
    if style_hint:
        parts.append(f"Style: {style_hint}")
    return ". ".join(parts)


def _get_font(size: int = 14) -> ImageFont.FreeTypeFont:
    """Try to load a TrueType font; fall back to default."""
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/TTF/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def _draw_wrapped_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    x: int,
    y: int,
    max_width: int,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
) -> None:
    """Draw text with word wrapping."""
    lines = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        line = ""
        for word in words:
            test = f"{line} {word}".strip()
            bbox = draw.textbbox((0, 0), test, font=font)
            w = bbox[2] - bbox[0]
            if w > max_width and line:
                lines.append(line)
                line = word
            else:
                line = test
        if line:
            lines.append(line)
    for i, line in enumerate(lines):
        draw.text((x, y + i * (font.size + 2)), line, fill=fill, font=font)


def _render_placeholder(
    panel: Panel,
    shape: PanelShape,
    style_hint: str,
) -> Image.Image:
    """Render a colored placeholder image with scene description text."""
    width, height = _shape_dimensions(shape)
    img = Image.new("RGB", (width, height), _SHAPE_COLORS.get(shape, (80, 80, 80)))
    draw = ImageDraw.Draw(img)

    font = _get_font(11)
    margin = 8

    # Scene description
    text = panel.scene_description or "Empty panel"
    _draw_wrapped_text(draw, text, margin, margin, width - 2 * margin, font, (220, 220, 220))

    # Dialogue
    y_offset = height // 2
    for bubble in panel.dialogue:
        dialog_text = f"{bubble.speaker}: {bubble.text}"
        _draw_wrapped_text(
            draw, dialog_text, margin, y_offset,
            width - 2 * margin, font, (255, 255, 200),
        )
        y_offset += (len(dialog_text.split("\n")) + 1) * (font.size + 2)

    # Narration in dark overlay at bottom
    if panel.narration:
        y_offset = height - 40
        draw.rectangle([(0, y_offset - 4), (width, height)], fill=(0, 0, 0))
        _draw_wrapped_text(
            draw, f"[{panel.narration}]", margin, y_offset,
            width - 2 * margin, font, (200, 200, 100),
        )

    return img


# ── Public API ─────────────────────────────────────────────────────────

async def generate_panel_image(
    panel: Panel,
    fmt: ComicFormat,
    style_hint: str = "",
) -> Image.Image:
    """Generate an image for a single panel.

    Tries OmniRoute → AgentCash → Placeholder fallback.
    Always returns a PIL Image.
    """
    scene = panel.scene_description

    # Try OmniRoute
    img_bytes = await _try_omniroute(scene, style_hint, panel.shape)
    if img_bytes:
        return Image.open(io.BytesIO(img_bytes))

    # Try AgentCash
    img_bytes = await _try_agentcash(scene, style_hint, panel.shape)
    if img_bytes:
        return Image.open(io.BytesIO(img_bytes))

    # Placeholder fallback
    return _render_placeholder(panel, panel.shape, style_hint)
