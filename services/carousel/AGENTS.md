---
scope: carousel
depends_on: []
status: complete
---

# AGENTS.md — services/carousel

## Tujuan
Pembuatan konten carousel: template slide per niche (konten Bahasa Indonesia), preset caption, dan generator caption berbasis LLM (OmniRoute).

## Ekspor-Interface
- `templates.py`: `TEMPLATES` (25 template niche, konten slides di baris 14-381), `get_template` (385), `get_templates_by_niche` (390), `list_templates` (399), `list_niches` (407).
- `caption_presets.py`: `PRESET_CAPTIONS`, `get_preset` (35), `list_presets` (43).
- `caption_styles.py`: `CaptionGenerator` (94), `generate` (97), `generate_variants` (159), `_parse_response` (176, fallback 3 level), `list_styles` (200); env `OMNIRoute_URL` (13).
- `generator.py`: `STYLE_PRESETS` (51-94), `httpx.post` ke OmniRoute (146).
- `renderer.py`: `STYLE_PALETTES` (33-70).
- `__init__.py` (6 baris) mengekspor `CarouselGenerator, SlideRenderer, CarouselAssembler` — `CaptionGenerator` dan `TEMPLATES` TIDAK diekspor di level paket.

## Dependensi Internal
- Tidak ada dependensi ke service lain; OmniRoute diakses langsung via HTTP.

## Issue Spesifik
- [MEDIUM] `caption_styles.py:136` `generate` melakukan `httpx.post` sinkron di dalam fungsi async (`generate` dipanggil dari flow async) — memblokir event loop.
- [LOW] Duplikasi definisi style: `STYLE_PRESETS` (`generator.py:51-94`) dan `STYLE_PALETTES` (`renderer.py:33-70`) berisi data warna/gaya yang mirip — dua sumber kebenaran, mudah tidak sinkron.
- [LOW] `__init__.py` tidak mengekspor `CaptionGenerator`/`TEMPLATES` padahal keduanya publik-berguna — pemakaian harus lewat path modul penuh.

## Rekomendasi
- Pindahkan `httpx.post` ke `asyncio.to_thread` atau `httpx.AsyncClient`.
- Satukan definisi style menjadi satu modul bersama (mis. `styles.py`).
- Tambahkan `CaptionGenerator` dan `TEMPLATES` ke `__init__.py` jika memang API publik.
- **Belum diterapkan** — audit dokumentasi saja, tanpa perubahan kode.
