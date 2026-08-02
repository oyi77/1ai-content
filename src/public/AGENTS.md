---
scope: src/public
depends_on: none
status: complete
---

<!-- Parent: ../AGENTS.md -->

# public

## Tujuan
Aset statis web (favicon, hero image) di dalam `src/`. **Catatan penting**: route `/public/` di `src/index.ts:338-340` meng-serve `public/` ROOT repo (`path.join(process.cwd(), 'public')`) — bukan `src/public/`. Penggunaan `src/public/` oleh kode belum terverifikasi; kemungkinan salinan yang tidak di-serve langsung.

## Ekspor

| File | Detail |
|------|--------|
| `favicon.ico` | Ikon web (ICO) |
| `favicon.svg` | Ikon web (SVG) |
| `hero-comparison.png` | Hero image perbandingan |
| `hero-tiktok-showcase.png` | Hero image showcase TikTok (duplikat juga ada di `public/` root) |

## Dependensi Internal
- Tidak ada (aset statis murni). Tidak ada import/module dari sini.

## Issue Spesifik
1. **LOW — duplikasi aset**: `hero-tiktok-showcase.png` ada di `src/public/` DAN `public/` root; jika hanya root yang di-serve (index.ts:339), `src/public/` redundan.
2. Tidak ada issue runtime (aset statis).

## Rekomendasi Perbaikan Scoped
1. Konfirmasi penggunaan `src/public/` (grep seluruh repo); jika tidak dipakai, hapus atau sinkronkan dengan `public/` root.
2. (Opsional) Optimasi ukuran PNG hero jika besar.
