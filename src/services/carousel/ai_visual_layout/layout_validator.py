# =========================================================
# LAYOUT VALIDATOR
# Validasi, clamp, dan auto-convert normalized → pixel
# untuk output AI Visual Layout Director.
# =========================================================

import copy
from .. import config
from .visual_layout_types import make_default_visual_layout


# ─── BBox Helpers ────────────────────────────────────────

def looks_like_normalized_bbox(bbox: dict) -> bool:
    """Deteksi apakah bbox menggunakan koordinat normalized 0-1."""
    return (
        isinstance(bbox.get("x"), (int, float))
        and isinstance(bbox.get("y"), (int, float))
        and isinstance(bbox.get("width"), (int, float))
        and isinstance(bbox.get("height"), (int, float))
        and 0 <= bbox["x"] <= 1
        and 0 <= bbox["y"] <= 1
        and 0 < bbox["width"] <= 1
        and 0 < bbox["height"] <= 1
    )


def clamp_bbox_to_canvas(bbox: dict, canvas_width: int, canvas_height: int) -> dict:
    """Clamp bbox agar tidak keluar canvas dan semua nilai integer >= 1."""
    x = max(0, min(int(round(bbox.get("x", 0))), canvas_width))
    y = max(0, min(int(round(bbox.get("y", 0))), canvas_height))
    width = max(1, min(int(round(bbox.get("width", 1))), canvas_width - x))
    height = max(1, min(int(round(bbox.get("height", 1))), canvas_height - y))
    return {"x": x, "y": y, "width": width, "height": height}


def denormalize_bbox_if_needed(bbox: dict, canvas_width: int, canvas_height: int) -> dict:
    """Auto-convert normalized coordinate ke pixel jika terdeteksi."""
    if not looks_like_normalized_bbox(bbox):
        return clamp_bbox_to_canvas(bbox, canvas_width, canvas_height)

    return clamp_bbox_to_canvas(
        {
            "x": bbox["x"] * canvas_width,
            "y": bbox["y"] * canvas_height,
            "width": bbox["width"] * canvas_width,
            "height": bbox["height"] * canvas_height,
        },
        canvas_width,
        canvas_height,
    )


def denormalize_point_if_needed(point: dict, canvas_width: int, canvas_height: int) -> dict:
    """Auto-convert target_point jika normalized."""
    if point is None:
        return None
    x = point.get("x", 0)
    y = point.get("y", 0)
    if isinstance(x, float) and 0 <= x <= 1 and isinstance(y, float) and 0 <= y <= 1:
        x = x * canvas_width
        y = y * canvas_height
    return {
        "x": max(0, min(int(round(x)), canvas_width)),
        "y": max(0, min(int(round(y)), canvas_height)),
    }


# ─── Full Layout Validator ───────────────────────────────

def validate_visual_layout(
    layout: dict,
    canvas_width: int,
    canvas_height: int,
    headline_text: str = "",
    subtitle_text: str = "",
) -> dict:
    """
    Validasi dan perbaiki output AI Visual Layout Director.
    Jika layout invalid atau gagal divalidasi, return fallback layout.
    """
    try:
        return _validate_layout_internal(layout, canvas_width, canvas_height, headline_text, subtitle_text)
    except Exception as e:
        print(f"⚠️ [LayoutValidator] Validasi gagal, menggunakan fallback layout: {e}")
        return make_default_visual_layout(canvas_width, canvas_height, headline_text, subtitle_text)


