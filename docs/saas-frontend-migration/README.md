# SaaS Frontend Migration — Grand Plan

**Status:** Planning
**Target:** Q3–Q4 2026
**Owner:** Platform team

---

## 1. Why Migrate?

### Current Architecture (Server-Rendered EJS)

```
Browser ← EJS (Fastify) ← Prisma/Python API
         ↑
    Tailwind CDN + design-system.css
    Inline <style> + <script> per page
    No component reuse
    No client-side state
    No build step
```

### Target Architecture (Vue SPA)

```
Browser ← Vue 3 SPA (Vite) ——— Fastify/Python APIs
         ↑                          (stay as-is)
    Component library
    Pinia stores
    Per-tenant theming
    Code splitting
```

### Why Now?

| Reason | Detail |
|--------|--------|
| **Multi-tenancy** | Per-tenant theming = CSS variable swap. EJS needs per-tenant template patches. |
| **SaaS scale** | 100+ users concurrent. SPA + API reduces server rendering load. |
| **Component reusability** | 33 admin EJS files = 33 inline `<style>` blocks with copy-paste CSS. One component = one style. |
| **DX / iteration speed** | Vite HMR is instant. EJS edit = full page reload. |
| **API is already there** | Pydantic API at port 8767, Prisma backend. SPA consumes directly, skips nginx proxy. |
| **Future-proof** | Customer dashboard, white-label, embedded widgets — semua butuh SPA architecture. |

---

## 2. Grand Vision

```
┌─────────────────────────────────────────────────────────────┐
│                    1ai-content SaaS Platform                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐  ┌──────────────────┐                  │
│  │   Admin SPA      │  │  Customer Portal │                  │
│  │  (Vue 3)         │  │  (Vue 3)         │                  │
│  │  - Content mgmt  │  │  - Buy credits   │                  │
│  │  - User mgmt     │  │  - View history  │                  │
│  │  - Analytics     │  │  - Manage subs   │                  │
│  │  - Tenant config │  │  - White-label   │                  │
│  └────────┬─────────┘  └────────┬─────────┘                  │
│           │                     │                             │
│           └──────────┬──────────┘                             │
│                      │                                        │
│                      ▼                                        │
│  ┌──────────────────────────────────────────┐                 │
│  │         Vite Monorepo (apps/)            │                 │
│  │  apps/admin  ·  apps/portal  ·  lib/ui   │                 │
│  │  (shared component library + Pinia +     │                 │
│  │   vue-router + per-tenant theming)       │                 │
│  └────────────────────┬─────────────────────┘                 │
│                       │                                       │
│                       ▼                                       │
│  ┌──────────────────────────────────────────┐                 │
│  │          Existing Backend (unchanged)     │                 │
│  │  Fastify (port 3002) · Python API (8767)  │                │
│  │  Prisma · PostgreSQL · Telegram Bot       │                 │
│  └──────────────────────────────────────────┘                 │
│                                                              │
│  ┌──────────────────────────────────────────┐                 │
│  │          Tenant Layer                     │                 │
│  │  - subdomain: *.vilona.app               │                 │
│  │  - per-tenant: theme, pricing, features   │                 │
│  │  - Pinia store: active tenant context    │                 │
│  └──────────────────────────────────────────┘                 │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Tenant Resolution Flow (Future)

```
Request → Cloudflare → Fastify middleware → resolve subdomain
                                              ↓
                                     tenant config JSON
                                        ↓         ↓
                              SPA <meta theme>   API scoped to tenant_id
