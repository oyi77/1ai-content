---
scope: services/looping
depends_on: none (internal); eksternal: ffmpeg
status: complete
---

# services/looping

## Tujuan Folder Ini

Membuat video loop dari file audio: background visual (ffmpeg filters) dengan durasi panjang (default 1 jam), audio di-crossfade agar loop mulus. Dipakai untuk konten live/ambience.

## Ekspor / Interface Utama

- `engine.py` — `LoopingEngine`:
  - `create_loop(audio_path, output_path, duration_hours=1, fps=30, width=1920, height=1080, visual_type="gradient", image_path=None, base_color=None, crossfade_seconds=None)`
  - `batch_create(audio_dir, output_dir, ...)` — ekstensi yang diproses: mp3/wav/flac/m4a/ogg
  - `VISUAL_TYPES: Literal["gradient","particles","stars","waves","solid","image"]`
  - Metode implementasi: `_create_gradient_background`, `_create_stars_background` (cellular automata rule=30), `_create_waves_background`, `_create_solid_background`, `_create_image_background` (Ken Burns zoompan), `_crossfade_audio` (libmp3lame q:a 2), `_loop_to_duration` (stream_loop +2, CRF 23, aac 192k, faststart)
- `__init__.py` — docstring only: `LoopingEngine.create_loop(audio_path, output_path, duration_hours, visual_type)`

## Dependensi Internal

- Tidak ada dependensi antar modul internal.
- Eksternal: `ffmpeg` di PATH.

## Issue Spesifik

- **Medium**: `visual_type="particles"` terdaftar di `VISUAL_TYPES` + docstring, tapi TIDAK ADA implementasi `_create_particles_background` — argumen tersebut jatuh ke cabang else → di-render sebagai gradient. Fitur "particles" adalah dead feature yang menyesatkan pemakai.

## Rekomendasi Perbaikan Scoped

- Hapus `"particles"` dari `VISUAL_TYPES`/docstring, atau implementasikan `_create_particles_background` (mis. via filter `geq`/`nullsrc` + `random` noise) supaya nilai yang diterima benar-benar dirender.

> Last updated: 2026-08-02
