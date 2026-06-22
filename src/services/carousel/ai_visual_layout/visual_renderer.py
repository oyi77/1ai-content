# =========================================================
# VISUAL RENDERER
# Renderer yang membaca JSON output AI Visual Layout Director
# dan menggambar text layers, background boxes, stroke,
# shadow, rotasi, dan dekorasi pada gambar.
# =========================================================

import math
import os

from PIL import Image, ImageDraw, ImageFont, ImageFilter

from .. import config
from ..utils import get_font_path, sanitize_text
from .layout_validator import adjust_text_overflow


class VisualLayoutRenderer:
    """
    Renderer khusus yang membaca VisualLayout JSON dari AI
    dan menggambar semua text_layers + decorative_layers.
    """

    def __init__(self):
        self._font_cache = {}

    def _load_font(self, family: str, weight: int, size_px: int) -> ImageFont.FreeTypeFont:
        """Load font dengan caching."""
        cache_key = (family, weight, size_px)
        if cache_key in self._font_cache:
            return self._font_cache[cache_key]

        font_path = get_font_path(family, weight)
        try:
            font = ImageFont.truetype(font_path, size_px)
        except (IOError, OSError):
            # Fallback ke font default project
            try:
                fallback_path = get_font_path(config.CONTENT_FONT_FAMILY, 400)
                font = ImageFont.truetype(fallback_path, size_px)
            except (IOError, OSError):
                font = ImageFont.load_default()

        self._font_cache[cache_key] = font
        return font

    def _hex_to_rgba(self, hex_color: str, opacity: float = 1.0) -> tuple:
        """Convert hex color string ke RGBA tuple."""
        hex_color = hex_color.lstrip("#")
        if len(hex_color) == 6:
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
        elif len(hex_color) == 8:
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            opacity = int(hex_color[6:8], 16) / 255.0
        else:
            r, g, b = 255, 255, 255
        a = int(opacity * 255)
        return (r, g, b, a)

    def _wrap_text_for_bbox(self, draw: ImageDraw.Draw, text: str, font: ImageFont.FreeTypeFont,
                            max_width: int, max_lines: int) -> str:
        """Wrap text agar muat dalam max_width dan max_lines."""
        paragraphs = text.split("\n")
        final_lines = []

        for paragraph in paragraphs:
            words = paragraph.split()
            if not words:
                final_lines.append("")
                continue

            current_line = words[0]
            for word in words[1:]:
                candidate = f"{current_line} {word}"
                bbox = draw.textbbox((0, 0), candidate, font=font)
                candidate_width = bbox[2] - bbox[0]

                if candidate_width <= max_width:
                    current_line = candidate
                else:
                    final_lines.append(current_line)
                    current_line = word

            final_lines.append(current_line)

        # Trim ke max_lines
        if len(final_lines) > max_lines:
            final_lines = final_lines[:max_lines]
            # Tambah ellipsis di baris terakhir jika terpotong
            if final_lines[-1]:
                final_lines[-1] = final_lines[-1].rstrip() + "..."

        return "\n".join(final_lines)

    def render_visual_layout(self, img: Image.Image, visual_layout: dict) -> Image.Image:
        """
        Render semua layers dari VisualLayout JSON ke gambar.

        Args:
            img: PIL Image background (sudah di-resize/crop ke canvas size)
            visual_layout: Validated VisualLayout JSON dict

        Returns:
            PIL Image dengan overlay teks dan dekorasi
        """
        img = img.convert("RGBA")
        canvas_width, canvas_height = img.size

        layout_rec = visual_layout.get("layout_recommendation", {})

        # 1. Render overlay gradient jika direkomendasikan
        readability = layout_rec.get("readability_checks", {})
        gradient_info = readability.get("suggested_overlay_gradient", {})
        if gradient_info.get("enabled"):
            img = self._render_gradient_overlay(img, gradient_info, canvas_width, canvas_height)

        # 2. Render decorative layers (di bawah teks)
        deco_layers = layout_rec.get("decorative_layers", [])
        for deco in deco_layers:
            img = self._render_decorative_layer(img, deco, canvas_width, canvas_height)

        # 3. Render text layers (berdasarkan priority, tinggi dulu)
        text_layers = layout_rec.get("text_layers", [])
        text_layers_sorted = sorted(text_layers, key=lambda l: l.get("priority", 99))

        for layer in text_layers_sorted:
            img = self._render_text_layer(img, layer, canvas_width, canvas_height)

        return img.convert("RGB")

    def _render_gradient_overlay(self, img: Image.Image, gradient_info: dict,
                                  canvas_width: int, canvas_height: int) -> Image.Image:
        """Render gradient overlay untuk readability."""
        position = gradient_info.get("position", "bottom")
        color_hex = gradient_info.get("color", "#000000")
        opacity = gradient_info.get("opacity", 0.2)

        overlay = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        r, g, b = self._hex_to_rgba(color_hex)[:3]
        max_alpha = int(opacity * 255)

        gradient_size = canvas_height // 3  # Gradient covers 1/3 of canvas

        if position == "bottom":
            for i in range(gradient_size):
                alpha = int(max_alpha * (i / gradient_size))
                y = canvas_height - gradient_size + i
                draw.line([(0, y), (canvas_width, y)], fill=(r, g, b, alpha))
        elif position == "top":
            for i in range(gradient_size):
                alpha = int(max_alpha * (1 - i / gradient_size))
                draw.line([(0, i), (canvas_width, i)], fill=(r, g, b, alpha))
        elif position == "full":
            overlay = Image.new("RGBA", (canvas_width, canvas_height), (r, g, b, max_alpha))

        return Image.alpha_composite(img, overlay)

    def _render_text_layer(self, img: Image.Image, layer: dict,
                           canvas_width: int, canvas_height: int) -> Image.Image:
        """Render single text layer dengan semua styling."""
        text = sanitize_text(layer.get("text", ""))
        if not text.strip():
            return img

        bbox = layer.get("bbox", {})
        x = bbox.get("x", 60)
        y = bbox.get("y", 100)
        width = bbox.get("width", canvas_width - 120)
        height = bbox.get("height", 200)

        font_family = layer.get("font_family_suggestion", config.TITLE_FONT_FAMILY)
        font_weight = layer.get("font_weight", 700)
        font_size = layer.get("font_size_px", 48)
        max_lines = layer.get("max_lines", 3)
        line_spacing = layer.get("line_spacing_px", 8)
        align = layer.get("align", "center")
        rotation_deg = layer.get("rotation_deg", 0)

        fill_color = layer.get("fill_color", "#FFFFFF")
        stroke_info = layer.get("stroke", {})
        shadow_info = layer.get("shadow", {})
        bg_box_info = layer.get("background_box", {})

        # Load font
        font = self._load_font(font_family, font_weight, font_size)

        # Wrap text untuk bbox
        temp_img = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
        temp_draw = ImageDraw.Draw(temp_img)
        wrapped_text = self._wrap_text_for_bbox(temp_draw, text, font, width, max_lines)

        # Hitung ukuran teks sebenarnya
        text_bbox = temp_draw.multiline_textbbox(
            (0, 0), wrapped_text, font=font, align=align, spacing=line_spacing
        )
        actual_text_width = text_bbox[2] - text_bbox[0]
        actual_text_height = text_bbox[3] - text_bbox[1]

        # Buat layer overlay untuk teks ini (lebih besar untuk rotasi)
        padding = 80  # Extra padding untuk rotasi dan shadow
        layer_w = width + padding * 2
        layer_h = height + padding * 2
        text_layer_img = Image.new("RGBA", (layer_w, layer_h), (0, 0, 0, 0))
        text_draw = ImageDraw.Draw(text_layer_img)

        # Hitung posisi teks dalam layer
        anchor = layer.get("anchor", "top_left")
        if align == "center":
            text_x = padding + (width - actual_text_width) // 2
        elif align == "right":
            text_x = padding + width - actual_text_width
        else:
            text_x = padding

        text_y = padding + (height - actual_text_height) // 2

        # 1. Gambar background box jika enabled
        if bg_box_info.get("enabled"):
            self._draw_background_box(
                text_draw, bg_box_info,
                text_x, text_y,
                actual_text_width, actual_text_height
            )

        # 2. Gambar shadow jika enabled
        if shadow_info.get("enabled"):
            self._draw_text_shadow(
                text_layer_img, text_draw, shadow_info,
                wrapped_text, font, align, line_spacing,
                text_x, text_y, text_bbox
            )

        # 3. Gambar teks dengan stroke
        fill_rgba = self._hex_to_rgba(fill_color)
        stroke_width = 0
        stroke_fill = None
        if stroke_info.get("enabled"):
            stroke_width = stroke_info.get("width_px", 0)
            stroke_fill = stroke_info.get("color", "#000000")

        text_draw.multiline_text(
            (text_x - text_bbox[0], text_y - text_bbox[1]),
            wrapped_text,
            font=font,
            fill=fill_rgba[:3],  # RGB only for text fill
            align=align,
            spacing=line_spacing,
            stroke_width=stroke_width,
            stroke_fill=stroke_fill,
        )

        # 4. Rotasi jika perlu
        if abs(rotation_deg) > 0.5:
            text_layer_img = text_layer_img.rotate(
                -rotation_deg,  # PIL rotate is counter-clockwise
                resample=Image.Resampling.BICUBIC,
                expand=False,
                center=(layer_w // 2, layer_h // 2),
            )

        # 5. Paste ke gambar utama
        paste_x = x - padding
        paste_y = y - padding

        # Clamp paste position
        paste_x = max(-padding, min(paste_x, canvas_width))
        paste_y = max(-padding, min(paste_y, canvas_height))

        img = self._safe_paste(img, text_layer_img, paste_x, paste_y)

        return img

    def _draw_background_box(self, draw: ImageDraw.Draw, bg_info: dict,
                              text_x: int, text_y: int,
                              text_width: int, text_height: int):
        """Gambar rounded rectangle / pill background di belakang teks."""
        shape = bg_info.get("shape", "rounded_rect")
        fill_color = bg_info.get("fill_color", "#FFFFFF")
        opacity = bg_info.get("opacity", 0.9)
        pad_x = bg_info.get("padding_x_px", 20)
        pad_y = bg_info.get("padding_y_px", 12)
        radius = bg_info.get("radius_px", 20)

        rgba = self._hex_to_rgba(fill_color, opacity)

        box_left = text_x - pad_x
        box_top = text_y - pad_y
        box_right = text_x + text_width + pad_x
        box_bottom = text_y + text_height + pad_y

        if shape == "pill":
            pill_radius = (box_bottom - box_top) // 2
            draw.rounded_rectangle(
                [box_left, box_top, box_right, box_bottom],
                radius=pill_radius,
                fill=rgba,
            )
        elif shape in ("rounded_rect", "blob"):
            draw.rounded_rectangle(
                [box_left, box_top, box_right, box_bottom],
                radius=radius,
                fill=rgba,
            )
        # "none" → skip

    def _draw_text_shadow(self, layer_img: Image.Image, draw: ImageDraw.Draw,
                           shadow_info: dict, text: str, font: ImageFont.FreeTypeFont,
                           align: str, spacing: int,
                           text_x: int, text_y: int, text_bbox: tuple):
        """Gambar shadow di bawah teks (simple offset shadow)."""
        shadow_color = shadow_info.get("color", "#000000")
        shadow_opacity = shadow_info.get("opacity", 0.2)
        blur_px = shadow_info.get("blur_px", 4)
        offset_x = shadow_info.get("offset_x_px", 2)
        offset_y = shadow_info.get("offset_y_px", 4)

        shadow_rgba = self._hex_to_rgba(shadow_color, shadow_opacity)

        # Gambar shadow teks
        shadow_layer = Image.new("RGBA", layer_img.size, (0, 0, 0, 0))
        shadow_draw = ImageDraw.Draw(shadow_layer)

        shadow_draw.multiline_text(
            (text_x - text_bbox[0] + offset_x, text_y - text_bbox[1] + offset_y),
            text,
            font=font,
            fill=shadow_rgba,
            align=align,
            spacing=spacing,
        )

        # Apply blur jika diperlukan
        if blur_px > 0:
            # Pillow GaussianBlur pada layer RGBA
            shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(radius=blur_px))

        # Composite shadow ke layer utama
        layer_img_data = Image.alpha_composite(
            Image.new("RGBA", layer_img.size, (0, 0, 0, 0)),
            shadow_layer
        )
        # Paste shadow pixels back  (kita modify layer_img in-place via draw)
        # Karena kita perlu compositing, kita paste ke layer_img
        temp = Image.alpha_composite(
            Image.new("RGBA", layer_img.size, (0, 0, 0, 0)),
            shadow_layer,
        )
        layer_img.paste(Image.alpha_composite(layer_img, temp))

    def _render_decorative_layer(self, img: Image.Image, deco: dict,
                                  canvas_width: int, canvas_height: int) -> Image.Image:
        """Render dekorasi sederhana: sparkle, arrow, underline, circle_highlight."""
        deco_type = deco.get("type", "sparkle")
        bbox = deco.get("bbox", {})
        x = bbox.get("x", 0)
        y = bbox.get("y", 0)
        w = bbox.get("width", 40)
        h = bbox.get("height", 40)
        color = deco.get("color", "#FFFFFF")
        stroke_color = deco.get("stroke_color", "#FF8BBC")
        opacity = deco.get("opacity", 1.0)
        rotation = deco.get("rotation_deg", 0)

        overlay = Image.new("RGBA", (canvas_width, canvas_height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)

        color_rgba = self._hex_to_rgba(color, opacity)
        stroke_rgba = self._hex_to_rgba(stroke_color, opacity)

        if deco_type == "sparkle":
            self._draw_sparkle(draw, x, y, w, h, color_rgba, stroke_rgba)
        elif deco_type == "arrow":
            target = deco.get("target_point")
            self._draw_arrow(draw, x, y, w, h, target, color_rgba, stroke_rgba)
        elif deco_type == "underline":
            self._draw_underline(draw, x, y, w, h, color_rgba, stroke_rgba)
        elif deco_type == "circle_highlight":
            self._draw_circle_highlight(draw, x, y, w, h, color_rgba, stroke_rgba)
        elif deco_type == "sticker_badge":
            self._draw_sticker_badge(draw, x, y, w, h, color_rgba, stroke_rgba)

        if abs(rotation) > 0.5:
            overlay = overlay.rotate(-rotation, resample=Image.Resampling.BICUBIC, expand=False)

        return Image.alpha_composite(img, overlay)

    def _draw_sparkle(self, draw: ImageDraw.Draw, x: int, y: int, w: int, h: int,
                       color: tuple, stroke_color: tuple):
        """Gambar sparkle/bintang 4-titik sederhana."""
        cx, cy = x + w // 2, y + h // 2
        size = min(w, h) // 2

        # Star 4-point
        points = [
            (cx, cy - size),       # top
            (cx + size // 4, cy - size // 4),
            (cx + size, cy),       # right
            (cx + size // 4, cy + size // 4),
            (cx, cy + size),       # bottom
            (cx - size // 4, cy + size // 4),
            (cx - size, cy),       # left
            (cx - size // 4, cy - size // 4),
        ]
        draw.polygon(points, fill=color, outline=stroke_color)

    def _draw_arrow(self, draw: ImageDraw.Draw, x: int, y: int, w: int, h: int,
                     target: dict, color: tuple, stroke_color: tuple):
        """Gambar panah sederhana."""
        if target:
            tx, ty = target.get("x", x + w), target.get("y", y + h)
        else:
            tx, ty = x + w, y + h

        # Line body
        draw.line([(x + w // 2, y + h // 2), (tx, ty)], fill=color, width=4)

        # Arrowhead
        angle = math.atan2(ty - (y + h // 2), tx - (x + w // 2))
        arrow_size = 16
        p1 = (tx, ty)
        p2 = (tx - int(arrow_size * math.cos(angle - 0.4)), ty - int(arrow_size * math.sin(angle - 0.4)))
        p3 = (tx - int(arrow_size * math.cos(angle + 0.4)), ty - int(arrow_size * math.sin(angle + 0.4)))
        draw.polygon([p1, p2, p3], fill=color)

    def _draw_underline(self, draw: ImageDraw.Draw, x: int, y: int, w: int, h: int,
                         color: tuple, stroke_color: tuple):
        """Gambar garis bawah dekoratif."""
        line_y = y + h - 4
        draw.line([(x, line_y), (x + w, line_y)], fill=color, width=max(3, h // 6))

    def _draw_circle_highlight(self, draw: ImageDraw.Draw, x: int, y: int, w: int, h: int,
                                color: tuple, stroke_color: tuple):
        """Gambar lingkaran highlight."""
        draw.ellipse([x, y, x + w, y + h], outline=stroke_color, width=3)

    def _draw_sticker_badge(self, draw: ImageDraw.Draw, x: int, y: int, w: int, h: int,
                             color: tuple, stroke_color: tuple):
        """Gambar badge sticker sederhana (rounded rect)."""
        draw.rounded_rectangle(
            [x, y, x + w, y + h],
            radius=min(w, h) // 3,
            fill=color,
            outline=stroke_color,
            width=2,
        )

    def _safe_paste(self, base: Image.Image, overlay: Image.Image,
                     paste_x: int, paste_y: int) -> Image.Image:
        """Paste overlay ke base dengan handling koordinat negatif/overflow."""
        base_w, base_h = base.size
        ov_w, ov_h = overlay.size

        # Crop overlay jika melebihi boundaries
        src_x1 = max(0, -paste_x)
        src_y1 = max(0, -paste_y)
        src_x2 = min(ov_w, base_w - paste_x)
        src_y2 = min(ov_h, base_h - paste_y)

        if src_x2 <= src_x1 or src_y2 <= src_y1:
            return base  # Overlay sepenuhnya di luar

        dst_x = max(0, paste_x)
        dst_y = max(0, paste_y)

        cropped = overlay.crop((src_x1, src_y1, src_x2, src_y2))

        # Composite
        temp_base = base.copy()
        temp_overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
        temp_overlay.paste(cropped, (dst_x, dst_y))

        return Image.alpha_composite(temp_base, temp_overlay)
