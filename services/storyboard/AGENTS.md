---
scope: services/storyboard
depends_on: (OmniRoute + provider gambar/LLM eksternal; dipakai services/routers)
status: complete
---

## Tujuan Folder Ini
Engine storyboard: membuat storyboard visual dari prompt (scenario LLM + generate gambar per scene), lalu menyusun layout HTML dengan gambar inline base64.

## Ekspor / Interface Utama
- `StoryboardEngine` (engine.py:35).
  - `OMNIRoute_URL` di-hardcode (l.29); model gambar env `STORYBOARD_IMAGE_MODEL` default `together/black-forest-labs/FLUX.2-pro` (l.31); model LLM env `STORYBOARD_LLM_MODEL` default `antigravity/claude-opus-4-6-thinking` (l.32).
  - `_call_llm` l.43; `_generate_image` l.66 (POST `/images/generations`, terima `url` atau `b64_json`); `_generate_images_parallel` l.115 (ThreadPool 5).
  - `create(prompt, style="cinematic", num_scenes=4, aspect_ratio="16:9")` l.139 — output per sesi di `/tmp/storyboard_output/storyboard_{ts}`.
  - Fallback saat JSON decode error l.226; `_create_layout` l.271 (HTML base64 inline); CLI l.360.

## Dependensi Internal
- Dipakai oleh: `services/routers/image.py` l.131 (rute `/image/storyboard` → `get_storyboard()`), yang juga serve `/tmp/storyboard_output`.

## Issue Spesifik
- **Catatan**: `OMNIRoute_URL` di-hardcode (l.29) — beda dari pola folder lain yang membaca env (mis. research engine.py:19). Bukan temuan besar, tapi konsistensi konfigurasi perlu dijaga.

## Rekomendasi Perbaikan Scoped
- Pindahkan `OMNIRoute_URL` ke env dengan default, agar konsisten dengan service lain dan mudah diubah per environment.
- Tambahkan timeout/retry eksplisit pada `_call_llm` dan `_generate_image`.
