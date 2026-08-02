---
scope: services/remetadata
depends_on: services/trends (seo_generator), services/utils (inferensi)
status: complete
---

## Tujuan Folder Ini
Engine remetadata video: membuat metadata baru (judul, deskripsi, tag, waktu posting) untuk video yang sudah ada, lalu menulis ulang ke file video (menggunakan ffmpeg) di `/tmp/remetadata_output` (engine.py:48).

## Ekspor / Interface Utama
- `ReMetadataEngine` (engine.py:29), di-export dari __init__.py.
  - Konstruktor l.45 membuat `self.seo = SEOGenerator()` (import `services.trends.seo_generator` l.26).
  - `remetadata()` (l.50) — proses satu file: ffmpeg dengan speed acak 0.98-1.02 (l.107), overlay teks drawtext (l.122-144), `-map_metadata -1` (l.176).
  - `batch_remetadata` (l.213).
  - `_generate_metadata` (l.236) — title template `"Tips {niche} Terbaik..."` (l.241).
  - `_file_hash` l.258, `_get_duration` l.266, `_escape_ffmpeg_text` l.280, CLI l.300.
- Output ke `/tmp/remetadata_output`.

## Dependensi Internal
- Memakai `SEOGenerator` dari `services/trends/seo_generator.py`.
- Dipakai oleh: `services/routers/video.py` (rute `/video/remeta` → `get_remetadata_engine()`).

## Issue Spesifik
- **Low**: `_escape_ffmpeg_text` (l.280) memakai escaping manual (pola rapuh — mudah meleset untuk karakter di luar himpunan yang di-handle, menyebabkan perintah ffmpeg gagal/berperilaku aneh). Pola yang sama muncul di repurpose providers/video.py:212 dan routers/video.py:363.

## Rekomendasi Perbaikan Scoped
- Ganti escaping drawtext manual dengan mekanisme robust: tulis teks ke file sementara dan pakai `textfile=` ffmpeg, atau gunakan pustaka escaping ffmpeg filter yang teruji.
- Tambahkan unit test untuk `_escape_ffmpeg_text` dengan kasus kutip, `%`, `:`, `'`, newline.
