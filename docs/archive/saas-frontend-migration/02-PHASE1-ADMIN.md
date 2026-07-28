# Phase 1: Admin React SPA — Detailed Task Breakdown

> **Goal:** All active EJS admin pages → React
> **Total estimated effort:** ~28 agent-hours
> **Parallelizable:** Up to 6 agents (Batch A has many simple pages)
> **VERIFIED:** Every claim below checked against actual files in `src/routes/`, `src/views/`, and `admin-ui/src/`

---

## Current State (Verifiable)

| Metric | Count | How Verified |
|--------|-------|-------------|
| EJS admin `.ejs` files | **39** | `ls src/views/admin/*.ejs \| wc -l` |
| EJS admin partials | **1** | `sidebar.ejs` |
| `reply.view()` calls in admin routes | **37** | `grep -rn 'reply.view(' src/routes/` |
| Already in React | **2** | `pricing.ts` → `/admin/react/pricing` redirect, playground route exists |
| Orphaned EJS files (no route renders them) | **5** | `analytics.ejs`, `settings.ejs`, `users.ejs`, `system.ejs`, `config.ejs` — their routes now redirect to React |
| Admin login (intentionally stays EJS) | **1** | `/admin/login` renders `admin/login.ejs` |
| `/admin/dashboard` missing route | **1** | No route handler — currently returns 404! |
| **Active admin EJS to migrate** | **28** | 37 - 5 orphaned - 2 already React - 1 login - 1 dashboard 404 fix = **28** |

---

## Batch A: Simple Cards — No API Backend (6 pages)

These pages are informational/status dashboards with NO backend API. They display static data or render server-side data at view time. Fastest to migrate. **Parallel: all 6 can run at once.**

| # | Page | EJS File | Route File | Effort | Pattern |
|---|------|----------|-----------|--------|---------|
| T01 | 📋 Captions Manager | `captions.ejs` | `content-tools.ts:6-13` | 0.5h | Static Card |
| T02 | 📋 CloakBrowser | `cloak.ejs` | `content-tools.ts:14-21` | 0.5h | Static Card |
| T03 | 📋 Engagement Manager | `engagement.ejs` | `content-tools.ts:23-31` | 0.5h | Static Card |
| T04 | 📋 Video Tools | `video-tools.ejs` | `content-tools.ts:32-40` | 0.5h | Static Card |
| T05 | 📋 Ad Renderer | `render-ad.ejs` | `content-tools.ts:41-48` | 0.5h | Static Card |
| T06 | 📋 Storyboard Creator | `storyboard.ejs` | `content-tools.ts:50-57` | 0.5h | Static Card |

**Migration pattern for Batch A:**
```tsx
// pages/Captions.tsx — no API needed
export default function Captions() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Captions Manager</h1>
      <p>Feature available. Use the Telegram bot for Captions.</p>
    </div>
  );
}
```

**Sidebar change:** Set `type: "react"` for captions, cloak, engagement, video-tools, render-ad, storyboard.

**Route change:** Add `reply.redirect("/admin/react/<page>")` in each route file, replacing `reply.view(...)`.

---

## Batch B: Simple CRUD Tables (8 pages)

These pages have standard GET/POST/PUT/DELETE API endpoints. Need DataTable component. **Parallel: 4 agents can take 2 pages each.**

| # | Page | API Endpoints | Effort | Pattern |
|---|------|--------------|--------|---------|
| T07 | 🖼️ Media Gallery (`/admin/medias`) | See A7 | 1.5h | CRUD Table |
| T08 | 🖼️ Pinterest → FB (`/admin/pinterest`) | Page only — no API | 1h | Static + Redirect |
| T09 | 🎤 TTS Voice (`/admin/tts`) | See A9 | 1.5h | CRUD Table |
| T10 | 🎵 Music Generator (`/admin/music`) | See A10 | 1.5h | CRUD Table |
| T11 | 🔄 Looping Video (`/admin/looping`) | See A11 | 1h | CRUD Table |
| T12 | 🤖 Autopilot (`/admin/autopilot`) | See A12 | 2h | CRUD Table |
| T13 | 📊 Channel Analysis (`/admin/analyze`) | See A13 | 1.5h | CRUD Table |
| T14 | 📖 Bookshelf (`/admin/bookshelf`) | POST/GET/GET:id `/api/books` | 1.5h | CRUD Table |

---

## Batch C: Medium Complexity (8 pages)

These have more complex forms or multi-section layouts. **Parallel: 4 agents.**

| # | Page | API Endpoints | Effort | Pattern |
|---|------|--------------|--------|---------|
| T15 | 📚 Book Research (`/admin/research`) | See C1 | 2h | Form + Table |
| T16 | 🎨 Persona Management (`/admin/personas`) | GET/POST/PUT/DELETE `/api/personas` | 2h | CRUD + Form |
| T17 | 🎯 Niche Management (`/admin/niches`) | GET/POST/PUT/DELETE `/api/niches` | 2h | CRUD + Form |
| T18 | 📋 Prompt Management (`/admin/prompts`) | GET/POST/PUT/DELETE `/api/admin-prompts` | 2h | CRUD + Form |
| T19 | 📋 Live Interceptions (`/admin/interceptions`) | POST `/api/intercept/toggle`, POST `/api/intercept/upload`, POST `/api/intercept/deliver` | 2.5h | CRUD Table + Upload |
| T20 | 📊 Calender (`/admin/calendar`) | See C6 | 2h | Calendar Widget |
| T21 | 📈 Trending Scanner (`/admin/trending`) | See C7 | 2h | Table + Filters |
| T22 | 🔬 A/B Tests (`/admin/ab-tests`) | See C8 | 2h | CRUD + Stats |

