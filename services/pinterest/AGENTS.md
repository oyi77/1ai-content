---
scope: services/pinterest
depends_on: (tidak ada dependensi antar-service internal; hanya env & repo eksternal)
status: complete
---

## Tujuan Folder Ini
Scraper Pinterest + poster Facebook. `PinterestScraper` (__init__.py:51) mengambil hasil pencarian pin dan mengunduh gambar; `auto_poster.py` memuat daftar halaman Facebook dan mem-posting konten ke halaman tersebut.

## Ekspor / Interface Utama
- `PinterestScraper` (__init__.py:51) — env `PINTEREST_COOKIES`, `PINTEREST_CSRF`, `PINTEREST_DOMAIN` (l.24-32).
  - `search_pins` (l.74) — POST ke `https://{PINTEREST_DOMAIN}/resource/BaseSearchResource/get/`.
  - `download_image` (l.159) — nama file `pin_{ts}_{rand}{ext}`.
  - `close` (l.198).
- `auto_poster.py` — `load_dotenv(services/.env)` l.19; `SOCIAL_API_BASE` = `http://localhost:8200/v1/distribution` l.25; `SOCIAL_DIR` = `~/projects/1ai-social` l.26; `load_homeliving_pages` l.34; `list_pages` l.45; `post_to_facebook` l.71; `format_caption` l.91; entry `main` l.104.
- `test_scraper.py` — `TestPinterestScraper` l.94.

## Dependensi Internal
- Dipakai oleh: `services/routers/pinterest.py`, `services/download/providers/scrape.py` (cocok via grep), `services/api.py`.
- Menulis ke repo eksternal `~/projects/1ai-social/data/fb_pages.json` (di luar repo ini) via `load_homeliving_pages`.

## Issue Spesifik
- **Medium (hipotesis)**: token halaman Facebook dikirim sebagai plaintext ke HTTP `localhost:8200/v1/distribution` (auto_poster.py:71; lihat juga routers/pinterest.py l.130-141). Perlu verifikasi bahwa `8200` adalah layanan internal yang trusted; kalau bukan, hardening HTTPS/mTLS perlu dipertimbangkan.
- **Low**: log `tok[:35]` — 35 karakter pertama token ikut tercetak (auto_poster.py:51).
- **Low**: regex `Domain=([^;]+)` di __init__.py:28 tampak dead code — tidak ada jejak penggunaan variabel hasil ekstraksi tersebut.

## Rekomendasi Perbaikan Scoped
- Enkripsi channel ke `localhost:8200` atau pastikan layanan hanya reachable via loopback + validasi penerima token.
- Hapus/redaksi log parsial token (jangan log sebagian token sekalipun).
- Hapus regex dead code `Domain=([^;]+)` di __init__.py:28 atau beri komentar alasan keberadaannya.
