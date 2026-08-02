<!-- Parent: ../AGENTS.md -->
<!-- Scope: src | Stack: TypeScript / React / Vite / TailwindCSS | Status: complete | depends_on: [admin-ui] -->
<!-- Generated: 2026-08-02 | Updated: 2026-08-02 -->

# src

## Purpose
Source code SPA admin React: entry point, routing, satu file API client, komponen bersama, halaman per-route, dan design tokens.

## Key Files

| File | Deskripsi |
|------|-----------|
| `main.tsx` | Entry point (10 baris): StrictMode, import `index.css` + `styles/admin-skin.css`, render `App` |
| `App.tsx` | Layout route wrapper + semua route (~41 route, lihat daftar lengkap di bawah); `"/"` → `Navigate` ke `/dashboard` |
| `api/client.ts` | Satu file (1.427 baris): `API_BASE = ""`, `fetchJson`/`postJson`/`checkAuth`/`login`/`logout`, lalu helper per-fitur (pricing, calendar, trending, ab-test, carousel, remeta, repurpose, research, tts, music/suno+musicgen, captions, analyze, loop, autopilot, cloak, engagement, video, render-ad, storyboard, pinterest, fanpage, env/runtime config, api-keys, personas, system health, token-stats, videos/books/comics/movies, ai-config + custom-providers + models-catalog + ai-chat, admin-prompts, intercept, users/search) |
| `components/Layout.tsx` | Breadcrumb + header + `Outlet` |
| `components/Sidebar.tsx` | 8 kategori navigasi; ikon SVG inline via `dangerouslySetInnerHTML` (line 163) — konten statis sehingga aman |
| `components/UI.tsx` | Input/Textarea/Select/Button/Tab/Spinner/StatusBadge/Toast |
| `styles/admin-skin.css` | Design tokens custom (296 baris): `text-text-primary`, `glass-strong`, `bg-accent`, dst. |

## Route Lengkap (dari `App.tsx`)
`/dashboard`, `/analytics` (+ `/calendar`, `/trending`, `/ab-tests`, `/carousel`, `/remeta`, `/repurpose`, `/research`), `/content`, `/users`, `/payments`, `/tools` (+ `/cloak`, `/engagement`, `/video-tools`, `/storyboard`, `/render-ad`, `/pinterest`, `/fanpage`), `/settings`, `/pricing`, `/medias`, `/ai-config`, `/comic`, `/playground`, `/tts`, `/music`, `/bookshelf`, `/movie`, `/providers`, `/captions`, `/analyze`, `/looping`, `/autopilot`, `/prompts`, `/personas`, `/dynamic-pricing`, `/config`, `/system`, `/interceptions`.

## Subdirectories

| Directory | Tujuan |
|-----------|--------|
| `pages/` | Halaman per-route (lihat `pages/AGENTS.md`) |
| `api/` | API client |
| `components/` | Komponen bersama |
| `styles/` | CSS + design tokens |

## For AI Agents

### Working In This Directory
- Semua request API lewat `api/client.ts` — jangan membuat fetch manual di halaman kecuali diperlukan.
- Route baru: tambahkan di `App.tsx` + buat halaman di `pages/`.
- `api/client.ts` sudah sangat besar — pertimbangkan pemecahan modul saat menambah fitur besar, jangan menambah helper tanpa diskusi.
- Ikon sidebar via SVG string (bukan JSX element) — jaga konsistensi.

### Issue Spesifik (verifikasi 2026-08-02)
- **[HIGH]** `pages/Login.tsx:98` — "Default password: `admin`" hardcoded di UI. Backend `/admin/login` (dipanggil via `login()` di `client.ts:58-67`) di luar scope — verifikasi apakah default benar aktif sebelum menghapus tampilan ini.
- **[MEDIUM]** `api/client.ts` — `user_id=0` hardcoded: baris 214, 230, 306, 320, 324, 329. [INFERENSI] scope global/admin; verifikasi backend.
- **[MEDIUM]** `pages/Login.tsx` tidak direferensikan sebagai komponen: `App.tsx` tidak punya route `/login` dan tidak ada import; `pages/Settings.tsx:112` hanya `<a href="/admin/login">`. [INFERENSI] server-side login atau dead code.
- **[LOW]** `components/UI.tsx` memakai warna slate/purple langsung, bertentangan dengan token `admin-skin.css` yang dipakai `Layout.tsx`/`Sidebar.tsx`/`Login.tsx` — pilih satu sumber kebenaran styling.
- **[LOW]** `client.ts:948` & `:958` (fanpage PUT/DELETE) tidak mencantumkan `credentials: "include"` eksplisit — non-issue fungsional saat ini karena same-origin mengirim cookie secara default, tetapi rapuh bila `API_BASE` berubah.

<!-- MANUAL: -->
