---
scope: services/tts
depends_on: (eksternal: edge-tts / melo; dipakai services/routers)
status: complete
---

## Tujuan Folder Ini
Engine text-to-speech: sintesis ucapan dari teks menggunakan edge-tts atau MeloTTS (auto-probe engine yang tersedia), output ke `/tmp/tts_output` (engine.py:31).

## Ekspor / Interface Utama
- `TTSEngine` (engine.py:27).
  - `_check_engines` l.35 — probe ketersediaan `edge-tts` dan `melo`.
  - `synthesize` l.52; `_get_default_voice` l.95 (peta bahasa: `id`→`id-ID-ArdiNeural`, `en`→`en-US-GuyNeural`, plus `ms`/`th`/`tl`/`vi`); `_edge_tts` l.107; `_melo_tts` l.135; `_get_audio_duration` l.159; `list_voices` l.171; CLI l.191.

## Dependensi Internal
- Dipakai oleh: `services/routers/audio.py` l.94 (rute `/audio/speech` → `get_tts()` → `engine.synthesize`; `/audio/speech/voices`; serve `/tmp/tts_output`).

## Issue Spesifik
Tidak ada temuan material di folder ini (probe engine + fallback sudah ditangani).

## Rekomendasi Perbaikan Scoped
- Pertimbangkan fallback bahasa yang lebih lengkap di `_get_default_voice` bila pasar bahasa bertambah.
- Tambahkan timeout pada pemanggilan engine eksternal agar `synthesize` tidak menggantung saat engine probe macet.
