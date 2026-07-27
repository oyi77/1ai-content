# Phase 1: Admin React SPA — Detailed Task Breakdown

> **Goal:** All 33 admin EJS pages → React
> **Total estimated effort:** ~50 agent-hours
> **Can parallelize:** Up to 6 agents (Batch A has many simple pages)

---

## Execution Order

```
Batch A (6 agents parallel) → Batch B (4 agents) → Batch C (4 agents) → Batch D (2 agents)
    11 simple pages            6 CRUD pages         9 medium pages        5 complex pages
```

---

## BATCH A — Simple Pages (11 pages, 0.5-1h each)

Agents can pick any task from this batch. No dependencies between them.

### T01 — Captions Manager
```
📋 Task: Captions Manager
Route: /admin/captions → /admin/react/captions
Pattern: B (CRUD Table) — Simple list
API: None exists — list from page JS state
Files to create: admin-ui/src/pages/admin/Captions.tsx
Files to modify:
  - admin-ui/src/App.tsx → add Route
  - src/routes/admin/content-tools.ts → add redirect for /admin/captions
  - admin-ui/src/components/Sidebar.tsx → type: "ejs" → "react"
Acceptance criteria:
  - Renders caption management UI
  - Caption CRUD works (if API exists) or static UI
Estimated effort: 0.5h
```

### T02 — CloakBrowser Manager
```
📋 Task: CloakBrowser Manager
Route: /admin/cloak → /admin/react/cloak
Pattern: B (CRUD Table)
API: None exists — static UI
Files to create: admin-ui/src/pages/admin/Cloak.tsx
Files to modify: Same as T01 pattern
Estimated effort: 0.5h
```

### T03 — Engagement Manager
```
📋 Task: Engagement Manager
Route: /admin/engagement → /admin/react/engagement
Pattern: B (CRUD Table)
API: None exists — static UI
Estimated effort: 0.5h
```

### T04 — Trending Scanner
```
📋 Task: Trending Scanner
Route: /admin/trending → /admin/react/trending
Pattern: A (Card Display)
API: None exists — static UI
Estimated effort: 0.5h
```

### T05 — Content Calendar
```
📋 Task: Content Calendar
Route: /admin/calendar → /admin/react/calendar
Pattern: A (Card Display)
Estimated effort: 0.5h
```

### T06 — Looping Video
```
📋 Task: Looping Video
Route: /admin/looping → /admin/react/looping
Pattern: A (Card Display)
Estimated effort: 0.5h
```

### T07 — Re-Metadata Engine
```
📋 Task: Re-Metadata Engine
Route: /admin/remeta → /admin/react/remeta
Pattern: A (Card Display)
Estimated effort: 0.5h
```

### T08 — Content Repurpose
```
📋 Task: Content Repurpose
Route: /admin/repurpose → /admin/react/repurpose
Pattern: A (Card Display)
Estimated effort: 0.5h
```

### T09 — TTS Voice Generator
```
📋 Task: TTS Voice Generator
Route: /admin/tts → /admin/react/tts
Pattern: C (Form Submit)
Estimated effort: 0.5h
```

### T10 — Book Research
```
📋 Task: Book Research
Route: /admin/research → /admin/react/research
Pattern: A (Card Display)
Estimated effort: 0.5h
```

### T11 — Media Gallery
```
📋 Task: Media Gallery
Route: /admin/medias → /admin/react/medias
Pattern: A (Card Display) with image grid
Estimated effort: 1h
```

---

## BATCH B — CRUD Pages (6 pages, 1-2h each)

These follow Pattern B (CRUD Table). Start after Batch A completes so agents can reuse `DataTable` component.

### T12 — Fanpage Manager
```
📋 Task: Fanpage Manager
Route: /admin/fanpage → /admin/react/fanpage
Pattern: B (CRUD Table)
API: GET /api/fanpages, POST /api/fanpages, PUT /api/fanpages/:id, DELETE /api/fanpages/:id
API contract: See 06-API-CONTRACTS.md §Fanpage
Estimated effort: 1.5h
```

### T13 — Prompt Management
```
📋 Task: Prompt Management
Route: /admin/prompts → /admin/react/prompts
Pattern: B (CRUD Table)
API: GET /api/admin-prompts, POST /api/admin-prompts, PUT /api/admin-prompts/:id, DELETE /api/admin-prompts/:id
Note: Redirect already exists in prompts.ts line 29 — still renders EJS. Replace with React.
Estimated effort: 1.5h
```

### T14 — Interceptions
```
📋 Task: Live Interceptions
Route: /admin/interceptions → /admin/react/interceptions
Pattern: B (CRUD Table)
API: GET /api/interceptions, POST /api/intercept/toggle, POST /api/intercept/upload, POST /api/intercept/deliver
Estimated effort: 2h
```

### T15 — A/B Tests
```
📋 Task: A/B Tests
Route: /admin/ab-tests → /admin/react/ab-tests
Pattern: B (CRUD Table)
API: None exists — CRUD UI with localStorage or add API
Estimated effort: 1h
```

### T16 — Personas
```
📋 Task: Persona Management
Route: /admin/personas → /admin/react/personas
Pattern: B (CRUD Table)
API: GET /api/personas, POST /api/personas
Estimated effort: 1.5h
```

### T17 — Pricing Config
```
📋 Task: Pricing Config
Route: /admin/pricing → /admin/react/pricing
Pattern: C (Form Submit) + B (CRUD)
API: GET /api/pricing-overview, POST /api/pricing, DELETE /api/pricing, GET /api/pricing-recommendation
Note: Currently renders EJS in pricing.ts:169. Need to fix redirect first.
Estimated effort: 2h
```

---