def _validate_layout_internal(
    layout: dict,
    canvas_width: int,
    canvas_height: int,
    headline_text: str,
    subtitle_text: str,
) -> dict:
    """Internal validator — raises Exception jika fatal."""
    if not isinstance(layout, dict):
        raise ValueError("Layout bukan dict.")

    result = copy.deepcopy(layout)

    # Pastikan coordinate_system benar
    cs = result.get("coordinate_system", {})
    cs["type"] = "pixel"
    cs["origin"] = "top_left"
    cs["canvas_width"] = canvas_width
    cs["canvas_height"] = canvas_height
    cs["bbox_format"] = "x_y_width_height"
    cs["unit"] = "px"
    result["coordinate_system"] = cs

    # Validasi image_analysis bboxes
    ia = result.get("image_analysis", {})
    if "main_subject_bbox" in ia:
        ia["main_subject_bbox"] = denormalize_bbox_if_needed(ia["main_subject_bbox"], canvas_width, canvas_height)
    for area in ia.get("important_areas_to_avoid", []):
        if "bbox" in area:
            area["bbox"] = denormalize_bbox_if_needed(area["bbox"], canvas_width, canvas_height)
    for space in ia.get("best_negative_spaces", []):
        if "bbox" in space:
            space["bbox"] = denormalize_bbox_if_needed(space["bbox"], canvas_width, canvas_height)

    # Validasi safe_area
    lr = result.get("layout_recommendation", {})
    if "safe_area" in lr:
        lr["safe_area"] = denormalize_bbox_if_needed(lr["safe_area"], canvas_width, canvas_height)

    # Validasi text_layers
    text_layers = lr.get("text_layers", [])
    validated_layers = []
    for layer in text_layers:
        layer = _validate_text_layer(layer, canvas_width, canvas_height)
        if layer:
            validated_layers.append(layer)
    lr["text_layers"] = validated_layers

    # Validasi decorative_layers
    deco_layers = lr.get("decorative_layers", [])
    validated_decos = []
    for deco in deco_layers:
        deco = _validate_decorative_layer(deco, canvas_width, canvas_height)
        if deco:
            validated_decos.append(deco)
    lr["decorative_layers"] = validated_decos

    result["layout_recommendation"] = lr
    return result


def _validate_text_layer(layer: dict, canvas_width: int, canvas_height: int) -> dict:
    """Validasi single text layer."""
    if not isinstance(layer, dict):
        return None

    # Denormalize bbox
    if "bbox" in layer:
        layer["bbox"] = denormalize_bbox_if_needed(layer["bbox"], canvas_width, canvas_height)

    # Clamp rotation berdasarkan role
    role = layer.get("role", "label")
    rotation = layer.get("rotation_deg", 0)
    if role == "headline":
        layer["rotation_deg"] = max(-6, min(6, rotation))
    elif role in ("badge", "label", "caption"):
        layer["rotation_deg"] = max(-10, min(10, rotation))
    else:
        layer["rotation_deg"] = max(-6, min(6, rotation))

    # Pastikan font_size_px positif dan reasonable
    font_size = layer.get("font_size_px", 48)
    if not isinstance(font_size, (int, float)) or font_size < 12:
        font_size = 48
    layer["font_size_px"] = int(font_size)

    # Pastikan max_lines minimal 1
    max_lines = layer.get("max_lines", 3)
    if not isinstance(max_lines, int) or max_lines < 1:
        max_lines = 3
    layer["max_lines"] = max_lines

    # Validasi stroke
    stroke = layer.get("stroke", {})
    if isinstance(stroke, dict):
        w = stroke.get("width_px", 0)
        if isinstance(w, (int, float)):
            stroke["width_px"] = max(0, int(w))
    layer["stroke"] = stroke

    # Validasi shadow
    shadow = layer.get("shadow", {})
    if isinstance(shadow, dict):
        for key in ("blur_px", "offset_x_px", "offset_y_px"):
            v = shadow.get(key, 0)
            if isinstance(v, (int, float)):
                shadow[key] = int(v)
        opacity = shadow.get("opacity", 0.2)
        if isinstance(opacity, (int, float)):
            shadow["opacity"] = max(0.0, min(1.0, float(opacity)))
    layer["shadow"] = shadow

    # Validasi background_box
    bg = layer.get("background_box", {})
    if isinstance(bg, dict):
        for key in ("padding_x_px", "padding_y_px", "radius_px"):
            v = bg.get(key, 0)
            if isinstance(v, (int, float)):
                bg[key] = max(0, int(v))
        opacity = bg.get("opacity", 0.9)
        if isinstance(opacity, (int, float)):
            bg["opacity"] = max(0.0, min(1.0, float(opacity)))
    layer["background_box"] = bg

    # Pastikan priority integer
    priority = layer.get("priority", 5)
    if not isinstance(priority, int):
        priority = 5
    layer["priority"] = priority

    # Pastikan text layer masih ada bbox setelah validasi
    bbox = layer.get("bbox", {})
    if bbox.get("width", 0) < 1 or bbox.get("height", 0) < 1:
        return None

    return layer


