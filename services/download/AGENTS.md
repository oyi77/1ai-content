---
scope: services/download
depends_on: none (internal); runtime eksternal: service `cobalt` (localhost:9000), `vidbee` (localhost:3101 + container docker `vidbee-api-1`), ffmpeg
status: complete
---

# services/download

## Tujuan Folder Ini

Unduh video (khususnya TikTok) dengan strategi cascade: mencoba beberapa provider berurutan sampai satu berhasil, lalu fallback ke oEmbed/placeholder. Juga menyediakan scraping halaman TikTok dan konversi slideshow → video.

## Ekspor / Interface Utama

- `cascade.py`:
  - `download_video(video_url, category="general")` — entry point utama
  - `_download_cascade(...)` — urutan cascade: snaptik → ssstik → tikwm → oembed → placeholder; timeout global 45s, round-1 paralel 15s, oembed 5s
- `engine.py` — re-export backward-compat semua symbol (agar pemanggil lama tetap jalan)
- `utils.py` — `_dl_url(client, url, vid_id, tmpdir, ext, referer)`; `PICSUM_URL`
- `providers/` — `snaptik.py`, `ssstik.py`, `tikwm.py`, `ytdlp.py` (subprocess `--impersonate Chrome-133`, fallback `--cookies-from-browser`), `cobalt.py`, `vidbee.py` (ambil hasil via `docker cp` dari container `vidbee-api-1:/data/downloads/`), `browser.py` (`dl_cloakbrowser`, `dl_playwright_direct`, flags `--no-sandbox`, `--disable-web-security`), `fallback.py` (`dl_oembed`, `dl_placeholder` PNG 1x1 merah)
- `providers/scrape.py`:
  - `scrape_tiktok_page` — ekstraksi via rehydration script; sejak ~Juli 2026 TikTok menghapus `itemInfo` sehingga script ini rusak → fallback oEmbed
  - `convert_slideshow_to_video` — ffmpeg, max 20 gambar, 3s/gambar
  - `convert_slideshow_to_video_remotion` — lazy import `services.remotion`, fallback ffmpeg

## Dependensi Internal

- Env: `TIKWM_API_URL`, `VIDBEE_URL`, `COBALT_URL`, `COBALT_PUBLIC_INSTANCES`, `TIKTOK_PROXY` (+ `TIKTOK_PROXY_USER`/`TIKTOK_PROXY_PASS`), `TIKTOK_OEMBED`.
- Runtime eksternal: container docker `vidbee-api-1`; service lokal `cobalt`/`vidbee`; `ffmpeg` di PATH.

## Issue Spesifik

- **Medium**: `services/download/providers/snaptik.py:16` — salt AES-CBC hardcoded di source (`_SN_SALT = "***REDACTED***"`, diredaksi). Salt kriptografi seharusnya dari env/secret, bukan di-repo.
- **Medium**: `verify=False` menyebar — `cascade.py:96`, `snaptik.py:94,147`, `ssstik.py:30,58,89` — verifikasi TLS dimatikan pada request HTTPS. Risiko MITM; perlu CA bundle atau setidaknya dokumentasi alasan per titik.
- **Medium**: `providers/ssstik.py` — cache *broken-state* modul-level dengan TTL 300s; state global (bukan per-request) rentan basi dan tidak thread-safe jika dipakai bersamaan.
- **Low**: `providers/scrape.py` — `scrape_tiktok_page` bergantung pada struktur rehydration TikTok yang sudah berubah (itemInfo dihapus sejak ~Juli 2026); kode masih ada tapi jalurnya mati (hanya fallback oEmbed yang berfungsi).
- **Low**: `providers/vidbee.py` — eksekusi `docker cp` dari container bernama `vidbee-api-1` (nama container spesifik = dependency runtime non-deterministik; gagal bila container di-rename/redeploy).

## Rekomendasi Perbaikan Scoped

- Pindahkan salt ke env (`SN_SALT`) atau secret store; tambahkan komentar referensi format/versi.
- Audit tiap `verify=False`: ganti dengan `verify=CA_BUNDLE` atau matikan hanya pada domain yang benar-benar perlu + dokumentasikan.
- Refactor cache ssstik ke penyimpanan per-request (atau keyed by URL) dengan expiry eksplisit.
- Hapus/arsipkan kode rehydration yang mati, atau tandai deprecated dan jadikan oEmbed sebagai primary path.

> Last updated: 2026-08-02
