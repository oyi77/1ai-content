---
scope: services/storyboard
depends_on: (OmniRoute + provider gambar/LLM eksternal; dipakai services/routers)
status: complete
---

## Tujuan Folder Ini
Engine storyboard: membuat storyboard visual dari prompt (scenario LLM + generate gambar per scene), lalu menyusun layout HTML dengan gambar inline base64.

## Ekspor / Interface Utama
- `StoryboardEngine` (engine.py:35).
  - `OMNIRoute_URL` dibaca dari env (default `http://127.0.0.1:20128/v1`, l.29) + auth Bearer `OMNIROUTE_API_KEY` (l.30); model gambar env `STORYBOARD_IMAGE_MODEL` default `together/black-forest-labs/FLUX.2-pro` (l.32); model LLM env `STORYBOARD_LLM_MODEL` default `antigravity/claude-opus-4-6-thinking` (l.33).
  - `_call_llm` l.43; `_generate_image` l.66 (POST `/images/generations`, terima `url` atau `b64_json`); `_generate_images_parallel` l.115 (ThreadPool 5).
  - `create(prompt, style="cinematic", num_scenes=4, aspect_ratio="16:9")` l.139 — output per sesi di `/tmp/storyboard_output/storyboard_{ts}`.
  - Fallback saat JSON decode error l.226; `_create_layout` l.271 (HTML base64 inline); CLI l.360.

## Dependensi Internal
- Dipakai oleh: `services/routers/image.py` l.131 (rute `/image/storyboard` → `get_storyboard()`), yang juga serve `/tmp/storyboard_output`.

## Issue Spesifik
- **RESOLVED (2026-08-11)**: `OMNIRoute_URL` kini dibaca dari env dengan default (l.29) + auth Bearer `OMNIROUTE_API_KEY` (l.30) — konsisten dengan pola folder lain (research engine.py:19, dst).

## Rekomendasi Perbaikan Scoped
- Tambahkan timeout/retry eksplisit pada `_call_llm` dan `_generate_image`.