## BATCH C — Medium Pages (9 pages, 1.5-3h each)

Need Batch A+B to complete first for component reuse.

### T18 — Bookshelf AI Book Generator
```
📋 Task: Bookshelf AI Book Generator
Route: /admin/bookshelf → /admin/react/bookshelf
Pattern: Custom (LLM generation UI)
API: GET /api/books, POST /api/books, GET /api/books/:id
Estimated effort: 2h
Notes: Complex — has AI generation prompt UI, preview, and save flow. Uses OmniRoute/Ollama.
```

### T19 — Comic Generator
```
📋 Task: Comic Generator
Route: /admin/comic → /admin/react/comic
Pattern: Custom (generation UI)
API: GET /api/comics, POST /api/comics, GET /api/comics/:id
Estimated effort: 2h
```

### T20 — Movie Generator
```
📋 Task: Movie Generator
Route: /admin/movie → /admin/react/movie
Pattern: Custom (generation UI)
API: GET /api/movies, POST /api/movies, GET /api/movies/:id
Estimated effort: 2h
```

### T21 — Video Tools
```
📋 Task: Video Tools
Route: /admin/video-tools → /admin/react/video-tools
Pattern: A (Card Display) + tool grid
Estimated effort: 1.5h
```

### T22 — Storyboard Creator
```
📋 Task: Storyboard Creator
Route: /admin/storyboard → /admin/react/storyboard
Pattern: Custom (editor UI)
Estimated effort: 2.5h
```

### T23 — Ad Renderer
```
📋 Task: Ad Renderer
Route: /admin/render-ad → /admin/react/render-ad
Pattern: C (Form Submit) with preview
Estimated effort: 2h
```

### T24 — Carousel Generator
```
📋 Task: Carousel Generator
Route: /admin/carousel → /admin/react/carousel
Pattern: Custom (editor UI)
Estimated effort: 2.5h
```

### T25 — Music Generator
```
📋 Task: Music Generator
Route: /admin/music → /admin/react/music
Pattern: C (Form Submit) with audio player
Estimated effort: 1.5h
```

### T26 — Channel Analysis
```
📋 Task: Channel Analysis
Route: /admin/analyze → /admin/react/analyze
Pattern: Dashboard-style (stats display)
Estimated effort: 2h
```

### T27 — Autopilot
```
📋 Task: Autopilot Content Jobs
Route: /admin/autopilot → /admin/react/autopilot
Pattern: B (CRUD Table) + status polling
Estimated effort: 2h
```

---

## BATCH D — Complex Pages (5 pages, 2-4h each)

Need all prior batches for patterns and shared components.

### T28 — Model Playground
```
📋 Task: Model Playground
Route: /admin/playground → /admin/react/playground
Pattern: Custom (complex UI)
API: GET OmniRoute models (internal), POST to providers for testing
Current complexity: Uses OmniRouteService.listModels(), multi-provider selector, chat interface
Estimated effort: 4h
Notes: Most complex admin page. Has:
  - Model selector (fetched from OmniRoute)
  - Chat/play interface
  - Video providers list
  - Image providers list
```

### T29 — Provider Management
```
📋 Task: Provider Management
Route: /admin/providers → /admin/react/providers
Pattern: C (Form Submit) — settings forms
API: Multiple endpoints for provider config
Estimated effort: 3h
```

### T30 — AI Config
```
📋 Task: AI Config
Route: /admin/ai-config → /admin/react/ai-config
Pattern: C (Form Submit)
API: GET/PUT /api/admin/ai-config, GET/PUT /api/admin/prompts-config, GET/PUT /api/admin/chat-config
Estimated effort: 2h
```

### T31 — Pinterest Scan
```
📋 Task: Pinterest → Facebook Pipeline
Route: /admin/pinterest → /admin/react/pinterest
Pattern: Custom
Estimated effort: 2h
```

### T32 — Dynamic Pricing
```
📋 Task: Dynamic Pricing
Route: /admin/dynamic-pricing → /admin/react/dynamic-pricing
Pattern: C (Form Submit) with calculator UI
API: Exchange rate service, pricing calculation
Estimated effort: 3h
```

### T33 — Settings (Remaining)
```
📋 Task: System Settings
Route: /admin/settings → /admin/react/settings
Pattern: C (Form Submit)
Note: Already has redirect in prompts.ts line 32-34 to /admin/react/settings.
But the React Settings page is minimal. Need to expand it with all settings tabs.
Estimated effort: 3h
```

---

## Page Normalization — Breaking Down by Agent

### What each agent creates per page:

```
📁 File: admin-ui/src/pages/admin/<Name>.tsx
├── Template header (React component)
├── API fetch using useApi or direct fetch
├── 3-state handling (loading / error / empty)
├── Render logic matching Pattern A/B/C/D
└── Default export
```

### What each agent modifies per page:

```tsx
// 1. App.tsx — Add route
<Route path="pricing" element={<Pricing />} />  // under admin Layout

// 2. Sidebar.tsx — Change type
{ label: "Pricing", path: "/pricing", type: "react" }  // was "ejs"

// 3. Route file — Add redirect (if not already there)
// In src/routes/admin/<sub>.ts
server.get("/admin/pricing", async (_request, reply) => {
  return reply.redirect("/admin/react/pricing");
});
```

### Verification checklist (agent runs this before claiming done):

```bash
# 1. Build
cd admin-ui && npm run build

# 2. Check route responds
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/react/pricing
# Should return 200

# 3. Check sidebar link still works
grep -r "pricing" admin-ui/src/components/Sidebar.tsx | grep "type: \"react\""

# 4. Check old EJS redirects
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/pricing
# Should return 302 (redirect)
```
