"""Infographic renderer — turns labeled data points into a shareable PNG.

Pure Pillow rendering (no LLM, no network). Two chart kinds:
- ``bar``  — horizontal bars, bar length proportional to value / max.
- ``stat`` — big-number stat cards in a 2-column grid.
"""
import os
import tempfile

from PIL import Image, ImageDraw, ImageFont

CANVAS_W = 1200
CANVAS_H = 1600

# alternating accent palette for bars / card accents
ACCENTS = ["#FF6B35", "#004E89", "#7B2FF7", "#00B4D8", "#F4A261"]

# theme -> (bg, primary text, secondary text)
THEMES = {
    "dark": ("#0f1420", "#f5f5f7", "#94a3b8"),
    "light": ("#fafafa", "#1a1a1a", "#6b7280"),
}

MAX_DATA_POINTS = 12


def _load_font(font_path: str, size: int) -> ImageFont.FreeTypeFont:
    """Load a truetype font, falling back to a default/small font reliably."""
    try:
        return ImageFont.truetype(font_path, size)
    except Exception:  # pragma: no cover - font env dependent
        return ImageFont.load_default()


def _wrap_text(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """Word-wrap ``text`` so each line fits within ``max_width`` pixels."""
    if not text:
        return [""]
    words = text.split(" ")
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip() if current else word
        if font.getlength(candidate) <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


class InfographicEngine:
    """Render labeled numeric data points into an infographic PNG."""

    def __init__(
        self,
        font_path: str = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        output_base: str | None = None,
    ):
        self.font_path = font_path
        self.output_base = output_base or "/tmp/infographic_"

    def generate(
        self,
        title: str,
        data_points: list[dict],
        chart_kind: str = "bar",
        theme: str = "dark",
        output_dir: str | None = None,
    ) -> dict:
        """Render an infographic PNG from ``data_points``.

        ``data_points`` is a list of ``{"label": str, "value": float}`` dicts
        (1..12 entries). Returns ``{"success": True, image_path, width,
        height, data_points: N, chart_kind, theme}``.
        """
        if not data_points:
            raise RuntimeError("data_points must contain at least one entry")
        if len(data_points) > MAX_DATA_POINTS:
            raise RuntimeError(
                f"data_points exceeds limit of {MAX_DATA_POINTS} (got {len(data_points)})"
            )
        chart_kind = chart_kind or "bar"
        theme = theme or "dark"

        bg, text_color, muted = THEMES.get(theme, THEMES["dark"])

        img = Image.new("RGB", (CANVAS_W, CANVAS_H), bg)
        draw = ImageDraw.Draw(img)

        # ---- title (top) ----
        title_font = _load_font(self.font_path, 64)
        title_margin = 60
        y = 70
        for line in _wrap_text(title, title_font, CANVAS_W - 2 * title_margin):
            draw.text((title_margin, y), line, fill=text_color, font=title_font)
            y += title_font.size + 16
        y += 30  # separator gap

        if chart_kind == "stat":
            self._draw_stat(draw, data_points, theme.casefold(), text_color, muted, y)
        else:
            self._draw_bar(draw, data_points, text_color, muted, y)

        # ---- footer ----
        footer_font = _load_font(self.font_path, 30)
        footer_text = f"{len(data_points)} data points  •  1AI Content"
        footer_w = footer_font.getlength(footer_text)
        draw.text(
            ((CANVAS_W - footer_w) / 2, CANVAS_H - 90),
            footer_text,
            fill=muted,
            font=footer_font,
        )

        # ---- resolve output dir / filename ----
        if output_dir is None:
            output_dir = tempfile.mkdtemp(prefix=os.path.basename(self.output_base))
        os.makedirs(output_dir, exist_ok=True)
        image_path = os.path.join(output_dir, "infographic.png")
        img.save(image_path, format="PNG")

        return {
            "success": True,
            "image_path": image_path,
            "width": CANVAS_W,
            "height": CANVAS_H,
            "data_points": len(data_points),
            "chart_kind": chart_kind,
            "theme": theme,
        }

    # ------------------------------------------------------------------ #
    def _draw_bar(self, draw, data_points, text_color, muted, start_y):
        """Horizontal bars: label left, bar ∝ value/max, value label right."""
        label_font = _load_font(self.font_path, 34)
        value_font = _load_font(self.font_path, 34)
        max_val = max(p["value"] for p in data_points) or 1.0

        left = 60
        right = CANVAS_W - 60
        available_h = (CANVAS_H - 150) - start_y  # reserve footer
        row_h = max(56, available_h / len(data_points))
        bar_max_w = right - left - 420  # room for value label on far right

        y = start_y
        for i, point in enumerate(data_points):
            label = str(point.get("label", ""))
            value = float(point.get("value", 0.0))
            acc = ACCENTS[i % len(ACCENTS)]

            # label (left)
            draw.text((left, y), label, fill=text_color, font=label_font)

            # value label (far right)
            val_text = self._format_value(value)
            draw.text(
                (right - value_font.getlength(val_text), y),
                val_text,
                fill=text_color,
                font=value_font,
            )

            # bar
            bar_w = max(8.0, bar_max_w * (value / max_val))
            draw.rectangle(
                [left, y + label_font.size + 12, left + bar_w, y + label_font.size + 12 + 26],
                fill=acc,
            )
            y += row_h

    def _draw_stat(self, draw, data_points, theme_name, text_color, muted, start_y):
        """Big-number stat cards: 2 columns x ceil(N/2) rows."""
        value_font = _load_font(self.font_path, 120)
        label_font = _load_font(self.font_path, 34)

        cols = 2
        margin = 60
        gap = 40
        card_w = (CANVAS_W - 2 * margin - gap) // cols
        available_h = (CANVAS_H - 150) - start_y
        rows = (len(data_points) + cols - 1) // cols
        row_h = available_h / rows

        for i, point in enumerate(data_points):
            col = i % cols
            row = i // cols
            label = str(point.get("label", ""))
            value = float(point.get("value", 0.0))
            acc = ACCENTS[i % len(ACCENTS)]

            x0 = margin + col * (card_w + gap)
            y0 = start_y + row * row_h
            card_h = min(row_h - 16, card_w * 0.46)

            draw.rectangle([x0, y0, x0 + card_w, y0 + card_h], fill=acc)
            val_text = self._format_value(value)
            val_w = value_font.getlength(val_text)
            draw.text(
                (x0 + (card_w - val_w) / 2, y0 + card_h * 0.28),
                val_text,
                fill="#ffffff",
                font=value_font,
            )
            label_w = label_font.getlength(label)
            draw.text(
                (x0 + (card_w - label_w) / 2, y0 + card_h * 0.68),
                label,
                fill="#ffffff",
                font=label_font,
            )

    @staticmethod
    def _format_value(value: float) -> str:
        """Compact number formatting (K/M, thousands separators)."""
        if abs(value) >= 1_000_000:
            return f"{value / 1_000_000:.1f}M"
        if abs(value) >= 1_000:
            return f"{value / 1_000:.1f}K"
        if float(value).is_integer():
            return f"{int(value):,}"
        return f"{value:,.2f}"