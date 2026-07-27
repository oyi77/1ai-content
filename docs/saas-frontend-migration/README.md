# SaaS Frontend Migration Plan — Execution Ready

> **Goal:** Migrate 100% EJS → React SPA. Deprecate EJS engine entirely.
> **Current:** 7 React pages ✅ | ~51 EJS pages remaining 🔴
> **Executable by:** Multiple AI agents (Claude Code, Codex, OpenCode) working in parallel
> **Status:** 📋 Planning phase

---

## Contents

1. [Architecture & Conventions](./01-ARCHITECTURE.md) — Route design, component tree, shared patterns
2. [Phase 1: Admin React SPA](./02-PHASE1-ADMIN.md) — 33 EJS admin pages → React
3. [Phase 2: Customer Web App](./03-PHASE2-CUSTOMER.md) — `/app` → React SPA
4. [Phase 3: Public Pages](./04-PHASE3-PUBLIC.md) — Landing, FAQ, TOS, Privacy
5. [Phase 4: Cleanup](./05-PHASE4-CLEANUP.md) — Delete EJS, remove dependency
6. [API Contracts](./06-API-CONTRACTS.md) — All endpoint shapes for every page
7. [Component Inventory & Reuse](./07-COMPONENTS.md) — Shared components, patterns
8. [Testing Strategy](./08-TESTING.md) — What to test per page
9. [Execution Workflow](./09-EXECUTION.md) — How agents pick up tasks, PR flow
10. [Tracking](./10-TRACKING.md) — Progress tracker per page

---

## Quick Start for Agent

Each agent picks a **task** from the tracking sheet. Each task contains:

```
📋 Task: [Page Name]
├── Route: /admin/<page>
├── API: GET /api/<endpoint>, POST /api/<endpoint>
├── Files to create:
│   ├── admin-ui/src/pages/<Page>.tsx
│   └── admin-ui/src/pages/<Page>.module.css (optional)
├── Files to modify:
│   ├── admin-ui/src/App.tsx (add route)
│   └── src/routes/admin/<sub>.ts (add redirect)
├── Component pattern: [Simple-Card | CRUD-Table | Form-Submit | Dashboard-Widget]
├── API contract: See 06-API-CONTRACTS.md
├── Acceptance criteria:
│   ├── [ ] Page renders without EJS
│   ├── [ ] All CRUD operations work
│   ├── [ ] Error states display correctly
│   ├── [ ] Loading states shown
│   └── [ ] Sidebar type changed to "react"
└── Estimated effort: [0.5h | 1h | 2h | 4h]
```

---

## Current State Summary

```
┌────────────────────────────────────────────────────────────────────┐
│                       1ai-content Frontend                          │
├────────────────────────────────┬───────────────────────────────────┤
│  REACT SPA (7 pages) ✅        │  EJS LEGACY (~51 pages) 🔴        │
├────────────────────────────────┼───────────────────────────────────┤
│  /admin/react/dashboard        │  /admin/* pages (33 EJS)          │
│  /admin/react/analytics        │  /app EJS (1 main + 13 partials)  │
│  /admin/react/content          │  / (landing.ejs 3402 lines)       │
│  /admin/react/users            │  /faq, /terms, /privacy           │
│  /admin/react/payments         │  /youtube/dashboard               │
│  /admin/react/tools            │                                   │
│  /admin/react/settings         │                                   │
└────────────────────────────────┴───────────────────────────────────┘
```

---

## Dependency Graph for Agents

```
Phase 1 (Admin) ───────────────────────────────────────────┐
  ├── Batch A (Simple pages) ─ can run in parallel (3 agents)
  ├── Batch B (CRUD pages) ── depends on Batch A patterns
  ├── Batch C (Medium) ────── depends on Batch A+B patterns
  └── Batch D (Complex) ───── depends on all above
                                                           │
Phase 2 (Customer) ────────────────────────────────────────┤
  ├── Auth/Login ──────────── needs API: /auth/telegram
  ├── Simple pages ────────── Dashboard, Profile, Settings
  ├── Medium pages ────────── Billing, Videos, Referral
  └── Complex pages ───────── Create Wizard (6-step), AI Image
                                                           │
Phase 3 (Public) ──────────────────────────────────────────┤
  ├── Landing ─────────────── complex (Redis config, i18n)
  ├── FAQ/TOS/Privacy ─────── simple static pages
                                                           │
Phase 4 (Cleanup) ─────────────────────────────────────────┘
  └── All phases complete → remove EJS engine + views/
```

---

## File Structure After Migration

```
admin-ui/
├── src/
│   ├── App.tsx                    ← All routes (admin + customer + public)
│   ├── main.tsx                   ← Entry point (already exists)
│   ├── api/
│   │   ├── client.ts             ← Shared API client (already exists)
│   │   ├── admin.ts              ← Admin-specific API calls
│   │   └── customer.ts           ← Customer-specific API calls
│   ├── components/
│   │   ├── Layout.tsx            ← Admin layout (already exists)
│   │   ├── Sidebar.tsx           ← Admin sidebar (already exists)
│   │   ├── CustomerLayout.tsx    ← Customer app layout
│   │   ├── PublicLayout.tsx      ← Public pages layout
│   │   ├── DataTable.tsx         ← Shared table component
│   │   ├── FormField.tsx         ← Shared form field
│   │   ├── LoadingSpinner.tsx    ← Shared loading state
│   │   ├── ErrorDisplay.tsx      ← Shared error state
│   │   ├── EmptyState.tsx        ← Shared empty state
│   │   └── ConfirmDialog.tsx     ← Shared confirmation dialog
│   ├── pages/                    ← Admin pages
│   │   ├── admin/                ← All admin page components
│   │   ├── customer/             ← All customer page components
│   │   └── public/               ← Landing, FAQ, etc.
│   ├── hooks/
│   │   ├── useApi.ts             ← Generic data fetching hook
│   │   ├── useAuth.ts            ← Auth context + hook
│   │   └── usePagination.ts      ← Pagination hook
│   ├── context/
│   │   └── AuthContext.tsx       ← Auth state provider
│   └── styles/
│       ├── admin-skin.css        ← Already exists
│       └── customer-skin.css     ← Customer theme
├── dist/                         ← Built output
├── vite.config.ts                ← Update base for multi-route
└── package.json
```

---

## Agent Protocol

### Picking up a task
1. Read this README.md (overview)
2. Read `01-ARCHITECTURE.md` (patterns to follow)
3. Read the specific phase file for your task
4. Read `06-API-CONTRACTS.md` for endpoint shapes
5. Read `07-COMPONENTS.md` for reusable components
6. Execute the task per `09-EXECUTION.md`
7. Update `10-TRACKING.md` when done

### Communication
- Each agent works independently on assigned tasks
- No cross-agent dependencies within the same batch
- If an API gap is found → document in the task, move to next page
- If a shared component needs changes → add to `07-COMPONENTS.md` first

### Deliverables per task
```
✅ Page renders at /admin/react/<page>
✅ Sidebar type changed to "react"
✅ Old EJS route redirects to React
✅ Loading state shown during data fetch
✅ Error state shown on failure
✅ Empty state shown when no data
✅ All API operations working (GET/POST/PUT/DELETE)
```
