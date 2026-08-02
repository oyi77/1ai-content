<!-- Parent: ../AGENTS.md -->
<!-- Scope: admin-ui/src/landing | Stack: TypeScript / React / Vite | Status: complete | last_reviewed_commit: bac10d88791d79fd8cadf2840fa2defc4343587a -->
<!-- Generated: 2026-08-02 | Updated: 2026-08-02 -->

---
scope: admin-ui/src/landing
depends_on: [admin-ui/src/main.tsx, admin-ui/src/api/client.ts]
status: complete
---

# AGENTS.md — admin-ui/src/landing

## Tujuan Folder Ini
Namespace Landing (ex-`landing-ui/`, sudah dihapus) dalam SATU SPA: halaman publik/landing statis yang dimount di route `/` dari `admin-ui/src/main.tsx:22`.

## Ekspor / Interface Utama
- `Landing()` — default export `landing/App.tsx:43`; halaman landing (hero, pricing, footer).
- `FALLBACK_PRICING` — `landing/App.tsx:13-17`; daftar paket harga fallback (by design, dipakai bila `/api/packages` gagal — bukan bug).
- Fetch paket harga: `landing/App.tsx:49` → `fetch("/api/packages")` (same-origin, via proxy dev `/api` → localhost:3000).
- Link keluar: `/app/login` (`:99`), `?register=1` (`:106/:135/:323`), conditional (`:258`), `/terms` (`:356`), `/privacy` (`:357`), `t.me/vilona_content_bot` (`:363`).

## Dependensi Internal
- Depends on: `admin-ui/src/main.tsx` (lazy mount `Landing` route `/`), `admin-ui/src/api/client.ts`.
- Depended by: `admin-ui/AGENTS.md` (Key Files `src/landing/App.tsx`), root `AGENTS.md`.

## Issue Spesifik
- **[HIGH — SUDAH DIFIX 2026-08-02]** Regresi: `./index.css` (definisi `--accent: #a855f7` `:4`, `--grad` `:6`, `--grad-hover` `:7`) tidak di-import → styling landing hilang dari bundle (grep `hero-gradient` di dist = 0 sebelum fix). Fix: `App.tsx:1` kini `import "./index.css";` (pola `app/App.tsx:1`). Verifikasi: `hero-gradient` terdefinisi di `admin-ui/dist/assets/App-BLVI5avz.css` (2 match: class + media query) dan dipakai `App-D4fBirZS.js:1` (`className="hero-gradient"`). Token `--accent`/`--grad`/`--grad-hover` kini tersedia global (namespace Admin ikut terbantu — lihat `admin-ui/AGENTS.md` item `--accent`).

## Rekomendasi Perbaikan Scoped
```ts
// SUDAH DITERAPKAN 2026-08-02 (opsi "import ./index.css" dari Rekomendasi lama)
// Before — landing/App.tsx:1 sebelumnya hanya `import { useEffect, useState } from "react";`
// After  — landing/App.tsx:1 kini:
import "./index.css";
import { useEffect, useState } from "react";
```
Catatan: nilai literal alternatif (`linear-gradient(135deg, #a855f7, #7c3aed)`) TIDAK dipakai — dipilih jalur import CSS karena token `--accent`/`--grad`/`--grad-hover` juga dibutuhkan namespace Admin (lihat `admin-ui/AGENTS.md` item `--accent`). Verifikasi pasca-fix: `hero-gradient` masuk bundle CSS (`admin-ui/dist/assets/App-BLVI5avz.css`) dan dipakai JS (`App-D4fBirZS.js:1`).

> Last updated: 2026-08-02 — (1) namespace baru hasil konsolidasi landing-ui/ → admin-ui/src/landing; (2) update pasca-fix HIGH: `./index.css` kini di-import `App.tsx:1`, issue [LOW][INFERENSI] dinaikkan jadi [HIGH—DIFIX], rekomendasi diubah jadi catatan "sudah diterapkan", verifikasi `hero-gradient` di bundle.
