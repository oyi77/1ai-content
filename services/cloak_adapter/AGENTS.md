---
scope: cloak_adapter
depends_on: []
status: complete
---

# AGENTS.md — services/cloak_adapter

## Tujuan
Adaptor penerbitan konten via CloakBrowser (browser yang di-proxy via CDP): meluncurkan profil, mengotomatisasi posting media sosial, dan menghentikan profil. Satu file `__init__.py` (543 baris).

## Ekspor-Interface
- `CloakBrowserAdapter` (`__init__.py:34`):
  - Env: `CLOAKBROWSER_URL` (27, default `http://127.0.0.1:8090`); `CLOAKBROWSER_AUTH` (28) — **default credential di-hardcode di baris 28, jangan disalin nilainya; wajib di-override via env di produksi**.
  - `_cdp_proxy_thread` (41), `_start_cdp_proxy` (60, port 0 + sleep 0.3), `_api` (79, httpx timeout 30)
  - `list_profiles` (89), `get_profile_status` (98)
  - `post` (104): launch (148, `did_launch`), `_post_via_cdp` (166), stop hanya jika `did_launch` (172)
  - `_post_via_cdp` (175): sync Playwright (`sync_playwright` 180, `connect_over_cdp`); **hanya mendukung `platform == "facebook"`** (else return error di 191-192); selector FB di 199-212
  - `batch_post` (480, sequential + `time.sleep(5)`), CLI (522)
- 6 method async DEAD CODE (tidak pernah dipanggil oleh `post()`): `_post_facebook` (245), `_post_x` (281), `_post_instagram` (319), `_post_tiktok` (363), `_post_youtube` (396), `_post_linkedin` (442).

## Dependensi Internal
- Tidak ada dependensi ke service lain; butuh layanan CloakBrowser eksternal dan package `playwright` (sync).

## Issue Spesifik
- [MEDIUM] `__init__.py:28` default credential `CLOAKBROWSER_AUTH` di-hardcode di source — risiko kebocoran token default di lingkungan yang memakai nilai default. [nilai tidak ditulis di sini sengaja]
- [MEDIUM] `__init__.py:104-172` `post()` hanya berfungsi untuk Facebook; jalur `_post_via_cdp` menolak platform lain (191-192), dan 6 method async untuk platform lain tidak pernah dipanggil — dukungan X/Instagram/TikTok/YouTube/LinkedIn tidak berfungsi meski kodenya ada.
- [LOW] `__init__.py:421` `_post_youtube`: typo `page.query.querySelector('textarea#description')` — `page.query` tidak ada di API Playwright; akan `AttributeError` jika method ini pernah dipanggil (saat ini dead code, jadi tidak kena di runtime).

## Rekomendasi
- Hapus default credential dari source; wajibkan env `CLOAKBROWSER_AUTH` (fail-fast bila kosong).
- Tentukan satu jalur (sync CDP vs async) dan terapkan per platform; atau dokumentasikan eksplisit "khusus Facebook" dan hapus dead code.
- Perbaiki typo `page.query.querySelector` → `page.querySelector` bila `_post_youtube` diaktifkan kembali.
- **Belum diterapkan** — audit dokumentasi saja, tanpa perubahan kode.
