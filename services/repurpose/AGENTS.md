---
scope: services/repurpose
depends_on: services/clipper (transcriber, reframer), services/trends (seo_generator), services/platform_presets [inferensi], services/remotion [inferensi]
status: complete
---

## Tujuan Folder Ini
Engine repurposing video: mengubah satu video panjang menjadi konten multi-format (klip, subtitle, overlay, musik latar, posting sosial). Ada dua implementasi engine yang tumpang tindih — `engine.py` (monolitik) dan `cascade.py` (refactor terbaru) — `__init__.py` mengekspor `RepurposeEngine` dari `cascade.py`.

## Ekspor / Interface Utama
- `RepurposeEngine` (cascade.py:60, di-export dari __init__.py) — `repurpose()` l.87-293, alur 13 langkah; error dikembalikan sebagai `{"success": False, "error": ...}`.
- `engine.py` l.42 — implementasi lama monolitik (CLI l.1056). **Duplikasi logika dengan cascade.py.**
- `providers/` (dipakai cascade.py):
  - `music.py` — `_remix_audio` l.8 (`-map 0:v`; `aloop=loop=-1:size=2e+09`).
  - `video.py` — `_process_segment` l.12 (atempo hanya dipakai saat speed≠1); `_assemble_with_transitions` l.75 (xfade, maks 6 segmen); `_simple_concat` l.88 (concat.txt, `-safe 0`); `_add_text_overlay` l.212 (escaping rapuh); `_add_subtitles` l.297 (SRT force_style); `_final_encode` l.343 (fallback `shutil.copy2`); `_generate_thumbnail` l.368.
  - `reka.py` — `_detect_scenes` l.13; `_transcript_based_segments` l.41; `_equal_chunks` l.68; `_get_text_for_range` l.80; `_classify_segment` l.91.
  - `presets.py` — `COLOR_PRESETS` l.8; `TRANSITION_PRESETS` l.20; `OVERLAY_POSITIONS` l.31; `HOOK`/`CTA`/`EXAMPLE_KEYWORDS` l.42-55.
  - `utils.py` — `_get_duration` l.10; `_cleanup_temp` l.25; `_fmt_srt` l.37; `_is_sentence_end` l.46.

## Dependensi Internal
- Import `services.clipper.{transcriber,reframer}`, `services.trends.seo_generator`, `services.platform_presets` [FILE TIDAK TERLAMPIR — inferensi].
- Dipakai oleh: `services/routers/video.py` (rute `/video/repurpose` → `get_repurpose_engine()`), `services/autopilot/tiktok_publisher.py`, `services/faceless/engine.py` [inferensi].

## Issue Spesifik
- **Medium**: segmen tanpa track audio + speed ≠ 1 → ffmpeg `atempo` pada input tanpa audio gagal (providers/video.py l.12) — perlu cek ada/tidaknya audio sebelum memproses.
- **Medium (debt)**: duplikasi `RepurposeEngine` — `engine.py` l.42 vs `cascade.py` l.60; dua implementasi bisa divergen (bug diperbaiki di satu, tidak di lain).
- **Low**: `_add_text_overlay` escaping drawtext manual rapuh (providers/video.py l.212) — pola sama dengan remetadata engine.py:280 & routers/video.py:363.
- **Low**: `_remix_audio -map 0:v` mengasumsikan audio ada di stream 0 (providers/music.py l.8); input dengan layout stream berbeda akan salah map.

## Rekomendasi Perbaikan Scoped
- Di `_process_segment`: probe stream audio (via `services/utils.probe_video` atau ffprobe) dan hanya aplikasikan atempo bila audio ada.
- Hapus `engine.py` setelah memastikan `cascade.py` menutup semua kasus (atau jadikan `engine.py` wrapper tipis ke cascade).
- Ganti escaping drawtext manual dengan `textfile=` ffmpeg (sama seperti rekomendasi remetadata).
