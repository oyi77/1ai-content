---
scope: services/movie_gen
depends_on: services/tts (narasi), services/music (BGM), services/media (output dir), eksternal: Ollama (env COMIC_*), ffmpeg
status: complete
---

# services/movie_gen

## Tujuan Folder Ini

Generator film pendek dari prompt teks: script (LLM) → render gambar scene (Pillow) → narasi (TTS) → BGM (MusicGenerator/ambient) → assemble video (ffmpeg). Menggunakan pola konfigurasi env `COMIC_*` (mirror dari `services/comic_gen`).

## Ekspor / Interface Utama

- `engine.py` — async generator `generate_movie(prompt, *, language="en", genre="short_film", num_scenes=4, target_duration=60, generate_images=True, generate_audio=True, generate_video=True, output_dir=DEFAULT_OUTPUT_DIR, bgm_mood="", bgm_volume=0.15)`:
  - Yield SSE events: `log`, `script_generating`, `script_ready`, `scene_rendering`, `scene_rendered`, `audio_rendering`, `audio_rendered`, `video_assembling`, `complete`, `error`
  - `DEFAULT_OUTPUT_DIR = os.path.join(dirname, "..", "media", "movies")` (baris ~31) — sumber isi `services/media/movies/`
  - run dir: `movie_{run_id}` (run_id = `int(time.time())`), subfolder `images/`, `audio/`, `video/`
  - `_render_scene_image` (Pillow 1920x1080, gradien gelap, font DejaVuSans + fallback `load_default`)
  - `_get_tts_engine` (lazy import dari `services.tts`), `_generate_narration` (panggil `engine.generate(text, output_path, lang=...)` atau `engine.synthesize`)
  - `_merge_audio_files` (concat, `-c copy`)
  - `_find_or_generate_bgm` — coba `MusicGenerator.generate(...)`, fallback `_generate_ambient_tone` (sine freq per mood map)
- `movie_types.py` — dataclass: `MovieGenre` (Enum: short_film/documentary/music_video/ad/explainer/tutorial), `SceneType`, `Character`, `Shot`, `Scene`, `MovieScript`, `RenderedScene`, `MovieOutput`
- `script_engine.py` — `ScriptEngine`:
  - `BASE_URL = os.environ.get("COMIC_BASE_URL", "http://localhost:11434/v1")`, `API_KEY = os.environ.get("COMIC_API_KEY", "ollama")`, `MODEL = os.environ.get("COMIC_MODEL", "qwen3:0.6b")`, `NUM_CTX = 4096`
  - `_build_client` (AsyncOpenAI), `generate_script(...)` → `(stats, MovieScript)`; `_clean_json`, `_parse_script`; `extra_body={"num_ctx": NUM_CTX}` kecuali `BASE_URL == "https://api.openai.com"` (variasi host OpenAI)
- `video_gen.py`:
  - `_ffmpeg(*args)` (returncode != 0 → RuntimeError), `_ensure1920x1080`
  - `_create_ken_burns_segment` (zoom in/out/none, fps 24)
  - `_concat_with_crossfade(...)` — lihat Issue di bawah
  - `_add_audio_to_video` (narasi + bgm mix)
  - `render_scene_segment(scene_id, image_path, duration, output_dir, audio_path)` → return tuple `(scene_id, path)` — lihat Issue di bawah

## Dependensi Internal

- `services/tts` — engine TTS (tidak ada AGENTS.md di `services/tts/` saat ini)
- `services/music` — `MusicGenerator` untuk BGM — lihat [services/music/AGENTS.md](../music/AGENTS.md)
- `services/media` — output dir — lihat [services/media/AGENTS.md](../media/AGENTS.md)
- Eksternal: Ollama lokal (env `COMIC_BASE_URL`/`COMIC_API_KEY`/`COMIC_MODEL`), ffmpeg

## Issue Spesifik

- **RESOLVED** (tuple bug): `engine.py` kini unpack `_, seg_path = await render_scene_segment(...)` (baris ~160-164), jadi `segment_paths` berisi `str`, bukan tuple.
- **FIXED 2026-08-03** (narasi ganda): segmen dirender senyap (`render_scene_segment(..., audio_path=None)`), narasi digabung SEKALI via `_merge_audio_files` → `assemble_movie(audio_path=merged_audio)`. Sebelumnya per-scene audio di-bake ke segmen DAN track gabungan di-mix lagi → narasi terdengar 2×. `_add_audio_to_video` menangani `audio_path=None` (branch BGM-only), `_concat` tanpa transisi → timeline audio gabungan sejajar durasi segmen.
- **Known — dibiarkan** (dead code kosmetik): `video_gen.py:_concat_with_crossfade` — filter chain acrossfade dihitung tapi tidak dipakai; jalur eksekusi selalu concat demuxer tanpa transisi (komentar "Simpler approach", baris ~157). Baris `duration` ditulis dengan durasi nyata (`_get_video_duration`), hanya dipakai concat demuxer. Rename jadi `_concat_segments` opsional.
- **Medium** (hipotesis): `engine.py:_find_or_generate_bgm` memanggil `MusicGenerator.generate(mood=..., output_path=..., duration=...)`, sementara signature asli `services/music/generator.py` adalah `generate(prompt, duration_seconds=...)` — kwarg tidak cocok → selalu exception → selalu fallback `_generate_ambient_tone`. Akibat: BGM selalu ambient tone, `bgm_mood` tidak efektif.
- **Low**: `script_engine.py` — default `API_KEY = "ollama"` dan `BASE_URL = localhost:11434` (bukan secret nyata; nilai placeholder Ollama). Env `COMIC_*` mudah tertukar dengan config `services/comic_gen`.

## Rekomendasi Perbaikan Scoped

- Verifikasi jalur assemble dengan eksekusi nyata; jika tuple bug terkonfirmasi, ubah `render_scene_segment` untuk return `str` saja (atau unpack `(scene_id, path)` di engine.py).
- Rename `_concat_with_crossfade` menjadi `_concat_segments` (atau perbaiki filter chain xfade yang sesungguhnya), dan hapus baris `duration` yang tidak dipakai dari concat file.
- Cocokkan pemanggilan `MusicGenerator.generate` dengan signature asli (`prompt`/`duration_seconds`) atau perbaiki signature-nya; pastikan `bgm_mood` diteruskan.
- Dokumentasikan env `COMIC_*` dan bedakan dari konfigurasi `services/comic_gen`.

> Last updated: 2026-08-02
