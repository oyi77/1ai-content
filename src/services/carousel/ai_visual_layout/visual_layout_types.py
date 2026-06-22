# =========================================================
# VISUAL LAYOUT TYPES
# Schema / struktur data untuk output AI Visual Layout Director.
# Semua koordinat dalam PIXEL, bukan normalized 0-1.
# =========================================================


def make_bbox(x: int = 0, y: int = 0, width: int = 0, height: int = 0) -> dict:
    """Buat dict bbox dengan pixel coordinate."""
    return {"x": int(x), "y": int(y), "width": int(width), "height": int(height)}


def make_text_layer(
    id: str,
    text: str,
    role: str = "headline",
    bbox: dict = None,
    anchor: str = "top_left",
    align: str = "center",
    rotation_deg: float = 0,
    font_family_suggestion: str = "LilitaOne",
    font_weight: int = 900,
    font_size_px: int = 96,
    max_lines: int = 3,
    line_spacing_px: int = 88,
    letter_spacing_px: int = 0,
    fill_color: str = "#FFFFFF",
    stroke_enabled: bool = True,
    stroke_color: str = "#FF8BBC",
    stroke_width_px: int = 12,
    shadow_enabled: bool = True,
    shadow_color: str = "#000000",
    shadow_opacity: float = 0.22,
    shadow_blur_px: int = 8,
    shadow_offset_x_px: int = 3,
    shadow_offset_y_px: int = 5,
    bg_box_enabled: bool = False,
    bg_box_shape: str = "none",
    bg_box_fill_color: str = "#FFFFFF",
    bg_box_opacity: float = 0.92,
    bg_box_padding_x_px: int = 28,
    bg_box_padding_y_px: int = 18,
    bg_box_radius_px: int = 36,
    priority: int = 1,
    avoid_overlap_with_subject: bool = True,
) -> dict:
    """Buat dict TextLayer lengkap."""
    return {
        "id": id,
        "text": text,
        "role": role,
        "bbox": bbox or make_bbox(),
        "anchor": anchor,
        "align": align,
        "rotation_deg": rotation_deg,
        "font_family_suggestion": font_family_suggestion,
        "font_weight": font_weight,
        "font_size_px": font_size_px,
        "max_lines": max_lines,
        "line_spacing_px": line_spacing_px,
        "letter_spacing_px": letter_spacing_px,
        "fill_color": fill_color,
        "stroke": {
            "enabled": stroke_enabled,
            "color": stroke_color,
            "width_px": stroke_width_px,
        },
        "shadow": {
            "enabled": shadow_enabled,
            "color": shadow_color,
            "opacity": shadow_opacity,
            "blur_px": shadow_blur_px,
            "offset_x_px": shadow_offset_x_px,
            "offset_y_px": shadow_offset_y_px,
        },
        "background_box": {
            "enabled": bg_box_enabled,
            "shape": bg_box_shape,
            "fill_color": bg_box_fill_color,
            "opacity": bg_box_opacity,
            "padding_x_px": bg_box_padding_x_px,
            "padding_y_px": bg_box_padding_y_px,
            "radius_px": bg_box_radius_px,
        },
        "priority": priority,
        "avoid_overlap_with_subject": avoid_overlap_with_subject,
    }


def make_decorative_layer(
    id: str,
    type: str = "sparkle",
    bbox: dict = None,
    rotation_deg: float = 0,
    color: str = "#FFFFFF",
    stroke_color: str = "#FF8BBC",
    opacity: float = 1.0,
    target_point: dict = None,
    reason: str = "",
) -> dict:
    """Buat dict DecorativeLayer."""
    result = {
        "id": id,
        "type": type,
        "bbox": bbox or make_bbox(),
        "rotation_deg": rotation_deg,
        "color": color,
        "stroke_color": stroke_color,
        "opacity": opacity,
        "reason": reason,
    }
    if target_point:
        result["target_point"] = target_point
    return result


