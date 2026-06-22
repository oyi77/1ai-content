# =========================================================
# VISUAL LAYOUT PROMPT
# Runtime prompt yang dikirim ke Gemini/Claude setiap kali
# ada gambar background slide untuk dianalisis.
# =========================================================


def build_visual_layout_prompt(
    canvas_width: int,
    canvas_height: int,
    canvas_format: str,
    slide_type: str,
    topic: str,
    headline_text: str,
    subtitle_text: str,
    optional_labels: list = None,
    target_style: str = "lemon8",
) -> str:
    """Bangun runtime prompt untuk AI Visual Layout Director."""

    labels_str = "[]"
    if optional_labels:
        import json
        labels_str = json.dumps(optional_labels, ensure_ascii=False)

    return f"""Kamu adalah Visual Layout Director untuk TikTok/Lemon8 image carousel.

Tugasmu:
Diberikan satu gambar background dan data teks slide, kamu harus membuat rekomendasi layout overlay teks yang aesthetic, readable, dan mirip gaya Lemon8/TikTok carousel.

PENTING:
Output layout HARUS memakai PIXEL COORDINATE, bukan normalized coordinate.
Jangan gunakan angka 0-1 untuk x, y, width, height.
Semua bbox harus memakai pixel sesuai ukuran canvas yang diberikan.

Canvas:
canvas_width: {canvas_width}
canvas_height: {canvas_height}
canvas_format: {canvas_format}

Sistem koordinat:
- Origin ada di pojok kiri atas gambar.
- x adalah posisi kiri elemen dalam pixel.
- y adalah posisi atas elemen dalam pixel.
- width adalah lebar elemen dalam pixel.
- height adalah tinggi elemen dalam pixel.
- Semua bbox harus integer.
- 0 <= x <= canvas_width
- 0 <= y <= canvas_height
- x + width <= canvas_width
- y + height <= canvas_height

Contoh benar untuk canvas {canvas_width}x{canvas_height}:
{{
  "x": 650,
  "y": 240,
  "width": 340,
  "height": 220
}}

Contoh salah:
{{
  "x": 0.65,
  "y": 0.20,
  "width": 0.30,
  "height": 0.15
}}

Safe area:
- Minimal margin kiri: 60 px.
- Minimal margin kanan: 60 px.
- Minimal margin atas: 80 px.
- Untuk TikTok portrait, hindari area bawah untuk caption/UI:
  jangan taruh teks penting di bawah y = {canvas_height} - 320 = {canvas_height - 320}.
- Untuk TikTok portrait, hindari area kanan untuk tombol:
  jangan taruh teks penting di area x > {canvas_width} - 170 = {canvas_width - 170}.

Input slide:
slide_type: {slide_type}
topic: "{topic}"
headline_text: "{headline_text}"
subtitle_text: "{subtitle_text}"
optional_labels: {labels_str}
target_style: "{target_style}"

Analisis gambar:
1. Deteksi subjek utama.
2. Deteksi wajah, tubuh, makanan, produk, tangan, uang, atau objek penting.
3. Deteksi area yang tidak boleh tertutup teks.
4. Deteksi negative space atau area kosong yang aman untuk teks.
5. Tentukan mood visual gambar.
6. Tentukan layout teks yang aesthetic.
7. Jangan menutup wajah, makanan utama, produk utama, atau detail penting.
8. Prioritaskan keterbacaan di layar HP.

Gaya visual:
- Lemon8/TikTok carousel.
- Headline besar.
- Warna cerah.
- Outline putih tebal.
- Shadow halus.
- Bubble atau pill background.
- Sedikit rotasi natural.
- Hierarchy jelas.
- Subtitle lebih kecil dari headline.
- Label kecil opsional.
- Gunakan arrow/callout hanya jika membantu.

Output HARUS RAW JSON valid.
Jangan beri penjelasan di luar JSON.
Jangan gunakan markdown.
Jangan gunakan komentar.

Schema output:

{{
  "coordinate_system": {{
    "type": "pixel",
    "origin": "top_left",
    "canvas_width": {canvas_width},
    "canvas_height": {canvas_height},
    "bbox_format": "x_y_width_height",
    "unit": "px"
  }},
  "image_analysis": {{
    "main_subject": "deskripsi singkat objek/subjek utama",
    "main_subject_bbox": {{
      "x": 0,
      "y": 0,
      "width": 0,
      "height": 0
    }},
    "important_areas_to_avoid": [
      {{
        "reason": "face/body/food/product/hand/etc",
        "bbox": {{
          "x": 0,
          "y": 0,
          "width": 0,
          "height": 0
        }}
      }}
    ],
    "best_negative_spaces": [
      {{
        "name": "upper right / upper left / center wall / etc",
        "bbox": {{
          "x": 0,
          "y": 0,
          "width": 0,
          "height": 0
        }},
        "score": 0.0,
        "reason": "kenapa area ini bagus untuk teks"
      }}
    ],
    "visual_mood": ["clean", "minimal", "lifestyle"],
    "background_complexity": "low"
  }},
  "layout_recommendation": {{
    "overall_style": "nama gaya visual",
    "composition_reason": "alasan singkat kenapa layout ini dipilih",
    "safe_area": {{
      "x": 60,
      "y": 100,
      "width": 860,
      "height": 1500
    }},
    "text_layers": [
      {{
        "id": "headline",
        "text": "{headline_text}",
        "role": "headline",
        "bbox": {{
          "x": 0,
          "y": 0,
          "width": 0,
          "height": 0
        }},
        "anchor": "top_left",
        "align": "center",
        "rotation_deg": 0,
        "font_family_suggestion": "LilitaOne",
        "font_weight": 900,
        "font_size_px": 96,
        "max_lines": 3,
        "line_spacing_px": 88,
        "letter_spacing_px": 0,
        "fill_color": "#FFFFFF",
        "stroke": {{
          "enabled": true,
          "color": "#FF8BBC",
          "width_px": 12
        }},
        "shadow": {{
          "enabled": true,
          "color": "#000000",
          "opacity": 0.22,
          "blur_px": 8,
          "offset_x_px": 3,
          "offset_y_px": 5
        }},
        "background_box": {{
          "enabled": false,
          "shape": "none",
          "fill_color": "#FFFFFF",
          "opacity": 0.92,
          "padding_x_px": 28,
          "padding_y_px": 18,
          "radius_px": 36
        }},
        "priority": 1,
        "avoid_overlap_with_subject": true
      }}
    ],
    "decorative_layers": [
      {{
        "id": "sparkle_1",
        "type": "sparkle",
        "bbox": {{
          "x": 0,
          "y": 0,
          "width": 0,
          "height": 0
        }},
        "rotation_deg": 0,
        "color": "#FFFFFF",
        "stroke_color": "#FF8BBC",
        "opacity": 1.0,
        "target_point": {{
          "x": 0,
          "y": 0
        }},
        "reason": "fungsi dekorasi ini"
      }}
    ],
    "readability_checks": {{
      "contrast_level": "good",
      "risk_notes": [],
      "suggested_overlay_gradient": {{
        "enabled": false,
        "position": "top",
        "color": "#000000",
        "opacity": 0.18
      }}
    }}
  }},
  "renderer_notes": {{
    "recommended_text_order": ["headline", "subtitle", "badge", "labels"],
    "if_text_too_long": "perkecil font 8-12%, pecah jadi 2-3 baris, jangan melebihi bbox",
    "if_background_too_busy": "tambahkan white/pink bubble box atau gradient tipis"
  }}
}}

Aturan penting:
- Jangan mengarang objek yang tidak ada di gambar.
- Jangan output bbox normalized 0-1.
- Semua x, y, width, height harus integer pixel.
- Semua font_size harus font_size_px.
- Semua stroke width harus width_px.
- Semua shadow blur/offset harus dalam px.
- Semua padding/radius harus dalam px.
- Kalau ada wajah manusia, wajah harus bebas dari teks.
- Kalau gambar punya banyak ruang kosong, gunakan ruang kosong itu.
- Kalau background ramai, gunakan box/bubble agar teks terbaca.
- Headline harus paling besar.
- Subtitle maksimal 60-75% ukuran headline.
- Rotasi headline maksimal -6 sampai 6 derajat.
- Rotasi label kecil maksimal -10 sampai 10 derajat.
- Jangan menaruh terlalu banyak elemen.
- Untuk cover, cukup 2-4 text layers dan 1-3 dekorasi.
- Output harus actionable untuk renderer."""
