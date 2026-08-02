# AGENTS.md — public

```yaml
scope: public
depends_on: [src/index.ts, src/routes/web/pages.ts]
status: complete
last_reviewed_commit: bac10d88791d79fd8cadf2840fa2defc4343587a
```

## Tujuan Folder Ini

Aset statis web publik: PWA dashboard, Telegram Mini App, manifest, service worker, icon, dan gambar hero. Dua jalur serve:

1. **Static** — `src/index.ts:338-344` `@fastify/static` dengan `root: public/`, `prefix: '/public/'` → file apa pun di folder ini tersedia di `/public/<nama-file>` (cache maxAge 1h).
2. **Route langsung** — `src/routes/web/pages.ts:147-187` membaca file dari folder ini dan menyajikannya di path root.

## Ekspor / Interface Utama

| File | Peran | Cara di-serve |
|---|---|---|
| `dashboard.html` | Dashboard PWA ("1AI Content Dashboard"); link `/manifest.json` + `/public/design-system.css` | Route `pages.ts:163-169` `GET /dashboard.html` + static `/public/dashboard.html` |
| `miniapp.html` | Telegram Mini App ("Vilona Content", `telegram-web-app.js`); link `/public/design-system.css` | Route `pages.ts:181-187` `GET /app/mini` + static `/public/miniapp.html` |
| `manifest.json` | PWA manifest "1AI Content", `start_url: /dashboard.html`, icon `/icon-192.png` + `/icon-512.png` | Static `/public/manifest.json` SAJA (path `/manifest.json` di-shadow route — lihat Issue M-2) |
| `sw.js` | Service worker, `CACHE_NAME '1ai-content-v1'`; cache `/dashboard.html` + `/manifest.json`; network-first `/api/` | Route `pages.ts:172-178` `GET /sw.js` + static `/public/sw.js` |
| `icon-192.png` / `icon-512.png` | Ikon PWA (1.5KB / 4.5KB) | Static `/public/icon-*.png` (path root `/icon-*.png` TIDAK tersedia — lihat Issue M-3) |
| `hero-tiktok-showcase.png` | Gambar hero landing (81KB) | Static `/public/hero-tiktok-showcase.png`; direfer `src/views/landing.ejs:12,17,1263` |

## Dependensi Internal

- `src/index.ts:338-344` — konfigurasi `@fastify/static` untuk folder ini (prefix `/public/`).
- `src/routes/web/pages.ts:147-187` — route `/manifest.json`, `/dashboard.html`, `/sw.js`, `/app/mini` yang membaca file di folder ini.
- `src/views/landing.ejs` — memakai `hero-tiktok-showcase.png`.
- `sw.js` — daftar cache-nya (`/dashboard.html`, `/manifest.json`) mengikat ke file di folder ini.

## Issue Spesifik

### M-1 (MEDIUM) — `design-system.css` tidak ada → 404

`public/dashboard.html:11` dan `public/miniapp.html:10` me-link `/public/design-system.css`, tapi file tersebut tidak ada di repo (glob `**/design-system.css` → 0 match). Trace: HTML link → `GET /public/design-system.css` → `@fastify/static` `index.ts:338-344` → file absen → 404. [FILE TIDAK ADA/TIDAK TERLAMPIR] Dampak visual penuh belum diverifikasi — kedua file punya inline `<style>` besar sehingga mungkin hanya minor, tapi referensi aset tetap patah.

```diff
- <link rel="stylesheet" href="/public/design-system.css">
+ <!-- hapus baris, atau buat public/design-system.css sesuai referensi 04-FRONTEND.md -->
```

### M-2 (MEDIUM) — Manifest ganda & konflik brand

`public/manifest.json` ("1AI Content", `start_url: /dashboard.html`) di-shadow route `pages.ts:147-160` yang meng-hardcode manifest berbeda ("BerkahKarya", `start_url: '/app'`, theme `#00d9ff`). `dashboard.html:7` me-link `/manifest.json` → browser mendapat manifest "BerkahKarya" dengan `start_url: /app` (React SPA), bukan "1AI Content". Dua sumber kebenaran untuk satu file.

```diff
- // pages.ts:147-160 — hardcoded manifest "BerkahKarya"
+ // pilih satu sumber: baca public/manifest.json dari route,
+ // atau hapus file public/manifest.json dan andalkan hardcode
```

### M-3 (MEDIUM) — PWA icon 404

`public/manifest.json:12,17` dan `pages.ts:156-157` merefer `src: '/icon-192.png'` / `'/icon-512.png'` (path root). File sebenarnya berada di `/public/icon-192.png` / `/public/icon-512.png`; tidak ada route/static root untuk path root → browser PWA selalu 404 pada icon. `sw.js:5` hanya cache manifest (bukan icon), sehingga icon tidak pernah tersedia offline.

```diff
- "src": "/icon-192.png"
+ "src": "/public/icon-192.png"
```

```diff
- { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
+ { src: '/public/icon-192.png', sizes: '192x192', type: 'image/png' },
```

### L-1 (LOW) — Duplikat aset hero

`public/hero-tiktok-showcase.png` dan `src/public/hero-tiktok-showcase.png` adalah duplikat. Salah satu harus dihapus dan referensi (`landing.ejs`) disatukan ke satu path untuk mencegah drift.

## Rekomendasi Perbaikan Scoped

1. **M-1**: putuskan nasib `design-system.css` — buat file (sesuai spec `04-FRONTEND.md`) atau hapus `<link>` dari `dashboard.html:11` dan `miniapp.html:10`.
2. **M-2**: jadikan satu sumber manifest. Direkomendasikan: route `pages.ts:147-160` membaca `public/manifest.json` (agar PWA dan HTML konsisten).
3. **M-3**: perbaiki path icon di `public/manifest.json:12,17` dan `pages.ts:156-157` menjadi `/public/icon-*.png`.
4. **L-1**: dedup `hero-tiktok-showcase.png` dan sinkronkan referensi `landing.ejs`.
