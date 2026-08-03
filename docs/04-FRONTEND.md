# 04 — Frontend Architecture

## Stack

| Layer | Technology |
|-------|-----------|
| Admin/Customer/Landing SPA | React 19, react-router-dom 7, TypeScript, Vite, Tailwind CSS v4 — SATU bundle `admin-ui/`, 3 namespace (`/`, `/admin/*`, `/app/*`) di `src/main.tsx` |
| Server-rendered views | EJS (sisa: `admin/login.ejs`, `web/{privacy,tos,faq}.ejs`, `youtube/dashboard.ejs`) |
| Design system | Tailwind v4 theme + `admin-ui/src/styles/admin-skin.css` + `src/index.css` |
| Build tools | Vite (admin-ui) |

> Konsolidasi 2026-08-02: `customer-ui/` & `landing-ui/` dihapus; source digabung ke `admin-ui/src/{app,landing}`.

## Admin React SPA (`admin-ui/`)

### Build Configuration

```typescript
// admin-ui/vite.config.ts
export default defineConfig({
  base: "/",                    // Assets served at /assets/*; 3 namespace SPA dimount di src/main.tsx
  build: { outDir: "dist" },    // Output: admin-ui/dist/ (emptyOutDir: true)
});
```

### Router Structure

Runtime: satu `BrowserRouter` **tanpa basename** di `admin-ui/src/main.tsx`, dengan 3 route lazy pada 3 namespace, lalu `admin-ui/src/App.tsx` memegang ~40 route relatif di dalam `<Layout />` (sidebar + header):

```typescript
// admin-ui/src/main.tsx
<BrowserRouter>
  <Routes>
    <Route path="/" element={<Landing />} />                 {/* Landing namespace */}
    <Route path="/admin/*" element={<Suspense fallback={<Spinner />}><AdminApp /></Suspense>} />  {/* AdminApp = src/App.tsx */}
    <Route path="/app/*" element={<Suspense fallback={<Spinner />}><CustomerApp /></Suspense>} />  {/* Customer namespace */}
  </Routes>
</BrowserRouter>

// admin-ui/src/App.tsx — route relatif di dalam <Layout /> (komentar: dimount di bawah <Route path="/admin/*">)
<Routes>
  <Route element={<Layout />}>
    <Route index element={<Navigate to="dashboard" replace />} />
    <Route path="dashboard" element={<Dashboard />} />
    {/* ...analytics, analytics/calendar, tools/*, settings, prompts, personas,
        dynamic-pricing, config, system, interceptions, dst. — ~40 route relatif */}
  </Route>
</Routes>
```

Semua route server-render-nya: Fastify catch-all `sendFile("index.html")` untuk `/admin/*` & `/app/*`, lalu router di sisi client yang memetakan pathname ke namespace.

### Page Organization

```
admin-ui/src/
├── App.tsx              — Router configuration
├── main.tsx              — React entry point
├── api/
│   └── client.ts         — API client (fetch wrapper, auth token handling)
├── components/
│   ├── Layout.tsx        — Sidebar + header shell
│   ├── Sidebar.tsx       — Navigation sidebar
│   ├── StatusBadge.tsx   — Reusable status badges
│   └── ...
├── pages/
│   ├── Dashboard.tsx     — Main admin dashboard
│   ├── Analytics.tsx     — Analytics overview
│   ├── CalendarPage.tsx   — Content calendar
│   ├── TrendingPage.tsx   — Trending content
│   ├── ABTestsPage.tsx   — A/B test management
│   ├── Content.tsx       — Content management
│   ├── Users.tsx         — User management
│   ├── Payments.tsx      — Payment management
│   ├── Tools.tsx         — Tools index page
│   ├── Settings.tsx      — System settings
│   ├── Pricing.tsx       — Pricing management
│   └── ...               — 20+ additional pages
│   tools/
│   ├── Cloak.tsx         — Cloak browser management
│   ├── Engagement.tsx    — Engagement analytics
│   ├── VideoTools.tsx    — Video processing
│   ├── Storyboard.tsx    — Storyboard generation
│   ├── RenderAd.tsx      — Ad rendering
│   ├── Pinterest.tsx     — Pinterest management
│   └── Fanpage.tsx       — Fan page management
```

### API Client Pattern

```typescript
// admin-ui/src/api/client.ts
const API_BASE = "/api";

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",  // sends cookies
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

The SPA uses `credentials: "include"` to send the `admin_token` cookie with every API call.

### Auth Redirect

If any API call returns 401, the client redirects to `/admin/login`:

```typescript
if (res.status === 401) {
  window.location.href = "/admin/login";
  throw new Error("Unauthorized");
}
```

## Customer SPA namespace (`admin-ui/src/app/` — ex-`customer-ui/`)

### Build Configuration

Consolidated ke `admin-ui/` (vite `base: "/"`, tanpa basename) — lihat `admin-ui/AGENTS.md` & `docs/01-ARCHITECTURE.md`.

### Router

Route namespace `/app/*` dimount di `admin-ui/src/main.tsx` (CustomerApp lazy) → `src/app/App.tsx` (`AuthProvider` + `ProtectedRoute` + route relatif). Nav sidebar: `src/app/layout/Layout.tsx:4-15` (semua `/app/*`).

## Remaining EJS Templates (`src/views/`)

Server-rendered EJS tersisa minimal (legacy — mayoritas UI sudah SPA React `admin-ui/`):

```
src/views/
├── admin/
│   └── login.ejs            — Halaman login admin (standalone, no layout)
├── web/
│   ├── privacy.ejs          — Privacy policy
│   ├── tos.ejs              — Terms of service
│   └── faq.ejs              — FAQ
└── youtube/
    └── dashboard.ejs        — YouTube dashboard
```

> Catatan 2026-08-02 (audit): layout `layout.ejs`, `admin-dashboard.ejs`, `admin-login.ejs`, `pages/landing.ejs`, `partials/` dsb. yang disebut versi lama TIDAK lagi dipakai — dashboard admin kini React SPA (`admin-ui/`), landing = SPA namespace `/`, dan sisa EJS hanya 5 file di atas.

## Design System

Styling utama kini Tailwind v4 (`admin-ui/`), dengan theme token di `admin-ui/src/index.css` & `admin-ui/src/styles/admin-skin.css`. Blok CSS di bawah adalah referensi palet warna dari versi EJS lama (`layout.ejs` / `admin-login.ejs`) yang sudah tidak dipakai — dipertahankan sebagai catatan warna brand:

```css
:root {
  --primary: #a855f7;      /* Purple accent */
  --primary-light: #c084fc;
  --bg: #0a0a0b;           /* Dark background */
  --bg-card: #18181b;
  --text: #fafafa;
  --text-muted: #a1a1aa;
  --radius: 12px;
}
```

### Static File Serving

- **Consolidated SPA**: `admin-ui/dist/` served at `/admin/` (index.ts:328-335) & `/assets/` (index.ts:346-359) via `@fastify/static`; SPA fallback notFoundHandler `/admin/*` & `/app/*` → `index.html` (index.ts:373-383)
- **Public files**: `public/` served at `/public/` via `@fastify/static`
- **Python backend**: Static video files at `/api/py/loop/video/{filename}`