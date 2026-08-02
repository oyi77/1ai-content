---
scope: services/routers
depends_on: hampir semua services/ (download, trends, engagement, cloak, autopilot, calendar, ab_testing, analyze, image, audio, pinterest, research, remetadata, repurpose, remotion, bookshelf, carousel, comic_gen, ebook) — lihat per-file
status: complete
---

## Tujuan Folder Ini
Layer routing FastAPI yang mendaftarkan endpoint tiap fitur ke aplikasi utama. Berisi 21 file router; semuanya di-mount di `services/api.py` l.68-87 (import) & l.90-108 (via `registry.add_router(...)`; `registry.register(EbookContentGenerator(), prefix="/text/ebook")` l.109).

## Ekspor / Interface Utama
- `__init__.py` l.9 — `register_generator_routes(app, generator, prefix, tags)`: CRUD generik + `generator.extra_routes()` (l.80).
- `_shared.py` l.8-12 — re-export dari `services/utils` (`probe_video`, `probe_field`, `run_subprocess`).
- Ringkasan per router (semua rute terdaftar via `get_*` singleton dari service masing-masing):
  - `health.py` — `/health`.
  - `ab_testing.py` `/ab-test/*` → `get_ab_testing`; `analyze.py` `/analyze/*` → `get_analyzer`; `autopilot.py` `/autopilot/*` → `get_autopilot`; `calendar.py` `/calendar/*` → `get_calendar`; `cloak.py` `/cloak/*` → `get_cloak`; `engagement.py` → `get_engagement`.
  - `download.py` — `/download/video`, `/download/profile` → `services/download/cascade` + `TIKWM_API_URL` [out of scope]; `tikwm.py` — proxy ke `TIKWM_API_URL` [out of scope].
  - `trends.py` — `/trending/{cached,scan,status,generate}` → `services/trends/scanner.get_scanner` (IN-SCOPE).
  - `image.py` l.131 — `/image/storyboard` → `get_storyboard()` → `engine.create`, serve `/tmp/storyboard_output` (l.148-154); comic/carousel → comic_gen & carousel [out of scope].
  - `audio.py` l.94 — `/audio/speech` → `get_tts()` → `engine.synthesize`; `/audio/speech/voices`; serve `/tmp/tts_output` (l.123-129).
  - `pinterest.py` (153) — `/pinterest/search` (l.36, `search_pins`), `/pinterest/post` (l.51, download + CloakBrowser), `/publish-to-facebook` (l.104-149, POST token ke `http://localhost:8200/v1/distribution/publish`; `page_token` juga diterima dari body request l.31).
  - `research.py` l.11-19 — lazy singleton `_get_research_engine` → `services/research/engine.ResearchEngine` (IN-SCOPE); `/research/generate-book` SSE → `services/bookshelf` [out of scope].
  - `text.py` (334) — hook caption generator: `_HOOK_ARCHETYPES` l.68, `_CATEGORY_HOOKS` l.121, `_generate_hook_sync` l.207, `_critique_hook_sync` l.236; caption/book → carousel/bookshelf [out of scope].
  - `upload.py` l.16 — simpan ke `/tmp/content_uploads` dengan nama `f"{timestamp}_{file.filename}"`.
  - `content.py` — router `APIRouter(prefix="", tags=["content-pipeline"])`, 12 endpoint legacy content-pipeline (`/carousel/create|styles|templates[/{id}]`, `/loop/create|video/{filename}`, `/repurpose`, `/regenerate` (alias), `/remeta`, `/storyboard/create|image/{path:path}`, `/content/render-ad`); model inline CarouselRequest/LoopRequest/StoryboardRequest/RenderAdRequest; carousel pakai `CarouselAssembler()` langsung (bukan get_carousel — CarouselGenerator tidak punya `.create`); loop output `/tmp/looping_output/loop_{ts}.mp4` base_color `"0x1a1a2e"`; storyboard serve `/tmp/storyboard_output`; render-ad `import services.remotion` di handler.
  - `compat.py` — router `APIRouter(prefix="", tags=["compat-legacy"])`, 10 endpoint re-expose kontrak legacy frontend yang hilang saat remediasi `/audio/*` (commit a2b6c6c): `/tts/voices|synthesize|audio/{filename}`, `/music/generate`, `/suno/generate|bgm|lofi`, `/captions/styles|presets|generate`; semua delegasi ke engine yang sama dengan audio.py (`get_tts()`, `get_music()`).
  - `video.py` (830) — `/video/refresh-cookies` (l.30-81, tulis ke `config/tiktok_cookies.txt` — cukup nama path saja); `/video/process` l.86 (re-encode H264 + reframe + transforms); `/video/regenerate` l.245 (pipeline best-effort, pakai `services/repurpose/presets.COLOR_PRESETS` l.345 & `OVERLAY_POSITIONS` l.361, drawtext escape l.363 rapuh); `/video/remeta` l.762 → `get_remetadata_engine()` (IN-SCOPE); `/video/repurpose` l.785 → `get_repurpose_engine()` (IN-SCOPE); `/video/ad` l.811 → `import services.remotion` → `render_product_ad` (IN-SCOPE); `video_movie_media` l.697-703 punya path-traversal guard (`resolve()` + `startswith`).

## Dependensi Internal
- Hampir seluruh folder services. Router hanya memanggil singleton `get_*` dari service masing-masing — tidak ada logika bisnis di router (kecuali transformasi kecil di video.py).

## Issue Spesifik
- **Medium (hipotesis)**: `upload.py` l.16 memakai `file.filename` mentah ke path `/tmp/content_uploads/{timestamp}_{file.filename}` tanpa sanitasi separator path → potensi path traversal bila filename berisi `../` atau `/`.
- **Medium (hipotesis)**: `pinterest.py` l.130-141 mengirim `page_token` (token halaman Facebook) plaintext ke `http://localhost:8200/v1/distribution/publish`; token juga bisa datang dari body request (l.31).
- **Low**: `video_clip` (l.548) & `_get_video_clip_fn` (l.540) dead code — komentar file sendiri menyebut "NOT registered as a route".
- **Low**: escaping drawtext rapuh di `video.py` l.363 (pola sama dengan remetadata engine.py:280 & repurpose providers/video.py:212).
- **Low**: `text.py` l.207-218 — `affiliate_link` diterima di `_generate_hook_sync` tapi tidak pernah disisipkan ke caption.

## Rekomendasi Perbaikan Scoped
- Sanitasi `file.filename` (pakai `Path(...).name` atau whitelist karakter) di upload.py l.16.
- Hapus dead code `video_clip`/`_get_video_clip_fn`, atau beri tanda jelas (mis. `@deprecated`) bila memang dipertahankan.
- Sisipkan `affiliate_link` ke caption (atau hapus parameter bila memang tidak dipakai) di text.py l.207-218.

> Last updated: 2026-08-02 — +content.py (12 endpoint content-pipeline) +compat.py (10 endpoint legacy re-expose), registrasi api.py l.85-86 (import) & l.107-108 (add_router).
