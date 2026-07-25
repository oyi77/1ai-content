"""
Page Composer — Arrange panels into full comic/manga/manhwa pages using Pillow.

Composes panel images with speech bubbles, borders, and format-specific
layout rules into a final page image.
"""

import io
import math
import os
from pathlib import Path
from typing import Optional

from PIL import Image, ImageDraw, ImageFont, ImageFilter

from services.comic_gen.comic_types import (
    ComicFormat, ComicScript, Episode, Page, Panel, PanelShape, RenderedPage,
)
from services.comic_gen.panel_gen import generate_panel_image, _get_font


# ── Page dimensions per format (px at ~96dpi) ──────────────────────────

_PAGE_DIMS = {
    ComicFormat.COMIC: (636, 984),      # ~6.625×10.25"
    ComicFormat.MANGA: (720, 1020),     # B5-ish
    ComicFormat.MANHWA: (800, 1280),    # mobile screen
}

_PAGE_BG = {
    ComicFormat.COMIC: (255, 255, 255),
    ComicFormat.MANGA: (255, 255, 255),
    ComicFormat.MANHWA: (245, 245, 250),  # slight blue-gray (webtoon bg)
}

_GUTTER = 6          # px between panels
_MARGIN = {
    ComicFormat.COMIC: 20,
    ComicFormat.MANGA: 16,
    ComicFormat.MANHWA: 8,
}


# ── Layout engines ────────────────────────────────────────────────────

def _layout_comic(panels: list[Image.Image], page_w: int, page_h: int) -> Image.Image:
    """Western comic: grid-ish layout, LTR, max ~9 panels."""
    page = Image.new("RGB", (page_w, page_h), _PAGE_BG[ComicFormat.COMIC])
    margin = _MARGIN[ComicFormat.COMIC]
    gutter = _GUTTER

    content_w = page_w - 2 * margin
    content_h = page_h - 2 * margin
    n = len(panels)

    if n <= 1:
        # Splash: single panel
        panel_img = panels[0].resize((content_w, content_h), Image.LANCZOS)
        page.paste(panel_img, (margin, margin))
    else:
        cols = min(3, max(2, math.ceil(n / 2)))
        rows = _distribute_rows(n, cols)
        cell_w = (content_w - (cols - 1) * gutter) // cols
        cell_h = (
            (content_h - (rows - 1) * gutter) // rows
            if rows > 0 else content_h
        )

        # Special: staggered first panel (hero shot)
        _draw_grid(page, panels, cols, rows, cell_w, cell_h, margin, gutter,
                   rtl=False)

    return page


