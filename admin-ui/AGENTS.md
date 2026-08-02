<!-- Parent: ../AGENTS.md -->
<!-- Scope: admin-ui | Stack: TypeScript / React / Vite / TailwindCSS / Oxlint | Status: complete | last_reviewed_commit: bac10d88791d79fd8cadf2840fa2defc4343587a -->
<!-- Generated: 2026-08-02 | Updated: 2026-08-02 -->

# admin-ui

## Purpose
SATU React SPA untuk SELURUH frontend 1ai-content — Landing (`/`), Admin (`/admin/*`), Customer (`/app/*`) — hasil konsolidasi customer-ui & landing-ui (dihapus; source digabung ke `src/app` & `src/landing`). Vite `base: "/"` TANPA basename; routing 3 namespace di `src/main.tsx`.

## Tech Stack

| Bagian | Teknologi |
|--------|-----------|
| UI | React ^19.2.7, react-router-dom ^7.18.1 |
| Build | Vite ^8.1.1, @vitejs/plugin-react ^6.0.3, TypeScript ~6.0.2 |
| Styling | TailwindCSS ^4.3.3 + @tailwindcss/vite |
| Lint | Oxlint ^1.71.0 (`.oxlintrc.json`) |

## Key Files

| File | Deskripsi |
|------|-----------|
| `src/App.tsx` | AdminApp — semua route admin (~41, relatif) + layout; index → `<Navigate to="dashboard" replace/>` |
| `src/app/App.tsx` | CustomerApp (ex-customer-ui) — AuthProvider + route relatif (login, reset-password, dashboard, create, videos, billing, subscriptions, referral, send, profile, settings, image) |
| `src/landing/App.tsx` | Landing (ex-landing-ui) — route `/` |
| `src/main.tsx` | Entry point — eager CSS (`./index.css` + `./styles/admin-skin.css`), lazy 3 app, Routes `/`→Landing, `/admin/*`→AdminApp, `/app/*`→CustomerApp |
| `src/api/client.ts` | Satu file berisi seluruh helper API (1.427 baris): `fetchJson`/`postJson`/`checkAuth`/`login`/`logout` + ~30 helper per-fitur |
| `vite.config.ts` | Konfigurasi build (`base: "/"`, plugin tailwindcss + react; proxy dev `/api` & `/auth` → localhost:3000) |
| `index.html` | HTML shell (lang="en", title "admin-ui") |

## Subdirectories

| Directory | Tujuan |
|-----------|--------|
| `src/` | Source utama (lihat `src/AGENTS.md`) |
| `src/app/` | Namespace Customer (ex-customer-ui) — route `/app/*` (lihat `src/app/AGENTS.md`) |
| `src/landing/` | Namespace Landing (ex-landing-ui) — route `/` (lihat `src/landing/AGENTS.md`) |
| `src/pages/` | Halaman per-route (lihat `src/pages/AGENTS.md`) |
| `src/pages/tools/` | Halaman tools di bawah `/tools/*` (lihat `src/pages/tools/AGENTS.md`) |
| `public/` | Aset statis (favicon.svg, icons.svg) — tidak diaudit |
| `dist/` | Output build Vite — di-skip |
| `node_modules/` | Dependencies — di-skip |

## For AI Agents

### Working In This Directory
- Build: `npm run build` (vite build → `dist/`), Dev: `npm run dev`, Lint: `npm run lint` (oxlint).
- SATU bundle, 3 namespace: route admin di `src/App.tsx`, customer di `src/app/App.tsx`, landing di `src/landing/App.tsx` (relatif, tanpa basename). CSS eager di `main.tsx` + `src/app/index.css` (di-import `app/App.tsx:1`) + `src/landing/index.css` (di-import `landing/App.tsx:1` pasca-fix 2026-08-02); waspadai konflik selector global lintas namespace (satu build).
- Semua request API same-origin (`API_BASE = ""` di `src/api/client.ts`); auth via cookie — sertakan `credentials: "include"` pada fetch yang melewati konteks berbeda.
- Route baru WAJIB didaftarkan di `src/App.tsx`; halaman baru ditaruh di `src/pages/` dan memanggil helper dari `src/api/client.ts`.
- Bahasa UI saat ini "en"; kustomisasi brand (title/lang di `index.html`, README) belum dilakukan — jangan asumsikan sudah beres.
- Backend di luar scope direktori ini (trace `Login`/`user_id=0` terputus di API `/admin/*` dan `/api/py/*`) — verifikasi sisi server sebelum mengubah perilaku auth.
- `/admin/*` di belakang auth Basic server-side (`src/routes/admin/auth.ts`) — tanpa credential 401 (browser prompt → cookie); login admin SPA end-to-end belum diverifikasi browser.

