from __future__ import annotations
import textwrap
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


class PageComposer:
    LAYOUTS: dict[str, list[tuple[float, float, float, float]]] = {
        "2x2": [
            (0.0, 0.0, 0.5, 0.5),
            (0.5, 0.0, 1.0, 0.5),
            (0.0, 0.5, 0.5, 1.0),
            (0.5, 0.5, 1.0, 1.0),
        ],
        "splash": [(0.0, 0.0, 1.0, 1.0)],
        "3-panel": [
            (0.0, 0.0, 1.0, 0.4),
            (0.0, 0.4, 0.5, 1.0),
            (0.5, 0.4, 1.0, 1.0),
        ],
        "4-panel-vertical": [
            (0.0, 0.0, 1.0, 0.25),
            (0.0, 0.25, 1.0, 0.5),
            (0.0, 0.5, 1.0, 0.75),
            (0.0, 0.75, 1.0, 1.0),
        ],
    }

    BORDER_COLOR = (0, 0, 0)
    BORDER_WIDTH = 3
    BG_COLOR = (255, 255, 255)

    def compose_page(
        self,
        page: dict,
        panel_images: dict[str, Image.Image],
        rtl: bool = False,
        output_size: tuple[int, int] = (1200, 1694),
    ) -> Image.Image:
        canvas = Image.new("RGB", output_size, self.BG_COLOR)
        draw = ImageDraw.Draw(canvas)
        W, H = output_size

        layout_name = page.get("layout", "2x2")
        layout = self.LAYOUTS.get(layout_name, self.LAYOUTS["2x2"])

        panels = page.get("panels", [])
        if rtl:
            panels = list(reversed(panels))

        for i, cell in enumerate(layout):
            x0, y0, x1, y1 = (
                int(cell[0] * W),
                int(cell[1] * H),
                int(cell[2] * W),
                int(cell[3] * H),
            )

            # Draw panel border
            draw.rectangle(
                [x0, y0, x1 - 1, y1 - 1],
                outline=self.BORDER_COLOR,
                width=self.BORDER_WIDTH,
            )

            if i < len(panels):
                panel = panels[i]
                panel_id = panel.get("panel_id", "")
                img = panel_images.get(panel_id)
                if img:
                    cell_w = x1 - x0 - self.BORDER_WIDTH * 2
                    cell_h = y1 - y0 - self.BORDER_WIDTH * 2
                    resized = img.resize((cell_w, cell_h), Image.LANCZOS)
                    canvas.paste(
                        resized, (x0 + self.BORDER_WIDTH, y0 + self.BORDER_WIDTH)
                    )

                # Draw speech bubbles
                for dialogue in panel.get("dialogue", []):
                    text = dialogue.get("text", "")
                    if text and not dialogue.get("is_sfx", False):
                        bubble_x = x0 + (x1 - x0) // 4
                        bubble_y = y0 + 10
                        self._draw_speech_bubble(draw, text, (bubble_x, bubble_y))

                # Draw SFX
                for sfx in panel.get("sfx", []):
                    sfx_x = x1 - 60
                    sfx_y = y0 + 10
                    draw.text((sfx_x, sfx_y), sfx, fill=(255, 0, 0))

        return canvas

    def compose_webtoon_strip(
        self,
        pages: list[Image.Image],
        panel_width: int = 800,
    ) -> Image.Image:
        if not pages:
            return Image.new("RGB", (panel_width, panel_width), self.BG_COLOR)

        resized_pages = []
        for page in pages:
            ratio = panel_width / page.width
            new_height = int(page.height * ratio)
            resized_pages.append(page.resize((panel_width, new_height), Image.LANCZOS))

        total_height = sum(p.height for p in resized_pages)
        strip = Image.new("RGB", (panel_width, total_height), self.BG_COLOR)
        y_offset = 0
        for page in resized_pages:
            strip.paste(page, (0, y_offset))
            y_offset += page.height

        return strip

    def _draw_speech_bubble(
        self,
        draw: ImageDraw.ImageDraw,
        text: str,
        position: tuple[int, int],
        font: ImageFont.ImageFont | None = None,
    ) -> None:
        if font is None:
            try:
                font = ImageFont.truetype(
                    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14
                )
            except Exception:
                font = ImageFont.load_default()

        lines = textwrap.wrap(text, width=20)
        if not lines:
            return

        # Measure text
        line_height = 18
        text_h = len(lines) * line_height
        text_w = (
            max(draw.textlength(line, font=font) for line in lines) if lines else 80
        )
        text_w = max(int(text_w), 60)

        pad = 8
        bx0 = position[0]
        by0 = position[1]
        bx1 = bx0 + text_w + pad * 2
        by1 = by0 + text_h + pad * 2

        # Bubble body
        draw.rounded_rectangle(
            [bx0, by0, bx1, by1],
            radius=10,
            fill=(255, 255, 255),
            outline=(0, 0, 0),
            width=2,
        )

        # Tail
        tail_x = bx0 + (bx1 - bx0) // 2
        draw.polygon(
            [(tail_x - 5, by1), (tail_x + 5, by1), (tail_x, by1 + 12)],
            fill=(255, 255, 255),
            outline=(0, 0, 0),
        )

        # Text lines
        for i, line in enumerate(lines):
            draw.text(
                (bx0 + pad, by0 + pad + i * line_height),
                line,
                fill=(0, 0, 0),
                font=font,
            )
