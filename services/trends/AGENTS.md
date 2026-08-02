---
scope: services/trends
depends_on: (eksternal: YouTube API, yt-dlp, Google RSS, old.reddit, TikTok web, OmniRoute); dipakai oleh beberapa service
status: complete
---

## Tujuan Folder Ini
Engine tren konten: memindai topik tren dari berbagai sumber (YouTube, Google, Reddit, TikTok) secara berkala, menganalisisnya lewat LLM, dan men-generate SEO (judul, caption, hashtag, waktu posting).

## Ekspor / Interface Utama
- `scanner.py` — `TrendScanner` (l.32).
  - Konstanta: `_REDDIT_UA` l.26, `_CACHE_DIR /tmp/trend_cache` l.27, `_SCAN_INTERVAL` 600s l.29; API key YouTube via env `YOUTUBE_API_KEY` l.36.
  - `get_cached` l.43; `scan_now` l.53; `start_background_scan` l.60 (daemon thread); `get_status` l.82; `_do_scan` l.110 (ThreadPool 4); `_write_cache` l.135.
  - Sumber: `_scan_youtube` l.145 (`yt-dlp ytsearch10:`), `_scan_google` l.189 (RSS), `_scan_reddit` l.222 (old.reddit), `_scan_tiktok` l.242 (regex best-effort).
  - `get_scanner` l.264; `start_background_scanner` l.271; CLI l.277 (`--bg`).
- `analyzer.py` — `TrendAnalyzer` l.18, `analyze_trends` l.26, `_call_llm` l.135 (model `auto/best-chat`), CLI l.156.
- `seo_generator.py` — `SEOGenerator` l.74; `PLATFORM_PRESETS` l.20 (tiktok/instagram/youtube/facebook/x/linkedin/threads).
  - `generate_seo(title, description, platform="tiktok", language="id", niche="")` l.82 → dict `{success,title,caption,description,hashtags,cover_text,posting_time,engagement_hooks}`; `generate_batch_seo` l.129.
  - `_call_llm` l.151 (httpx POST `{OMNIRoute_URL}/chat/completions`, model `auto/best-chat`, timeout 60); `_build_prompt` l.172 + 7 `_prompt_*` l.197-374; `_parse_json` l.379 (regex `\{[\s\S]*\}`); CLI l.391; URL OmniRoute dari env `OMNIRoute_URL` l.17.

## Dependensi Internal
- Dipakai oleh: `services/remetadata/engine.py` l.26/45 (SEOGenerator), `services/repurpose`, `services/routers/trends.py`, `services/api.py` l.50-57 (`start_background_scanner`), `services/autopilot/tiktok_publisher.py` + `services/faceless/engine.py` [inferensi].

## Issue Spesifik
- **Low/catatan**: `_scan_tiktok` (scanner.py l.242) berbasis regex best-effort — tidak ada API resmi; hasil bisa kosong/berubah bentuk kapan saja. `_parse_json` (seo_generator.py l.379) memakai regex greedy `\{[\s\S]*\}` — rapuh untuk JSON ber-nesting dalam/teks berisi `}`.
- Tidak ada temuan keamanan material di folder ini.

## Rekomendasi Perbaikan Scoped
- Untuk `_parse_json`: ganti regex dengan parsing berlapis (cari brace balance) atau minta LLM mengembalikan JSON fenced dan strip fence.
- Beri komentar eksplisit bahwa hasil TikTok adalah best-effort dan tidak boleh dijadikan jaminan.