### Temuan Audit (2026-08-02, commit `bac10d88`)
- **[HIGH]** `src/pages/Login.tsx:98` — UI menampilkan "Default password: `admin`" hardcoded (default credential di client code). Trace menuju backend `/admin/login` tidak bisa diverifikasi dari scope ini.
- **[MEDIUM]** `user_id=0` hardcoded: `src/api/client.ts:214` (`/api/py/calendar/list/0`), `:230` (delete calendar `?user_id=0`), `:306` (`/api/py/ab-test/list/0`), `:320/:324/:329` (ab-test `?user_id=0`); `src/pages/ABTestsPage.tsx:66` & `src/pages/CalendarPage.tsx:84` (`user_id: 0`). [INFERENSI] user 0 = scope global/admin; verifikasi backend apakah data antar-user tercampur.
- **[MEDIUM]** `src/pages/Login.tsx` tidak pernah di-import — `App.tsx` tidak punya route `/login`; satu-satunya referensi adalah tautan `<a href="/admin/login">` di `src/pages/Settings.tsx:112`. [INFERENSI] login mungkin ditangani server-side, atau halaman Login adalah dead code.
- **[LOW]** Dua gaya styling tidak konsisten: `src/components/UI.tsx` memakai slate-900/purple-600 hardcoded, sedangkan `Layout.tsx`/`Sidebar.tsx`/`Login.tsx` memakai token custom (`text-text-primary`, `bg-accent`, `glass-strong`) dari `src/styles/admin-skin.css`.
- **[LOW]** `README.md` masih template Vite default; `index.html` belum disesuaikan brand (lang="en", title "admin-ui").
- **[LOW]** `tsconfig.app.json` tidak konsisten dengan `tsconfig.node.json` (`noUnusedLocals/Parameters: false` vs `true`) dan memuat komentar `/* Linting */` dobel (baris 19–20).
- **[LOW]** Path `/settings` muncul di 2 kategori Sidebar: `src/components/Sidebar.tsx:109` (Monetization → "Broadcast") dan `:134` (System → "Settings").
- **[LOW][INFERENSI]** CSS var undefined di namespace Admin: `src/styles/admin-skin.css` memakai `var(--surface)` (`:7/:41/:118/:152`) & `var(--accent)` (`:104/:106/:128`); class utility `bg-[var(--bg2)]` di `src/pages/` (MoviePage.tsx:461, BookshelfPage.tsx:506, MediasPage.tsx:508/543/594, ComicPage.tsx:329/475, AiConfigPage.tsx:302/315/330/354/373/388/396/565) & `accent-[var(--accent)]` (Music.tsx:177, Autopilot.tsx:171). `--surface:`/`--bg2:` tidak terdefinisi di file mana pun (grep definisi → 0 match); `--accent` KINI terdefinisi global via `src/landing/index.css:4` yang di-import `landing/App.tsx:1` (fix HIGH 2026-08-02 — lihat `src/landing/AGENTS.md`); `--surface:`/`--bg2:` masih undefined (grep definisi → 0 match). [INFERENSI] visual Admin berpotensi rusak (token fallback ke inherit) — sarankan definisikan di `src/index.css` (mis. blok `@theme` Tailwind v4).

## Excluded Paths

| Path | Alasan |
|------|--------|
| `dist/` | Build artifact — dihasilkan ulang oleh `npm run build` |
| `node_modules/` | Dependencies pihak ketiga |
| `public/` | Aset statis (favicon.svg, icons.svg) — tidak mengandung logika |

<!-- MANUAL: konsolidasi 2026-08-02 — 1 bundle, 3 namespace; customer-ui & landing-ui dihapus; base "/" tanpa basename. -->
<!-- MANUAL 2: 2026-08-02 pasca-fix — landing/index.css di-import (regresi HIGH ditutup); --accent kini terdefinisi global. -->

> Last updated: 2026-08-02 — (1) tambah temuan CSS var undefined (Admin namespace); referensi `src/app/AGENTS.md` & `src/landing/AGENTS.md` dibuat; (2) update pasca-fix HIGH regresi CSS landing (import landing/index.css), `--accent` terdefinisi global, sisa `--surface`/`--bg2` undefined.
