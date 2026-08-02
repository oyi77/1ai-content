# AGENTS.md — public

```yaml
scope: public
depends_on: [src/index.ts, src/routes/web/pages.ts]
status: complete
last_reviewed_commit: bac10d88791d79fd8cadf2840fa2defc4343587a
```

## Tujuan Folder Ini

Aset statis web publik: PWA dashboard, Telegram Mini App, service worker, icon, dan gambar hero. Dua jalur serve:

1. **Static** — `src/index.ts:331-333` `@fastify/static` dengan `root: public/`, `prefix: '/public/'` → file apa pun di folder ini tersedia di `/public/<nama-file>`.
2. **Route langsung** — `src/routes/web/pages.ts:147-189` membaca file dari folder ini dan menyajikannya di path root.

## Ekspor / Interface Utama

| File | Peran | Cara di-serve |
|---|---|---|
| `dashboard.html` | Dashboard PWA ("1AI Content Dashboard"); link `/manifest.json` + `/public/design-system.css` | Route `pages.ts:164-170` `GET /dashboard.html` + static `/public/dashboard.html` |
| `miniapp.html` | Telegram Mini App ("1AI Content", `telegram-web-app.js`); link `/public/design-system.css` | Route `pages.ts:182-190` `GET /app/mini` + static `/public/miniapp.html` |
| `design-system.css` | Stylesheet bersama (dipakai `dashboard.html` & `miniapp.html`; **sudah ada** sejak konsolidasi) | Static `/public/design-system.css` |
| `sw.js` | Service worker, `CACHE_NAME '1ai-content-v1'`; cache `/dashboard.html` + `/manifest.json`; network-first `/api/` | Route `pages.ts:173-179` `GET /sw.js` + static `/public/sw.js` |
| `icon-192.png` / `icon-512.png` | Ikon PWA (1.5KB / 4.5KB) | Static `/public/icon-*.png` (manifest route kini merefer `/public/icon-*` — lihat catatan M-3 resolved) |
| `hero-tiktok-showcase.png` | Gambar hero landing (81KB); dijadikan `og:image` & `<img>` landing | Static `/public/hero-tiktok-showcase.png`; direfer `src/views/web/landing.ejs:12,17,1263` + `src/scripts/seed.ts:63` |

**Catatan manifest:** file `public/manifest.json` TIDAK lagi ada. Manifest PWA di-serve semata dari route `pages.ts:148-161` (hardcode "1AI Content", `start_url: '/app'`, `theme_color: '#00d9ff'`, icon `/public/icon-*.png`). `dashboard.html:7` & `sw.js:5` me-request `/manifest.json` → kena route. Satu sumber kebenaran.

## Dependensi Internal

- `src/index.ts:331-333` — konfigurasi `@fastify/static` untuk folder ini (prefix `/public/`).
- `src/routes/web/pages.ts:148-188` — route `/manifest.json`, `/dashboard.html`, `/sw.js`, `/app/mini`, `/favicon.ico`, `/favicon.svg`.
- `src/views/web/landing.ejs` — memakai `hero-tiktok-showcase.png` (via `/public/...`).
- `sw.js` — daftar cache-nya (`/dashboard.html`, `/manifest.json`) mengikat ke route (bukan file manifest).

## Issue Spesifik

> Semua isu terdahulu (M-1, M-2, M-3, L-1) telah ditutup sesi konsolidasi; tidak ada issue open di folder ini.

- **[RESOLVED] M-1 — `design-system.css` 404**: file kini ADA di `public/design-system.css` (glob match); link `dashboard.html:11` & `miniapp.html:10` → `/public/design-system.css` terpenuhi via static.
- **[RESOLVED] M-2 — Manifest ganda & konflik brand**: file `public/manifest.json` DIHAPUS (orphan — tidak ada referensi `/public/manifest.json`); route `pages.ts:148-160` menjadi satu-satunya sumber (name/short_name "1AI Content", `start_url: '/app'`, theme `#00d9ff`). Referensi `dashboard.html:7` & `sw.js:5` tetap valid via route.
- **[RESOLVED] M-3 — PWA icon 404**: `pages.ts:157-158` icon `src` diubah dari `/icon-192.png`/`/icon-512.png` (root — 404) menjadi `/public/icon-192.png`/`/public/icon-512.png` (static serve). Browser PWA kini mendapat icon yang ada.
- **[RESOLVED] L-1 — duplikat hero**: `src/public/hero-tiktok-showcase.png` DIHAPUS (duplikat byte-identik dari `public/hero-tiktok-showcase.png`; `/public/` adalah yang di-serve — `src/public` hanya serving `favicon.ico`/`favicon.svg` via `pages.ts:101-107`).

## Catatan Path Heru

- `src/views/landing.ejs` TIDAK ada; landing EJS berada di `src/views/web/landing.ejs` (landing publik juga dibangun di `admin-ui` React `src/landing`).

## Rekomendasi Perbaikan Scoped

Tidak ada rekomendasi aktif tersisa di folder ini. Potensi bersih-bersih non-kritis di masa depan: dedup `src/public/hero-comparison.png` bila diverifikasi tidak direferensikan (tidak di-serve; belum terdokumentasi sebagai duplikat).

> Last updated: 2026-08-02 — Resolved M-1 (design-system.css ada), M-2 (manifest.json orphan dihapus, route = satu sumber), M-3 (icon path → /public/), L-1 (hero duplikat dihapus); koreksi path landing.ejs → src/views/web/landing.ejs; rebrand miniapp → "1AI Content".