---

## Batch D: Complex Pages (6 pages)

These have complex forms with file uploads, multi-step processes, or heavy state. **Parallel: 2-3 agents.**

| # | Page | API Endpoints | Effort | Pattern |
|---|------|--------------|--------|---------|
| T23 | 📊 Carousel Generator (`/admin/carousel`) | See D1 | 3h | Multi-step Form |
| T24 | 🔄 Re-Metadata Engine (`/admin/remeta`) | See D2 | 3h | Form + Preview |
| T25 | 🔄 Content Repurpose (`/admin/repurpose`) | See D3 | 3h | Form + Table |
| T26 | 🎨 AI Config (`/admin/ai-config`) | 16 API endpoints in `ai-config.ts` | 4h | Multi-tab Config |
| T27 | 🔌 Provider Management (`/admin/providers`) | 8 API endpoints in `provider-mgmt.ts` | 3h | CRUD + Status |
| T28 | 📋 Fanpage Manager (`/admin/fanpage`) | GET/POST/GET:id `/api/fanpages` | 2h | CRUD Table |

---

## Infrastructure Tasks (9 pages — Batch Z)

These are special cases: redirect-only, already React, or broken.

| # | Task | Current State | Action | Effort |
|---|------|--------------|--------|--------|
| T29 | 🛰️ **Fix admin/dashboard 404** | No route handler — 404! | Add route handler that redirects to `/admin/react/dashboard` | 0.5h |
| T30 | 🔄 Settings EJS → already React | `settings.ts` redirects to React | Already done — mark complete | 0h |
| T31 | 🔄 Users EJS → already React | Redirect exists | Already done — mark complete | 0h |
| T32 | 🔄 Config EJS → already React | Redirect exists | Already done — mark complete | 0h |
| T33 | 🔄 System EJS → already React | `admin-config.ts:144` redirects to `/admin/settings` → React | Already done — mark complete | 0h |
| T34 | 🔄 Analytics EJS → already React | Redirect exists | Already done — mark complete | 0h |
| T35 | 🔄 Pricing → already React | `pricing.ts:168` → `/admin/react/pricing` | Already done — mark complete | 0h |
| T36 | 🔄 Playground → already React | Route exists in App.tsx | Already done — mark complete | 0h |
| T37 | 🔴 Admin login stays EJS | Login is intentionally EJS | **Keep as-is** — no migration needed | N/A |

---

## Generated React Routes (App.tsx)

```tsx
{/* Batch A - Simple Cards */}
<Route path="/captions" element={<Captions />} />
<Route path="/cloak" element={<Cloak />} />
<Route path="/engagement" element={<Engagement />} />
<Route path="/video-tools" element={<VideoTools />} />
<Route path="/render-ad" element={<RenderAd />} />
<Route path="/storyboard" element={<Storyboard />} />

{/* Batch B - CRUD Tables */}
<Route path="/medias" element={<Medias />} />
<Route path="/pinterest" element={<Pinterest />} />
<Route path="/tts" element={<Tts />} />
<Route path="/music" element={<Music />} />
<Route path="/looping" element={<Looping />} />
<Route path="/autopilot" element={<Autopilot />} />
<Route path="/analyze" element={<Analyze />} />
<Route path="/bookshelf" element={<Bookshelf />} />

{/* Batch C - Medium */}
<Route path="/research" element={<Research />} />
<Route path="/personas" element={<Personas />} />
<Route path="/prompts" element={<Prompts />} />
<Route path="/interceptions" element={<Interceptions />} />
<Route path="/calendar" element={<Calendar />} />
<Route path="/trending" element={<Trending />} />
<Route path="/ab-tests" element={<AbTests />} />

{/* Batch D - Complex */}
<Route path="/carousel" element={<Carousel />} />
<Route path="/remeta" element={<Remeta />} />
<Route path="/repurpose" element={<Repurpose />} />
<Route path="/ai-config" element={<AiConfig />} />
<Route path="/providers" element={<Providers />} />
<Route path="/fanpage" element={<Fanpage />} />
```

---

## Acceptance Criteria per Task

Each ticket is complete when:

```markdown
- [ ] React component renders at `/admin/react/<page>`
- [ ] Old EJS route redirects to `/admin/react/<page>` (not 404)
- [ ] Sidebar `type` changed from `"ejs"` to `"react"`
- [ ] Loading state shown during API fetch
- [ ] Error state shown on API failure
- [ ] Empty state shown when no data
- [ ] All CRUD operations work
- [ ] Build passes: `cd admin-ui && npm run build`
```

---

## Infra T29 Detail: Fix `/admin/dashboard` 404

**Current state (verified):** No `server.get("/admin/dashboard", ...)` handler exists. The auth hook checks for it (line 172), but no route renders anything. Result: **404 Not Found**.

**Fix:**
```ts
// In admin.ts (or a new file)
server.get("/admin/dashboard", async (_request, reply) => {
  return reply.redirect("/admin/react/dashboard");
});
```

Or if the existing `registerDashboardRoutes` should handle it:
```ts
// In dashboard-api.ts
server.get("/admin/dashboard", async (_request, reply) => {
  return reply.redirect("/admin/react/dashboard");
});
```
