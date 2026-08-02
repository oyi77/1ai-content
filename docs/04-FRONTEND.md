# 04 — Frontend Architecture

## Stack

| Layer | Technology |
|-------|-----------|
| Admin SPA | React 18, React Router 6, TypeScript, Vite, Tailwind CSS v4 |
| Customer SPA | React 18, React Router 6, TypeScript, Vite |
| Server-rendered views | EJS (Embedded JavaScript templates) |
| Design system | Custom variables in `src/views/admin/layout.ejs` + element-plus elements |
| Build tools | Vite for SPAs, tsx/custom for EJS |

## Admin React SPA (`admin-ui/`)

### Build Configuration

```typescript
// admin-ui/vite.config.ts
export default defineConfig({
  base: "/admin/",              // Assets served at /admin/assets/*
  build: { outDir: "dist" },    // Output: admin-ui/dist/
});
```

### Router Structure

```typescript
// admin-ui/src/App.tsx
<BrowserRouter basename="/admin">
  <Routes>
    <Route element={<Layout />}>
      <Route path="/" element={<Navigate to="/dashboard" />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/analytics" element={<Analytics />} />
      <Route path="/analytics/calendar" element={<CalendarPage />} />
      <Route path="/analytics/trending" element={<TrendingPage />} />
      <Route path="/analytics/ab-tests" element={<ABTestsPage />} />
      <Route path="/analytics/carousel" element={<CarouselPage />} />
      <Route path="/analytics/remeta" element={<RemetaPage />} />
      <Route path="/analytics/repurpose" element={<RepurposePage />} />
      <Route path="/analytics/research" element={<ResearchPage />} />
      <Route path="/content" element={<Content />} />
      <Route path="/users" element={<Users />} />
      <Route path="/payments" element={<Payments />} />
      <Route path="/tools" element={<Tools />} />
      <Route path="/tools/cloak" element={<Cloak />} />
      <Route path="/tools/engagement" element={<Engagement />} />
      <Route path="/tools/video-tools" element={<VideoTools />} />
      <Route path="/tools/storyboard" element={<Storyboard />} />
      <Route path="/tools/render-ad" element={<RenderAd />} />
      <Route path="/tools/pinterest" element={<Pinterest />} />
      <Route path="/tools/fanpage" element={<Fanpage />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/medias" element={<MediasPage />} />
      <Route path="/ai-config" element={<AiConfigPage />} />
      <Route path="/comic" element={<ComicPage />} />
      <Route path="/playground" element={<Playground />} />
      <Route path="/tts" element={<Tts />} />
      <Route path="/music" element={<Music />} />
      <Route path="/bookshelf" element={<BookshelfPage />} />
      <Route path="/movie" element={<MoviePage />} />
      <Route path="/providers" element={<ProvidersPage />} />
      <Route path="/captions" element={<Captions />} />
      <Route path="/analyze" element={<Analyze />} />
      <Route path="/looping" element={<Looping />} />
      <Route path="/autopilot" element={<Autopilot />} />
      <Route path="/prompts" element={<PromptsPage />} />
      <Route path="/personas" element={<PersonasPage />} />
      <Route path="/dynamic-pricing" element={<DynamicPricingPage />} />
      <Route path="/config" element={<ConfigPage />} />
      <Route path="/system" element={<SystemPage />} />
      <Route path="/interceptions" element={<InterceptionsPage />} />
    </Route>
  </Routes>
</BrowserRouter>
```

All routes are children of `<Layout />` which provides the sidebar navigation and header.

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

## EJS Views (`src/views/`)

Server-rendered templates using EJS. The layout system uses:

```
src/views/
├── admin/
│   ├── layout.ejs          — Admin layout with sidebar, nav, CSS/JS includes
│   ├── admin-login.ejs     — Login page (standalone, no layout)
│   ├── admin-dashboard.ejs — Dashboard (embedded layout)
│   ├── pricing.ejs         — Pricing page (standalone)
│   └── ...                 — Feature-specific admin pages
├── pages/
│   ├── landing.ejs         — Landing page
│   ├── faq.ejs             — FAQ
│   ├── terms.ejs           — Terms of service
│   ├── privacy.ejs         — Privacy policy
│   └── payment/
│       └── finish.ejs      — Payment completion page
├── partials/
│   ├── sidebar.ejs         — Sidebar navigation
│   ├── header.ejs          — Header bar
│   └── ...
```

### Layout Inheritance

Admin pages that EXTEND `layout.ejs` get the sidebar, header, and CSS/JS includes automatically. Standalone pages (login, pricing) do NOT have access to the `esc()` helper — they must define their own if needed.

```ejs
<%# admin-dashboard.ejs %>
<%- include('layout', { title: 'Dashboard' }) %>
<!-- page content -->
```

Standalone pages must include all CSS/JS manually and copy the `esc()` helper:

```ejs
<script>
function esc(s) {
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
</script>
```

## Design System

CSS variables defined in `layout.ejs` and `admin-login.ejs`:

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