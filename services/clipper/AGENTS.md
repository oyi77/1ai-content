---
scope: clipper
depends_on: []
status: complete
---

# AGENTS.md — services/clipper

## Tujuan
Memotong video panjang menjadi klip pendek: transkripsi (faster-whisper), deteksi highlight via LLM (OmniRoute), dan reframe/resize/karaoke subtitle via ffmpeg + pysubs2.

## Ekspor-Interface
- `HighlightDetector` (`highlight_detector.py:35`): env `OMNIRoute_URL` (22), `PLATFORM_DEFAULTS` (24-29: tiktok 60s/100/6, youtube 60/70/8, instagram 30/100/10, facebook 60/80/5); `_call_llm` (40, sync `httpx.post`, model `"auto/all-working"`, timeout 120); `detect_highlights` (61; skor = hook*.35 + emotion*.25 + surprise*.25 + density*.15 di 171; `_snap_to_word` 330); `generate_clip_metadata` (199); `_extract_words` (280); `_build_timestamped_text` (303); CLI (349).
- `Reframer` (`reframer.py:36`): `_verify_ffmpeg` (41), `_run_ffmpeg` (46), `_get_duration` (67), `extract_clip` (85, `-c copy`), `reframe_to_vertical` (110), `reframe_to_vertical_with_face` (151), `generate_karaoke_subtitles` (169, pysubs2 `\k{dur_cs}`), `burn_subtitles` (237), `generate_thumbnail` (260), `apply_mirror` (313), `apply_speed` (325, rentang 0.5-2.0), `apply_crop_zoom` (345, zoom>=1.0), `_get_style_preset` (370), CLI (425).
- `Transcriber` (`transcriber.py:16`, lazy `_ensure_model` 31, faster-whisper): `transcribe` (51), `transcribe_from_video` (135; ffmpeg→wav 16k mono pcm_s16le, timeout 120).
- `ClipperEngine` (`engine.py:26`): `clip_video` (33, job_id `clip_{time}` 45), `_process_clip` (120), `_get_clip_segments` (192), `_resolve_video` (220, yt-dlp timeout 300, fallback `-f mp4`); output base `/tmp/clipper_output`.
- `__init__.py` mengekspor HANYA `HighlightDetector, Reframer` — `Transcriber` dan `ClipperEngine` tidak diekspor.
- Test: `test_reframer.py` (204 baris) — test manual fungsional.

## Dependensi Internal
- Tidak ada dependensi ke service lain; butuh `ffmpeg`, `ffprobe`, `yt-dlp`, `faster-whisper`, `pysubs2`.

## Issue Spesifik
- [MEDIUM] `highlight_detector.py:40` `_call_llm` sinkron dalam konteks async (timeout 120s) — memblokir event loop lama.
- [LOW] `engine.py` tidak ada cleanup direktori output `/tmp/clipper_output` — akumulasi file klip antar-jalankan.
- [LOW] `reframer.py:151` `reframe_to_vertical_with_face` adalah STUB.
- [LOW] `transcriber.py:135` `transcribe_from_video` memakai `NamedTemporaryFile` untuk wav tanpa penghapusan eksplisit — file sementara tersisa di `/tmp`.
- [LOW] `__init__.py` tidak mengekspor `ClipperEngine`/`Transcriber` (API publik yang berguna).

## Rekomendasi
- Pindahkan `_call_llm` ke thread/async client; turunkan timeout atau jadikan konfigurabel.
- Tambah cleanup `/tmp/clipper_output` (atau hapus per-job).
- Lengkapi atau beri tanda eksplisit pada STUB face-tracking.
- Hapus wav sementara setelah transkripsi selesai (try/finally).
- **Belum diterapkan** — audit dokumentasi saja, tanpa perubahan kode.
