---
scope: comic_gen
depends_on:
  - path: services/bookshelf/language.py
    type: services
status: complete
---

# AGENTS.md — services/comic_gen

## Tujuan
Generasi komik otomatis: script (LLM lokal/Ollama), gambar panel (OmniRoute/AgentCash dengan fallback placeholder), dan komposisi halaman (COMIC/MANGA/MANHWA) ke direktori output.

## Ekspor-Interface
- `comic_types.py`: enum `ComicFormat` (12: COMIC/MANGA/MANHWA), `PanelShape` (19); dataclass `Character` (26), `SpeechBubble` (35), `Panel` (42), `Page` (55), `Episode` (62), `ComicScript` (70), `RenderedPage` (83).
- `engine.py`: `OUTPUT_DIR` = `/home/openclaw/projects/1ai-content/data/comic` (17); `generate_comic_pipeline` (20, AsyncGenerator dengan event: script_generating/script_ready/rendering/episode_rendered/complete/error); `run_pipeline` (137).
- `script_engine.py`: env `COMIC_BASE_URL` (25, default `http://localhost:11434/v1` Ollama), `COMIC_MODEL` (27, default `"qwen3:0.6b"`), `COMIC_NUM_CTX` (28, 4096), TEMPERATURE 0.7 (29), MAX_TOKENS 8000 (30); `_format_guide` (34); `_build_generation_prompt` (69); `_normalize_script_data` (153); `_clean_json` (172); `_parse_json` (187, repair fallback); `_parse_script` (200); `generate_script` (276, `asyncio.to_thread` 336, fallback `response_format` 324); `script_to_dict` (351).
- `panel_gen.py`: env `OMNIROUTE_BASE_URL` (24, default `http://localhost:20128/v1`; `OMNIROUTE_BASE` derived 25, strip `/v1`), `OMNIROUTE_IMAGE_MODEL` (26, default `"black-forest-labs/flux-1-dev"`); `_try_omniroute` (31); `AGENTCASH_BASE="https://stablestudio.dev"` (64), `AGENTCASH_MODEL` (65, default `"stable-diffusion-3.5-large"`); `_try_agentcash` (68, poll 30×2s); `_shape_dimensions` (130); `_build_image_prompt` (149); `_get_font` (157); `_render_placeholder` (199); `generate_panel_image` (240, chain OmniRoute→AgentCash→Placeholder, selalu return PIL).
- `page_composer.py`: `_PAGE_DIMS` (24: COMIC 636×984, MANGA 720×1020, MANHWA 800×1280), `_GUTTER=6` (36), `_MARGIN` (37); `_layout_comic` (46, LTR), `_layout_manga` (76, RTL), `_layout_manhwa` (102), `_LAYOUT_FN` (138), `_distribute_rows` (145), `_draw_grid` (152), `_add_borders` (178), `_add_speech_bubbles` (221), `_draw_panel_text` (264), `compose_page` (320, async; MANGA→grayscale 359), `compose_episode` (373), `compose_cover` (385).
- `__init__.py` KOSONG (1 baris docstring, tanpa ekspor).

## Dependensi Internal
- `services/bookshelf/language.py:get_language_instruction` dipakai `script_engine._build_generation_prompt` (76) — DALAM SCOPE repo, diluar folder ini.

## Issue Spesifik
- [MEDIUM] `panel_gen.py:102-103` `_try_agentcash`: `image_url` bisa `UnboundLocalError` jika loop `while` keluar karena `status != 200`; error ini tertelan oleh except umum (120) → kegagalan gambar berubah jadi fallback placeholder yang tidak dicatat (silent fail).
- [LOW] `script_engine.py:293` docstring `generate_script` menyebut default model `"phi3:mini"` padahal konstanta aktual `"qwen3:0.6b"` (27) — mismatch docs.
- [LOW] `script_engine.py:267` `_parse_script` meng-hardcode `language="en"` lalu di-set ulang (340) — rentan mengabaikan bahasa dari prompt bila alur 267-340 berubah.
- [LOW] `page_composer.py:221` `_add_speech_bubbles` menggambar teks tanpa clipping — teks panjang bisa overflow keluar gelembung/panel.
- [LOW] `page_composer.py:46` docstring `_layout_comic` bilang "max ~9 panels" padahal 12 panel bisa di-layout tanpa error.

## Rekomendasi
- `_try_agentcash`: inisialisasi `image_url = None` di awal; tangani status != 200 secara eksplisit (log) sebelum except umum.
- Sinkronkan docstring `generate_script` dengan konstanta model.
- Bangun `language` dari parameter prompt, bukan hardcode.
- Tambah text-wrapping/clipping di `_add_speech_bubbles`.
- **Belum diterapkan** — audit dokumentasi saja, tanpa perubahan kode.