def _validate_decorative_layer(deco: dict, canvas_width: int, canvas_height: int) -> dict:
    """Validasi single decorative layer."""
    if not isinstance(deco, dict):
        return None

    if "bbox" in deco:
        deco["bbox"] = denormalize_bbox_if_needed(deco["bbox"], canvas_width, canvas_height)

    if "target_point" in deco and deco["target_point"]:
        deco["target_point"] = denormalize_point_if_needed(deco["target_point"], canvas_width, canvas_height)

    rotation = deco.get("rotation_deg", 0)
    if isinstance(rotation, (int, float)):
        deco["rotation_deg"] = max(-360, min(360, rotation))

    opacity = deco.get("opacity", 1.0)
    if isinstance(opacity, (int, float)):
        deco["opacity"] = max(0.0, min(1.0, float(opacity)))

    return deco


# ─── Text Overflow Handler ───────────────────────────────

def adjust_text_overflow(layer: dict, actual_text: str, canvas_width: int, canvas_height: int) -> dict:
    """
    Jika teks terlalu panjang untuk bbox, kecilkan font atau tambah max_lines.
    Heuristik sederhana berdasarkan estimasi karakter.
    """
    layer = copy.deepcopy(layer)
    bbox = layer.get("bbox", {})
    font_size = layer.get("font_size_px", 48)
    max_lines = layer.get("max_lines", 3)

    if not actual_text:
        return layer

    # Estimasi kasar: lebar karakter ~ 0.55 * font_size
    chars_per_line = max(1, int(bbox.get("width", 400) / (font_size * 0.55)))
    total_chars = len(actual_text)
    estimated_lines = max(1, (total_chars + chars_per_line - 1) // chars_per_line)

    if estimated_lines <= max_lines:
        return layer

    # Strategi 1: tambah max_lines (max 2x lipat)
    if estimated_lines <= max_lines * 2:
        layer["max_lines"] = estimated_lines
        # Sesuaikan bbox height
        line_height = font_size + layer.get("line_spacing_px", 8)
        new_height = estimated_lines * line_height
        bbox["height"] = min(new_height, canvas_height - bbox.get("y", 0))
        layer["bbox"] = clamp_bbox_to_canvas(bbox, canvas_width, canvas_height)
        return layer

    # Strategi 2: kecilkan font 8-12%
    shrink_factor = max(0.75, max_lines / estimated_lines)
    new_font_size = max(24, int(font_size * shrink_factor))
    layer["font_size_px"] = new_font_size

    # Recalculate
    new_chars_per_line = max(1, int(bbox.get("width", 400) / (new_font_size * 0.55)))
    new_estimated_lines = max(1, (total_chars + new_chars_per_line - 1) // new_chars_per_line)
    layer["max_lines"] = max(max_lines, new_estimated_lines)

    # Update stroke width proportionally
    stroke = layer.get("stroke", {})
    if isinstance(stroke, dict) and stroke.get("enabled"):
        stroke["width_px"] = max(2, int(stroke.get("width_px", 8) * shrink_factor))
    layer["stroke"] = stroke

    return layer