```

---

## 3. Phased Execution

### Phase A: Scaffold + Core Pattern (This Sprint)

**Goal:** Prove the pattern works with one real page. No downtime, EJS coexist.

| Step | What | Files |
|------|------|-------|
| A1 | Init Vite project in `apps/admin/` | `apps/admin/package.json`, `vite.config.ts` |
| A2 | Set up Vue 3 + vue-router + Pinia + TypeScript | `apps/admin/src/main.ts`, `router/index.ts`, `stores/` |
| A3 | Pick component library (Shadcn Vue or PrimeVue) | `apps/admin/src/components/ui/` |
| A4 | Create tenant-aware theme system (CSS variables) | `apps/admin/src/assets/theme/` |
| A5 | Proxy config: Vite dev server → existing Fastify/Python APIs | `vite.config.ts` proxy |
| A6 | **Port one page**: `/admin/dashboard` as Vue page | `apps/admin/src/pages/Dashboard.vue` |
| A7 | Serve in dev alongside EJS (Fastify serves SPA on subpath or separate port) | Fastify static middleware or reverse proxy |
| A8 | Update CI/CD: build SPA, deploy to Cloudflare Pages | `wrangler.toml`, deploy script |

**Entry:** Vite dev server (port 5173) proxies `/api/*` to Fastify (port 3002).
**Production:** `npx vite build` → static files served via Cloudflare Pages.

### Phase B: Port Admin Pages (Grouped by Surface)

**Strategy:** Page-by-page port. EJS page tetap jalan sampai Vue replacement siap.
Prioritas: pages that get the most use (dashboard, login → content tools → config → others).

| Batch | Pages | Notes |
|-------|-------|-------|
| B1 | dashboard, login, analytics | Core operator flow |
| B2 | bookshelf, comic, carousel | Content generation tools |
| B3 | fanpage, pinterest, engagement | Publishing tools |
| B4 | billing, pricing, config | Admin settings |
| B5 | ab-tests, calendar, trending, ai-config | Standalone/admin tools |

**Each batch:**
1. Create Vue route + page component
2. Extract shared UI (table, form, modal, card) into `lib/ui/`
3. Wire API calls (existing Fastify/Python endpoints unchanged)
4. Smoke test alongside EJS version
5. Deploy — both versions work, no redirect needed
6. Switch admin sidebar links to point at Vue route when all links in a section are ported

### Phase C: Shared Component Library

Evolve components extracted during Phase B into a documented library:

| Component | Source pages |
|-----------|-------------|
| `DataTable` | analytics, fanpage, billing |
| `FormField` | config, billing, ai-config |
| `MediaCard` | bookshelf, comic, fanpage |
| `Modal` | all pages |
| `StatusBadge` | all pages |
| `Sidebar/Header` | dashboard, analytics, all |
| `-Button` | all pages (replaces `.btn-primary` inline) |

### Phase D: Multi-Tenancy Layer

| Step | What |
|------|------|
| D1 | Tenant table in PostgreSQL + Prisma model |
| D2 | Fastify middleware: resolve tenant from subdomain/api key |
| D3 | Pinia store: `useTenant()` — current tenant config |
| D4 | CSS variable injection per tenant (theme colors, logo, brand name) |
| D5 | Feature flags per tenant (`plan: free/pro/enterprise`) |
| D6 | Scoped API access (user belongs to tenant, data isolated by `tenant_id`) |

### Phase E: Customer Portal

| Step | What |
|------|------|
| E1 | Separate Vite app `apps/portal/` (or lazy-loaded routes in admin SPA) |
| E2 | Public routes: login, register, pricing |
| E3 | Authenticated routes: dashboard, history, subscription, credits |
| E4 | White-label: per-tenant logo, colors, domain (`customer.vilona.app`) |
| E5 | Stripe/Midtrans checkout integration |
| E6 | Support widget (FAQ, ticket, chat) |

### Phase F: EJS Retirement

| Step | What |
|------|------|
| F1 | Grep for any remaining `reply.view()` calls — redirect to SPA or replace |
| F2 | Remove EJS templates, `@fastify/view` plugin, layout logic |
| F3 | Delete `src/views/admin/`, `public/admin/*.html` |
| F4 | Simplify server: remove all view rendering, server becomes pure API |

---

## 4. Architecture Decisions

### Framework: Vue 3 + Vite

| Factor | Vue 3 | React | Svelte |
|--------|-------|-------|--------|
| Learning curve | Low | Medium | Low |
| Bundle size | ~33KB | ~45KB + runtime | ~3KB compiled |
| Pinia (state) | First-party | Third-party (Zustand) | Stores |
| TypeScript | Excellent | Excellent | Good |
| Eco for admin | PrimeVue/Shadcn Vue | Ant Design/MUI | Skeleton |
| Current codebase | Zero Vue | Zero React | Zero Svelte |

**Decision:** Vue 3 + Vite — lightest lift for an admin-focussed SPA, first-party routing (vue-router) and state (Pinia), excellent component libraries for data-heavy pages.

### Component Library: Shadcn Vue (or PrimeVue)

- **Shadcn Vue** — copy-paste model (no heavy dependency), Tailwind-native, minimal
- **PrimeVue** — 100+ components, theming engine, DataTable with sort/filter/paginate out of the box
- Tentative: PrimeVue for data-heavy pages (tables, forms), custom/shadcn for brand-facing UI

### Routing: Dual Mode (EJS + SPA Coexist)

During migration, both systems run simultaneously:
- EJS: all existing pages (unchanged)
- Vue SPA: new ported pages, served at `/admin/v2/*` or separate port

Entrypoint: a toggle in sidebar or automatic redirect when a page is ported.

### State Management: Pinia Stores

```
stores/
  tenant.ts      — active tenant: id, name, theme, features
  auth.ts        — admin token, user, permissions
  ui.ts          — sidebar collapsed, theme mode, toasts
  content/       — books, comics, carousels cache
  analytics.ts   — metrics, chart data
```

### Build & Deploy

```
# Dev
apps/admin/  →  vite dev :5173  →  proxy /api/* → localhost:3002
                                   proxy /api/py/* → localhost:8767

# Production
apps/admin/  →  vite build        →  apps/admin/dist/
                                    →  served via Cloudflare Pages
                                    →  or Fastify static middleware (fallback)
```

---

## 5. Key Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration takes too long, both systems diverge | High | Phase A is small (one page). Each batch is <1 week. No big-bang. |
| EJS + SPA dual maintenance | Medium | Shared API layer. EJS is frozen after port. No new EJS features. |
| Tenant isolation security flaw | Critical | Fastify middleware enforces tenant scope on API. Review every new route. |
| DX friction (context-switch between EJS and Vue) | Low | All new development in Vue. EJS only touched for bug fixes. |
| Bundle size (PrimeVue is heavy) | Medium | Lazy loading per route. PrimeVue imports per component, not full library. |

---

## 6. Success Criteria

| Criterion | Measure |
|-----------|---------|
| Admin SPA replaces EJS for 80% of daily ops | Operator uses Vue dashboard, not EJS |
| Migration cost < 2 weeks total engineer time | Cumulative effort across all phases |
| Zero downtime | EJS stays live; switch happens per-page |
| Tenant theming works | Two tenants → different colors, logo, brand |
| Build time < 30s | Vite production build for admin SPA |
| Lighthouse score ≥ 80 | Performance, accessibility, best practices |

---

## 7. Current Status

| Phase | Status | Started | Completed |
|-------|--------|---------|-----------|
| A — Scaffold + Core Pattern | 🔴 Not started | — | — |
| B — Port Admin Pages | 🔴 Not started | — | — |
| C — Component Library | 🔴 Not started | — | — |
| D — Multi-Tenancy Layer | 🔴 Not started | — | — |
| E — Customer Portal | 🔴 Not started | — | — |
| F — EJS Retirement | 🔴 Not started | — | — |
