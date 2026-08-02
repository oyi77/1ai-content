---
scope: src/public
depends_on: none
status: complete
---

<!-- Parent: ../AGENTS.md -->

# public

## Tujuan
Aset statis web (favicon) di dalam `src/` — diserve oleh `src/routes/web/pages.ts:101-107` (`favicon.ico` & `favicon.svg`). **Catatan**: route `/public/` di `src/index.ts:338-340` meng-serve `public/` ROOT repo (`path.join(process.cwd(), 'public')`) — bukan `src/public/`. `src/public/` hanya dipakai untuk favicon via `pages.ts:101-107`.

## Ekspor

| File | Detail |
|------|--------|
| `favicon.ico` | Ikon web (ICO) — diserve oleh `src/routes/web/pages.ts:101-107` |
| `favicon.svg` | Ikon web (SVG) — diserve oleh `src/routes/web/pages.ts:101-107` |
| `hero-comparison.png` | Hero image perbandingan (orphan — tidak dirujuk oleh kode, dibiarkan) |
| ~~`hero-tiktok-showcase.png`~~ | [DIHAPUS 2026-08-02] duplikat byte-identik dari `public/hero-tiktok-showcase.png` |

## Dependensi Internal
- Serviced by: `src/routes/web/pages.ts:101-107` (favicon).

## Issue Spesifik
1. **LOW — [RESOLVED] duplikasi aset**: `hero-tiktok-showcase.png` dulunya ada di `src/public/` DAN `public/` root; file di `src/public/` dihapus 2026-08-02 (byte-identik dengan root). `public/hero-tiktok-showcase.png` tetap diserve oleh route `/public/` dan dipakai `src/views/web/landing.ejs:12,17,1263`.
2. **LOW — orphan `hero-comparison.png`**: grep `hero-comparison` di `src/`, `admin-ui/`, `config/`, `public/` → no match; kemungkinan sisa aset tidak dipakai. [INFERENSI — belum diverifikasi penuh, dibiarkan agar tidak menghilangkan fitur].
3. Tidak ada issue runtime (aset statis).

## Rekomendasi Perbaikan Scoped
1. `hero-comparison.png` di `src/public/` — bisa dihapus bila konfirmasi grep no-match sebagai sumber aset landing; belum dihapus karena takut "lost feature".

> Last updated: 2026-08-02 — baris `hero-tiktok-showcase.png` dihapus (file di-`rm`, duplikat M-2 root `public/`); catatan route dipindah ke `pages.ts:101-107`; `hero-comparison.png` ditandai orphan [INFERENSI]; dokumentasi sinkron dengan `public/AGENTS.md`.
