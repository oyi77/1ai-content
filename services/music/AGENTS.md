---
scope: services/music
depends_on: none (internal); eksternal: package pip `suno` (Suno API), `audiocraft` (MusicGen), ffmpeg; env `SUNO_API_KEY`
status: complete
---

# services/music

## Tujuan Folder Ini

Generator musik/BGM dengan 3 lapis engine: Suno API → audiocraft (MusicGen) → fallback ffmpeg (tone sintetik). Ada preset tema BGM dan mood lofi. Output ke `/tmp/music_output`.

## Ekspor / Interface Utama

- `generator.py` — `MusicGenerator`:
  - `generate(prompt, duration_seconds=60, style=None, engine=None, lyrics=None, instrumental_only=True)` — jalur engine:
    - `suno`: `_suno_via_api` (httpx POST `studio-api.suno.ai`, Bearer `SUNO_API_KEY`, `wait_audio: True`) atau `_suno_via_package` (import `suno`)
    - `audiocraft`: `_generate_audiocraft` (MusicGen `musicgen-small`, durasi di-cap 30s)
    - `ffmpeg`: `_generate_ffmpeg` (sine 220Hz + aecho + lowpass)
  - `generate_bgm(theme)` — 10 tema: corporate/cinematic/upbeat/ambient/lofi/tech/vlog/romantic/dark/happy
  - `generate_lofi(mood)` — 5 mood
- `__init__.py` — docstring only (re-export minimal)

## Dependensi Internal

- Tidak ada dependensi antar modul internal.
- Eksternal: `suno-api` (pip, opsional), `audiocraft` (pip, opsional), `ffmpeg` di PATH, `SUNO_API_KEY` (env).

## Issue Spesifik

- **Low**: `generator.py` — nama file output memakai `hash(prompt)` (built-in) yang non-deterministik antar proses (dipengaruhi `PYTHONHASHSEED`) → file yang sama bisa punya nama berbeda tiap run, menyulitkan caching/dedup.
- **Low**: `duration_seconds` diabaikan pada jalur Suno (nilai tidak dikirim ke API; `wait_audio: True` menunggu default) → durasi hasil bisa menyimpang dari permintaan.

## Rekomendasi Perbaikan Scoped

- Ganti `hash(prompt)` dengan hash deterministik (`hashlib.sha256(prompt.encode()).hexdigest()[:N]`).
- Kirim parameter durasi ke Suno API bila didukung, atau dokumentasikan bahwa jalur Suno mengabaikan `duration_seconds`.

> Last updated: 2026-08-02
