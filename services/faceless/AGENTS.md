---
scope: services/faceless
depends_on: services/tts (modul `services/tts/engine`), `services/platform_presets.py`, OmniRoute (LLM), Pexels/Openverse, ffmpeg
status: complete
---

# services/faceless

## Tujuan Folder Ini

Pipeline video "faceless": dari skrip teks menjadi video jadi. Alur: script (LLM via OmniRoute) → TTS → stock footage → compose scene → stitch → captions → BGM. Punya jalur khusus untuk video produk.

## Ekspor / Interface Utama

- `composer.py` — `FacelessComposer`:
  - `apply_ken_burns` (zoom_in/zoom_out/pan_left/pan_right/pan_up), `compose_scene`, `compose_scene_ab_split` (xfade), `add_captions` (drawtext, butuh libfreetype; posisi y=80% tinggi), `stitch_scenes` (fade/slide/wipe/none; xfade + acrossfade; fallback concat jika transisi ≥ total durasi), `add_bgm` (loop, volume 0.15), `_concat_scenes` (concat demuxer). Encoding: CRF 23, libx264 medium, yuv420p, AAC 192k.
- `engine.py` — `FacelessEngine`:
  - `PLATFORM_PRESETS` — dibangun dari `services.platform_presets.PLATFORM_PRESETS` via `_PLATFORM_KEY_MAP` (tiktok, youtube→youtube_shorts, instagram→instagram_feed, facebook)
  - `generate_video`, `generate_product_video`, `batch_generate` (dari clone plan)
  - `output_base = '/tmp/faceless_output'` (baris ~63)
- `script_engine.py` — `ScriptEngine`:
  - `_call_llm` — httpx POST `${OMNIRoute_URL}/chat/completions` (env `OMNIRoute_URL`, default `http://127.0.0.1:20128/v1`, model `auto/best-chat`, temp 0.7, timeout 60)
  - `generate_script` (VALID_STYLES: educational/story/product/listicle/motivational; durasi per platform; visual_keywords wajib English)
  - `generate_product_script` (VALID_PRODUCT_STYLES: pain_point/scene_recommendation/comparison/story; `seo` → hashtags/cover_text/interaction_guide)
  - Parse JSON via regex greedy `\{[\s\S]*\}`
- `stock_engine.py` — `StockEngine`:
  - Pexels (`PEXELS_API_KEY` env; Authorization langsung api key) + Openverse fallback (tanpa key)
  - `search_videos(query, source="all", count, orientation)`, `download_video` (stream), `search_and_download` (ThreadPoolExecutor max 4)
  - `FALLBACK_MAP` 10 tema

## Dependensi Internal

- `services.tts.engine.TTSEngine` (voice `id-ID-GadisNeural` / `en-US-JennyNeural`) — **tidak ada AGENTS.md** di `services/tts/` saat ini.
- `services.platform_presets.PLATFORM_PRESETS` (modul `services/platform_presets.py`, bukan folder).
- OmniRoute LLM (env `OMNIRoute_URL`), Pexels/Openverse API, ffmpeg.

## Issue Spesifik

- **Medium**: `services/faceless/engine.py:219-221` — blok `finally:` hanya berisi `pass` dengan komentar "Cleanup work dir (keep final video)". Work dir (stock, TTS, scene mp4) TIDAK PERNAH dibersihkan → disk leak bertambah setiap generate.
- **Medium**: `services/faceless/stock_engine.py` `_do_download` — penentuan index via `idx = len([d for d in downloaded if d.get("query") == query])` membaca list `downloaded` yang sedang di-append dari main thread → race condition potensial → filename collision.
- **Medium**: `services/faceless/script_engine.py` — parse JSON dengan regex greedy `\{[\s\S]*\}` bisa salah menangkap brace jika respons LLM memuat teks tambahan berbrace (nested) di luar JSON.

## Rekomendasi Perbaikan Scoped

- Hapus work dir di `finally` (mis. `shutil.rmtree(work_dir, ignore_errors=True)`) sambil memastikan video final dipindah dulu keluar dari work dir.
- Ganti perhitungan index dengan counter lokal per task (mis. pakai hasil iterasi `enumerate`/dict keyed by query) supaya thread-safe.
- Ganti regex dengan ekstraksi berbasis `json.loads` setelah strip markdown fence, atau parse dari index `{` pertama sampai `}` terakhir.

> Last updated: 2026-08-02