def _layout_manga(panels: list[Image.Image], page_w: int, page_h: int) -> Image.Image:
    """Manga: right-to-left grid, B&W (grayscale output)."""
    page = Image.new("RGB", (page_w, page_h), _PAGE_BG[ComicFormat.MANGA])
    margin = _MARGIN[ComicFormat.MANGA]
    gutter = _GUTTER

    content_w = page_w - 2 * margin
    content_h = page_h - 2 * margin
    n = len(panels)

    if n <= 1:
        panel_img = panels[0].resize((content_w, content_h), Image.LANCZOS)
        page.paste(panel_img, (margin, margin))
    else:
        cols = min(2, max(1, n // 3))
        rows = math.ceil(n / cols) if cols else 1
        cell_w = (content_w - (cols - 1) * gutter) // cols
        cell_h = (content_h - (rows - 1) * gutter) // rows

        # Manga: RTL — fill rightmost column first
        _draw_grid(page, panels, cols, rows, cell_w, cell_h, margin, gutter,
                   rtl=True)

    return page


def _layout_manhwa(panels: list[Image.Image], page_w: int, page_h: int) -> Image.Image:
    """Manhwa: vertical scroll, 1-3 panels fitting page width."""
    page = Image.new("RGB", (page_w, page_h), _PAGE_BG[ComicFormat.MANHWA])
    margin = _MARGIN[ComicFormat.MANHWA]
    gutter = _GUTTER

    content_w = page_w - 2 * margin
    content_h = page_h - 2 * margin
    n = len(panels)

    if n == 0:
        return page

    # Each panel takes full width, stacked vertically
    total_gutter = (n - 1) * gutter
    panel_h = (content_h - total_gutter) // n

    y = margin
    for i, panel_img in enumerate(panels):
        resized = panel_img.resize((content_w, panel_h), Image.LANCZOS)
        page.paste(resized, (margin, y))
        # Thin separator line between panels
        if i < n - 1:
            draw = ImageDraw.Draw(page)
            sep_y = y + panel_h + gutter // 2 - 1
            draw.line(
                [(margin, sep_y), (page_w - margin, sep_y)],
                fill=(200, 200, 200), width=1,
            )
        y += panel_h + gutter

    return page


# ── Helpers ────────────────────────────────────────────────────────────

_LAYOUT_FN = {
    ComicFormat.COMIC: _layout_comic,
    ComicFormat.MANGA: _layout_manga,
    ComicFormat.MANHWA: _layout_manhwa,
}


def _distribute_rows(n: int, cols: int) -> int:
    """Return number of rows needed for n items in cols."""
    if cols == 0:
        return 0
    return math.ceil(n / cols)


def _draw_grid(
    page: Image.Image,
    panels: list[Image.Image],
    cols: int,
    rows: int,
    cell_w: int,
    cell_h: int,
    margin: int,
    gutter: int,
    rtl: bool,
) -> None:
    """Place panel images into a grid, optionally right-to-left."""
    for idx, panel_img in enumerate(panels):
        row = idx // cols
        col = idx % cols

        if rtl:
            col = cols - 1 - col  # manga RTL

        x = margin + col * (cell_w + gutter)
        y = margin + row * (cell_h + gutter)

        resized = panel_img.resize((cell_w, cell_h), Image.LANCZOS)
        page.paste(resized, (x, y))


def _add_borders(
    page: Image.Image,
    fmt: ComicFormat,
    n_panels: int,
) -> Image.Image:
    """Draw panel borders and any format-specific overlays."""
    if n_panels <= 1:
        return page  # splash has no inner borders

    draw = ImageDraw.Draw(page)
    border_color = {
        ComicFormat.COMIC: (30, 30, 30),
        ComicFormat.MANGA: (20, 20, 20),
        ComicFormat.MANHWA: (180, 180, 180),
    }.get(fmt, (0, 0, 0))

    if fmt == ComicFormat.MANHWA:
        # Light separator lines — already handled in layout
        pass
    elif fmt == ComicFormat.COMIC:
        # Thick outer border
        draw.rectangle(
            [_MARGIN[fmt]] * 2,
            [page.width - _MARGIN[fmt], page.height - _MARGIN[fmt]],
            outline=border_color, width=3,
        )
    elif fmt == ComicFormat.MANGA:
        # Thin outer border with black frame
        draw.rectangle(
            [_MARGIN[fmt]] * 2,
            [page.width - _MARGIN[fmt], page.height - _MARGIN[fmt]],
            outline=border_color, width=2,
        )
        # Page number gutter marker on the right edge
        draw.line(
            [(page.width - _MARGIN[fmt] + 2, 0),
             (page.width - _MARGIN[fmt] + 2, page.height)],
            fill=border_color, width=1,
        )

    return page


def _add_speech_bubbles(
    page: Image.Image,
    panels: list[Panel],
    fmt: ComicFormat,
) -> Image.Image:
    """Overlay speech bubbles and narration text on the composed page."""
    draw = ImageDraw.Draw(page)
    font = _get_font(13)
    small_font = _get_font(11)
    margin = _MARGIN[fmt]

    # Approximate positions: overlay bubbles centered in the lower portion
    # of each panel area
    content_w = page.width - 2 * margin
    n = len(panels)

    if fmt == ComicFormat.MANHWA:
        # Vertical scroll: overlay per-panel text
        gutter = _GUTTER
        total_gutter = (n - 1) * gutter if n > 1 else 0
        panel_h = (page.height - 2 * margin - total_gutter) // max(n, 1)

        for i, pnl in enumerate(panels):
            y = margin + i * (panel_h + gutter)
            _draw_panel_text(draw, pnl, margin, y, content_w, panel_h,
                             font, small_font, fmt)
    else:
        cols = min(3, n)
        rows = _distribute_rows(n, cols)
        cell_w = (content_w - (cols - 1) * _GUTTER) // cols
        cell_h = (page.height - 2 * margin - (rows - 1) * _GUTTER) // rows

        for idx, pnl in enumerate(panels):
            row = idx // cols
            col = idx % cols
            x = margin + col * (cell_w + _GUTTER)
            y = margin + row * (cell_h + _GUTTER)
            _draw_panel_text(draw, pnl, x, y, cell_w, cell_h,
                             font, small_font, fmt)

    return page


def _draw_panel_text(
    draw: ImageDraw.ImageDraw,
    panel: Panel,
    x: int, y: int,
    w: int, h: int,
    font: ImageFont.FreeTypeFont,
    small_font: ImageFont.FreeTypeFont,
    fmt: ComicFormat,
) -> None:
    """Render speech bubbles and narration for one panel."""
    pad = 4
    text_color = (0, 0, 0)
    bubble_color = (255, 255, 255)
    border_color = (0, 0, 0)
    narration_color = (220, 220, 180)

    # Narration box at top
    if panel.narration:
        nar_text = f"[{panel.narration}]"
        bbox = draw.textbbox((0, 0), nar_text, font=small_font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        nx = x + w // 2 - tw // 2
        ny = y + pad
        # Semi-transparent background
        draw.rectangle(
            [(nx - pad, ny), (nx + tw + pad, ny + th + pad)],
            fill=(0, 0, 0, 180),
        )
        draw.text((nx, ny), nar_text, fill=narration_color, font=small_font)

    # Dialogue bubbles at bottom
    if panel.dialogue:
        bubble_y = y + h - 60 - pad
        for bubble in panel.dialogue:
            d_text = bubble.text
            if bubble.speaker and bubble.speaker != "NARRATOR":
                d_text = f"{bubble.speaker}: {d_text}"

            bbox = draw.textbbox((0, 0), d_text, font=font)
            tw = bbox[2] - bbox[0]
            th = bbox[3] - bbox[1]
            bx = x + w // 2 - tw // 2 - pad
            by = bubble_y

            # Bubble background
            draw.rounded_rectangle(
                [(bx, by), (bx + tw + 2 * pad, by + th + 2 * pad)],
                radius=6, fill=bubble_color, outline=border_color, width=1,
            )
            draw.text((bx + pad, by + pad), d_text, fill=text_color, font=font)
            bubble_y -= (th + 2 * pad + 4)


# ── Public API ─────────────────────────────────────────────────────────

async def compose_page(
    page_data: Page,
    script: ComicScript,
    page_images: Optional[list[Image.Image]] = None,
) -> RenderedPage:
    """Compose a full comic/manga/manhwa page from panel images.

    Args:
        page_data: The Page data (panels with descriptions/dialogue).
        script: Full ComicScript (for style notes, format).
        page_images: Pre-generated panel images. If None, generates them.

    Returns:
        RenderedPage with final composed image.
    """
    fmt = script.format
    page_w, page_h = _PAGE_DIMS.get(fmt, (636, 984))

    panels = page_data.panels
    n = len(panels)

    if page_images is None or len(page_images) < n:
        generated = []
        for pnl in panels:
            img = await generate_panel_image(pnl, fmt, script.style_notes)
            generated.append(img)
        page_images = generated

    # Layout panel images into a page
    layout_fn = _LAYOUT_FN.get(fmt, _layout_comic)
    page = layout_fn(page_images, page_w, page_h)

    # Add borders
    page = _add_borders(page, fmt, n)

    # Add speech bubbles / text overlays
    page = _add_speech_bubbles(page, panels, fmt)

    # Convert manga to grayscale
    if fmt == ComicFormat.MANGA:
        page = page.convert("L").convert("RGB")

    buf = io.BytesIO()
    page.save(buf, format="PNG")
    return RenderedPage(
        page_number=page_data.page_number,
        image_bytes=buf.getvalue(),
        format="PNG",
        width=page.width,
        height=page.height,
    )


async def compose_episode(
    episode: Episode,
    script: ComicScript,
) -> list[RenderedPage]:
    """Compose all pages of an episode into images."""
    results = []
    for pg in episode.pages:
        rendered = await compose_page(pg, script)
        results.append(rendered)
    return results


async def compose_cover(
    script: ComicScript,
) -> Optional[RenderedPage]:
    """Generate a cover page from the script's cover_description."""
    dummy_panel = Panel(
        panel_id=0,
        shape=PanelShape.FULL,
        scene_description=script.cover_description,
    )
    dummy_page = Page(
        page_number=0,
        panels=[dummy_panel],
        layout_type="splash",
    )
    return await compose_page(dummy_page, script)
