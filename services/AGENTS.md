---
scope: services
depends_on: [../src, ../prisma, ../config]
status: complete
---

# AGENTS.md — services/

## Tujuan Folder Ini
Kumpulan layanan Python mandiri (FastAPI) yang melayani pipeline media & konten. API utama berjalan di port **8767** (`run_api.py`), menyediakan endpoint `/health`, `/audio/*`, `/text/*`, `/image/*`, `/video/*`, `/download/*`, `/research/*`, `/trending/*`, `/analyze/*`, `/cloak/*`, `/autopilot/*`, `/calendar/*`, `/ab-test/*`, `/text/ebook` (ebook generator DI-ABSORB ke API ini — port 8765 mati, `services/ebook/` tetap library internal). DI-MANAGE SYSTEMD `1ai-content.service` (`Restart=always`, enabled) — JANGAN tambah manajer duplikat (PM2 media-api sudah dihapus, lihat root `AGENTS.md` Prioritas #9). Dipanggil oleh bot TS (`src/`) via HTTP dan oleh pipeline antar-service Python.

## Ekspor / Interface Utama
- `run_api.py` — entry point: load `.env` root lalu `services/.env`, siapkan `sys.path` (`~/.hermes/scripts`, project root), lalu `uvicorn.run("api:app", host="127.0.0.1", port=8767)` (`run_api.py:34-37`)
- `api.py` — aplikasi FastAPI; router di-mount via `registry.add_router(...)` (`api.py:67-107`) dan `registry.register(EbookContentGenerator(), prefix="/text/ebook")` (`api.py:104`)
- `generator.py` — base class `ContentGenerator` / `GeneratorInfo` (kontrak service konten)
- `api_models.py` — model request/response bersama
- `di.py`, `utils.py` — dependency injection & helper bersama
- `platform_presets.py`, `provider_engine_mapping.json` — preset platform & pemetaan provider engine
- `pytest.ini` — konfigurasi pytest: `asyncio_mode = auto`, `testpaths = tests bookshelf pinterest clipper`, marker `asyncio`
- `requirements.txt` (deps utama: fastapi, uvicorn, openai, pydantic, sqlalchemy, structlog, httpx, playwright, pytest), `requirements-test.txt` (deps test)

## Dependensi Internal
- **Depends on**: env root `.env` + `services/.env` (API keys/cookies — `run_api.py:25-29`); schema DB bersama PostgreSQL (`../prisma`, dan model sendiri di `services/db/models.py`); dir data runtime `../data` & `services/data`, `services/projects` (artefak pipeline)
- **Depended by**: `/src` (bot TS memanggil media-api 8767 via HTTP — termasuk endpoint ebook `/text/ebook`); lihat `src/AGENTS.md`

## Sub-Layanan
Tiap folder layanan punya `AGENTS.md` sendiri (tujuan, interface, issue, rekomendasi). Ringkasan 1-baris:

| Folder | Fungsi |
|---|---|
| `ab_testing/` | A/B testing konten: buat test, varian via LLM (OmniRoute), metrik engagement, statistik pemenang; state tabel `ABTest` (Postgres via Prisma/SQLAlchemy) |
| `analysis/` | Analisis kanal YouTube: info kanal/video/transkrip, analisis performa, bandingkan kanal; butuh `yt-dlp` eksternal |
| `autopilot/` | Otomasi penerbitan konten berjadwal: orchestrator (faceless → SEO → cloak publish), scheduler in-memory, publisher TikTok via CloakBrowser — SyntaxError lama sudah diperbaiki (lihat Issue Spesifik) |
| `bookshelf/` | Generasi buku otomatis dari topik: generate → struktur → tulis per-bab → assemble markdown → PDF opsional; OmniRoute/Groq atau Ollama lokal |
| `brand/` | Identitas brand: warna/watermark per brand, watermark via ffmpeg, intro frame |
| `carousel/` | Konten carousel: template slide per niche (Bahasa Indonesia), preset caption, generator caption LLM (OmniRoute) |
| `clipper/` | Klip pendek dari video panjang: transkripsi (faster-whisper), deteksi highlight via LLM, reframe/resize/karaoke via ffmpeg + pysubs2 |
| `cloak_adapter/` | Adaptor penerbitan via CloakBrowser (CDP): launch profil, auto-posting sosial, stop profil; satu file `__init__.py` (543 baris) |
| `comic_gen/` | Komik otomatis: script (LLM lokal/Ollama), gambar panel (OmniRoute/AgentCash, fallback placeholder), komposisi halaman COMIC/MANGA/MANHWA |
| `content_calendar/` | Kalender konten: `ContentCalendarService` (persisten, Postgres via SQLAlchemy) + `ContentCalendar` (in-memory) |
| `data/` | [INFERENSI STRUKTUR] penyimpanan *data artifact*: `ebook/projects.db` (SQLite), `projects/` (kosong) — bukan package Python |
| `db/` | Lapisan akses DB (PostgreSQL via SQLAlchemy async): `__init__.py` (re-export helper) + `models.py` (model + session/engine) — default kredensial lama sudah dihapus (lazy-raise, lihat Issue Spesifik) |
| `download/` | Unduh video (TikTok): cascade provider → oEmbed/placeholder; scraping halaman TikTok; slideshow → video |
| `ebook/` | Generator ebook AI (pipeline intake → QA → safety, cover, export DOCX/PDF/EPUB) — library internal DI-ABSORB ke media-api :8767 (`/text/ebook`); detail lengkap di `ebook/AGENTS.md` |
| `engagement/` | Auto-reply komentar media sosial (platform cloak): template Bahasa Indonesia, limit harian, posting balasan |
| `faceless/` | Pipeline video faceless: script (LLM) → TTS → stock footage → compose scene → stitch → captions → BGM; jalur khusus video produk |
| `looping/` | Video loop dari audio: background visual (ffmpeg filters), audio crossfade, durasi default 1 jam |
| `media/` | [INFERENSI STRUKTUR] output media: `movies/movie_<run_id>/{audio,images}` — cocok dengan `DEFAULT_OUTPUT_DIR` `movie_gen/engine.py` |
| `money-printer-turbo/` | **KOSONG** — folder kosong, tidak ada kode; tidak punya AGENTS.md |
| `movie_gen/` | Film pendek dari prompt: script (LLM) → gambar scene (Pillow) → narasi (TTS) → BGM → assemble (ffmpeg); env `COMIC_*` |
| `music/` | BGM 3-lapis: Suno API → audiocraft (MusicGen) → fallback ffmpeg (tone sintetik); preset tema BGM & mood lofi; output `/tmp/music_output` |
| `pinterest/` | Scraper Pinterest (`PinterestScraper`, `__init__.py:51`) + poster Facebook (`auto_poster.py`) |
| `projects/` | [INFERENSI STRUKTUR] data runtime pipeline ebook: `model_stats_*.json`, `token_calibration.json`, subfolder per project (outline, strategy, style guide, toc) |
| `remetadata/` | Engine remetadata video: judul/deskripsi/tag/waktu posting + tulis ulang via ffmpeg → `/tmp/remetadata_output` (`engine.py:48`) |
| `remotion-ads/` | Proyek Node/TypeScript (package `remotion-product-ads`, remotion ^4.0.484): komposisi `ProductAd` (450 frame, 30fps, 1080x1920) & `ProductAd-Hook` (90 frame) |
| `remotion/` | Bridge Python→Node: kirim JSON payload ke `src/render.ts` proyek remotion-ads, interpretasi hasil render |
| `repurpose/` | Repurposing video: konten multi-format (klip, subtitle, overlay, BGM, posting sosial); dua engine tumpang tindih — `engine.py` (monolitik) vs `cascade.py` (refactor); `__init__.py` ekspor dari `cascade.py` |
| `research/` | Riset niche pasar buku: niche, brief buku, peta bahasa; LLM OmniRoute (fallback Ollama) |
| `routers/` | Layer routing FastAPI: 19 file router, semua di-mount di `api.py:67-107` |
| `storyboard/` | Storyboard visual: scenario (LLM) + gambar per scene, layout HTML dengan gambar inline base64 |
| `trends/` | Engine tren: YouTube/Google/Reddit/TikTok → analisis LLM → SEO (judul, caption, hashtag, waktu posting) |
| `tts/` | Text-to-speech: edge-tts atau MeloTTS (auto-probe engine), output `/tmp/tts_output` (`engine.py:31`) |

## Issue Spesifik
- **[Critical — SUDAH DIPERBAIKI]** Default `DATABASE_URL` berisi kredensial hardcoded — `services/db/models.py:50-53` (nilai asli diredaksi). Fix yang diterapkan: default kosong `os.getenv("DATABASE_URL", "")` (`models.py:52`) + lazy engine yang raise `RuntimeError` saat dipakai bila env tidak diset (`models.py:54-69`). Lazy-raise (bukan raise saat import) sengaja dipilih agar import `services.api` → `services.db.models` tetap aman (dipakai `services/tests/conftest.py:15`). Detail: `db/AGENTS.md`.
- **[High — SUDAH DIPERBAIKI]** SyntaxError di publisher autopilot — `services/autopilot/tiktok_publisher.py:148-151` (ekspresi `or (if ...)` tidak valid Python; modul gagal di-import → router autopilot di `api.py` mati total). Fix yang diterapkan: `media_path = content_result.get("media_path") or content_result.get("video_path")` + guard `os.path.exists` (`:149-151`).
- **[High]** `services/movie_gen` — bug tuple di `render_scene_segment` (diteruskan sebagai tuple ke `_ffmpeg("-i", tuple)`) [hipotesis — perlu verifikasi manual]; `_concat_with_crossfade` bukan crossfade sungguhan (concatenate polos). Detail: `movie_gen/AGENTS.md`.
- **[High]** `services/engagement` — docstring merujuk `auto_reply.py` yang tidak ada (semua logika di `__init__.py`); limit harian 50 tidak pernah naik (konstanta tak ter-update). Detail: `engagement/AGENTS.md`.
- **Medium ×32, Low ×35** — rincian per-folder ada di `AGENTS.md` masing-masing (batch: ab_testing–content_calendar 18M/20L, data–tts 8M/8L, pinterest–tts 6M/7L).

## Rekomendasi Perbaikan Scoped
Kedua patch di bawah **SUDAH DITERAPKAN** pada fase eksekusi (verifikasi: `py_compile` 10 file test OK, pytest `services` 526 passed, 1 skipped).

```python
# services/autopilot/tiktok_publisher.py:148-151 — SyntaxError (SUDAH DITERAPKAN)
# Sebelum
media_path = content_result.get("media_path") or (
    if content_type == ContentType.carousel.value
    else content_result.get("video_path")
)
# Sesudah (yang ada di disk sekarang)
media_path = content_result.get("media_path") or content_result.get("video_path")
if media_path and os.path.exists(media_path):
    ...
```

```python
# services/db/models.py:50-53 — default kredensial (SUDAH DITERAPKAN; nilai asli TIDAK ditampilkan)
# Sebelum
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://***REDACTED***@localhost:5432/berkahkarya")
# Sesudah (yang ada di disk sekarang) — gagal cepat saat engine dipakai, bukan saat import
DATABASE_URL = os.getenv("DATABASE_URL", "")
...
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL environment variable is required ...")
```

## Catatan Keamanan
- `services/tests/conftest.py:10-12` men-set `OMNIROUTE_API_KEY="sk-test-key"` — placeholder test, bukan secret asli (aman, tidak perlu redaksi).
- `run_api.py:31-32` mencetak panjang `PINTEREST_COOKIES` dan 20 karakter pertama `PINTEREST_CSRF` ke stdout — kebocoran parsial token ke log; pertimbangkan menghapus print tersebut.

> Last updated: 2026-08-02 — fase eksekusi swarm: Issue Spesifik Critical (db/models.py) & High (autopilot SyntaxError) ditandai SUDAH DIPERBAIKI + patch dipindah ke "SUDAH DITERAPKAN"; verifikasi literal: py_compile OK, pytest services 526 passed / 1 skipped. Update runtime: ebook absorbed ke :8767 (`/text/ebook`), media-api di-manage systemd `1ai-content.service` (PM2 duplikat dihapus — lihat root AGENTS.md Prioritas #9).