def make_default_visual_layout(
    canvas_width: int = 1080,
    canvas_height: int = 1920,
    headline_text: str = "",
    subtitle_text: str = "",
) -> dict:
    """Buat fallback VisualLayout default untuk canvas tertentu."""
    # Safe area default untuk TikTok portrait
    safe_x = 60
    safe_y = 100
    safe_w = min(860, canvas_width - safe_x - 160)
    safe_h = min(1500, canvas_height - safe_y - 320)

    text_layers = []

    if headline_text:
        headline_font_size = int(canvas_height * 0.05)  # ~96 untuk 1920
        headline_font_size = max(60, min(130, headline_font_size))
        h_height = int(headline_font_size * 3.5)
        text_layers.append(
            make_text_layer(
                id="headline",
                text=headline_text,
                role="headline",
                bbox=make_bbox(safe_x, safe_y + 100, safe_w, h_height),
                align="center",
                font_size_px=headline_font_size,
                font_family_suggestion="LilitaOne",
                font_weight=900,
                max_lines=3,
                line_spacing_px=int(headline_font_size * 0.9),
                stroke_enabled=True,
                stroke_color="#FF8BBC",
                stroke_width_px=max(8, int(headline_font_size * 0.12)),
                shadow_enabled=True,
                priority=1,
            )
        )

    if subtitle_text:
        sub_font_size = int(canvas_height * 0.028)  # ~54 untuk 1920
        sub_font_size = max(36, min(72, sub_font_size))
        sub_y = safe_y + 100 + (int(canvas_height * 0.05) * 4) + 40
        text_layers.append(
            make_text_layer(
                id="subtitle",
                text=subtitle_text,
                role="subtitle",
                bbox=make_bbox(safe_x, sub_y, safe_w, int(sub_font_size * 2.5)),
                align="center",
                font_size_px=sub_font_size,
                font_family_suggestion="Poppins",
                font_weight=600,
                max_lines=2,
                line_spacing_px=int(sub_font_size * 0.8),
                stroke_enabled=True,
                stroke_color="#333333",
                stroke_width_px=max(4, int(sub_font_size * 0.08)),
                shadow_enabled=True,
                bg_box_enabled=True,
                bg_box_shape="pill",
                bg_box_fill_color="#FF8BBC",
                bg_box_opacity=0.85,
                bg_box_padding_x_px=32,
                bg_box_padding_y_px=16,
                bg_box_radius_px=40,
                priority=2,
            )
        )

    return {
        "coordinate_system": {
            "type": "pixel",
            "origin": "top_left",
            "canvas_width": canvas_width,
            "canvas_height": canvas_height,
            "bbox_format": "x_y_width_height",
            "unit": "px",
        },
        "image_analysis": {
            "main_subject": "unknown",
            "main_subject_bbox": make_bbox(0, 0, canvas_width, canvas_height),
            "important_areas_to_avoid": [],
            "best_negative_spaces": [
                {
                    "name": "center",
                    "bbox": make_bbox(safe_x, safe_y, safe_w, safe_h),
                    "score": 0.5,
                    "reason": "fallback center area",
                }
            ],
            "visual_mood": ["neutral"],
            "background_complexity": "medium",
        },
        "layout_recommendation": {
            "overall_style": "lemon8_default_fallback",
            "composition_reason": "Fallback layout: teks di safe area tengah karena AI layout tidak tersedia.",
            "safe_area": make_bbox(safe_x, safe_y, safe_w, safe_h),
            "text_layers": text_layers,
            "decorative_layers": [],
            "readability_checks": {
                "contrast_level": "medium",
                "risk_notes": ["Fallback layout, kontras belum dianalisis AI."],
                "suggested_overlay_gradient": {
                    "enabled": False,
                },
            },
        },
        "renderer_notes": {
            "recommended_text_order": ["headline", "subtitle"],
            "if_text_too_long": "perkecil font 10%, pecah jadi 2-3 baris",
            "if_background_too_busy": "tambahkan bubble box atau gradient tipis",
        },
    }


# Valid values for enum-like fields
VALID_ROLES = {"headline", "subtitle", "badge", "label", "caption"}
VALID_ANCHORS = {"top_left", "center", "top_right", "bottom_left", "bottom_right"}
VALID_ALIGNS = {"left", "center", "right"}
VALID_SHAPES = {"rounded_rect", "pill", "blob", "none"}
VALID_DECORATIVE_TYPES = {"arrow", "sparkle", "underline", "sticker_badge", "circle_highlight"}
VALID_CONTRAST_LEVELS = {"good", "medium", "risky"}
VALID_GRADIENT_POSITIONS = {"top", "bottom", "left", "right", "full"}
VALID_COMPLEXITIES = {"low", "medium", "high"}
