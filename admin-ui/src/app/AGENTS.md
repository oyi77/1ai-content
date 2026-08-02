<!-- Parent: ../AGENTS.md -->
<!-- Scope: admin-ui/src/app | Stack: TypeScript / React / Vite | Status: complete | last_reviewed_commit: bac10d88791d79fd8cadf2840fa2defc4343587a -->
<!-- Generated: 2026-08-02 | Updated: 2026-08-02 -->

---
scope: admin-ui/src/app
depends_on: [admin-ui/src/main.tsx, admin-ui/src/api/client.ts]
status: complete
---

# AGENTS.md — admin-ui/src/app

## Tujuan Folder Ini
Namespace CustomerApp (ex-`customer-ui/`, sudah dihapus) dalam SATU SPA: dashboard pelanggan untuk kelola kredit, video, billing, subscription, referral, dan pengaturan akun. Dimount lazy di route `/app/*` dari `admin-ui/src/main.tsx:24`.

## Ekspor / Interface Utama
- `CustomerApp()` — default export `app/App.tsx:24`; penyusun semua route customer.
- `AuthProvider` — dipakai `app/App.tsx:26`; konteks auth (definisi di `auth/AuthContext`).
- `ProtectedRoute` — `app/auth/ProtectedRoute.tsx:4`; redirect `<Navigate to="/app/login" replace/>` jika tidak login (`:16`).
- `Layout` — `app/layout/Layout.tsx:17`; sidebar nav (`navItems` `:4-15`, semua `/app/*`), credits badge, mobile bottom nav.
- Route relatif (terdaftar di `App.tsx:29-46`): `/login`, `/reset-password`, index → `Navigate` ke dashboard, `/dashboard`, `/create`, `/videos`, `/billing`, `/subscriptions`, `/referral`, `/send`, `/profile`, `/settings`, `/image`, `*` → dashboard.
- Halaman (12 file di `app/pages/`): LoginPage, ResetPasswordPage, Dashboard, CreateVideo, MyVideos, Billing, Subscriptions, Referral, SendBalance, Profile, Settings, ImageGenerator.

## Dependensi Internal
- Depends on: `admin-ui/src/main.tsx` (lazy mount `CustomerApp` route `/app/*`), `admin-ui/src/api/client.ts` (helper API shared `API_BASE = ""`), `./index.css` (styling self-contained token `--color-*`, di-import `app/App.tsx:1`).
- Depended by: `admin-ui/AGENTS.md` (Key Files `src/app/App.tsx`), root `AGENTS.md`.

## Issue Spesifik
- [MEDIUM] `user_id=0` hardcoded di helper API shared — cross-ref `admin-ui/AGENTS.md` Temuan Audit (tidak didobel di sini). Catatan scope: `CalendarPage.tsx:84` & `ABTestsPage.tsx:66` adalah halaman **Admin** (`../pages/`), bukan namespace ini, tapi memanggil helper yang sama dari `api/client.ts` yang juga dipakai namespace ini.
- [LOW] `./index.css` di-import `app/App.tsx:1` → selector-nya GLOBAL di satu bundle (`.sidebar`, `.main-content`, `.page-header`, `.btn`, `.credits-badge`, `.mobile-nav` — dipakai `layout/Layout.tsx`). Dengan 3 namespace (Admin `src/App.tsx`, Customer `src/app`, Landing `src/landing`) dalam satu build, class generik berpotensi saling timpa (contoh `.nav-link` juga ada di `src/landing/index.css:55`).

## Rekomendasi Perbaikan Scoped
```css
/* Before (app/index.css) — class global, ikut bundle utama bersama Admin & Landing */
.sidebar { width: 240px; ... }
.btn { ... }

/* After — beri prefiks namespace .app- lalu update JSX di app/pages/* & app/layout/* */
.app-sidebar { width: 240px; ... }
.app-btn { ... }
```

> Last updated: 2026-08-02 — namespace baru hasil konsolidasi customer-ui/ → admin-ui/src/app.
