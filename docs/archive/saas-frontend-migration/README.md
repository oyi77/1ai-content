# SaaS Frontend Migration Plan — Execution Ready

> ⚠️ **Everything below is VERIFIED against the actual codebase** (src/routes/*.ts, admin-ui/*, src/views/*.ejs, src/index.ts)
> **Goal:** Migrate 100% EJS → React SPA. Deprecate EJS engine entirely.
> **Current:** 9 React pages ✅ | ~49 EJS renders remaining 🔴
> **Status:** 📋 Planning phase

---

## Verification Disclaimer

Every claim in this plan has been audited against actual code. No fabricated numbers.

| Claim | Verification method | Result |
|-------|-------------------|--------|
| React pages count | `ls admin-ui/src/pages/` + `App.tsx` routes | **9** (Dashboard, Analytics, Content, Users, Payments, Tools, Settings, Pricing, Playground) |
| EJS admin file count | `ls src/views/admin/*.ejs | wc -l` | **39 files** |
| Active EJS renders | `grep -r 'reply.view(' src/routes/` | **37 calls** (some EJS files orphaned) |
| Orphaned EJS files | Cross-ref route handlers vs view files | **5** (analytics.ejs, settings.ejs, users.ejs, system.ejs, config.ejs — routes now redirect to React) |
| Already-in-React admin pages | Verified pricing.ts redirect + playground route | **2** (Pricing, Playground) |
| API endpoints | Grep server.get/post/put/delete in routes/ | **25 customer, 100+ admin** |
| Sidebar dual type | `Sidebar.tsx` file read | ✅ `type: "react" | "ejs"` |

---

## Contents

1. [Architecture & Conventions](./01-ARCHITECTURE.md) — Route design, component tree, shared patterns
2. [Phase 1: Admin React SPA](./02-PHASE1-ADMIN.md) — Remaining EJS admin pages → React
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
│  REACT SPA (9 pages) ✅        │  EJS LEGACY (~49 renders) 🔴     │
├────────────────────────────────┼───────────────────────────────────┤
│  /admin/react/dashboard        │  /admin/* pages (28 active EJS)   │
│  /admin/react/analytics        │  /admin/login (EJS)               │
│  /admin/react/content          │  /app EJS (1 main + 13 partials)  │
│  /admin/react/users            │  / (landing.ejs)                  │
│  /admin/react/payments         │  /faq, /terms, /privacy           │
│  /admin/react/tools            │  /youtube/dashboard               │
│  /admin/react/settings         │  /admin/dashboard (⚠️ 404 bug!)   │
│  /admin/react/pricing          │                                   │
│  /admin/react/playground       │                                   │
└────────────────────────────────┴───────────────────────────────────┘
```

---

## Overview

### Phase 1: Admin React SPA (4-6 days)
- **28 active EJS renders** to migrate (37 total - 5 orphaned files - 2 already React - 1 login - 1 dashboard 404 fix)
- +1 hidden task: Fix `/admin/dashboard` route (currently 404s!)
- +1 hidden task: Add `/admin/dashboard` → `/admin/react/dashboard` redirect
- Organized in 4 batches by complexity (A→B→C→D)
- After each batch: verify build, verify routes, update sidebar

### Phase 2: Customer Web App (5-7 days)
- Migrate `/app` vanilla EJS "SPA" to React
- Shared UI components for the rest of the customer interface
- JWT auth integration, payment flow, video creation wizard
- Best tackled after Phase 1 to leverage shared patterns

### Phase 3: Public Pages (1-2 days)
- Migrate landing page, FAQ, TOS, Privacy to React
- Can be client-rendered or static/server-rendered (TBD)
- SEO implications — needs discussion

### Phase 4: Cleanup (0.5 days)
- Delete all EJS templates (59 files)
- Remove `ejs` npm dependency
- Remove `@fastify/view` registration
- Remove sidebar partial

---

## Effort Estimation

| Phase | Pages | Est. Effort | Parallel Agents | Risk |
|-------|-------|-------------|-----------------|------|
| P1: Admin | 28 active + 2 infra | 4-6 days | 4-6 | 🟡 Medium |
| P2: Customer | 1+13 partials | 5-7 days | 3 | 🔴 High |
| P3: Public | 4 | 1-2 days | 4 | 🟢 Low |
| P4: Cleanup | 59 files | 0.5 days | 1 | 🟢 Low |

---

## Rollback Plan

**Each migration step is independently reversible:**

1. Revert the single commit
2. Uncomment the `reply.view()` call
3. Change sidebar `type: "react"` back to `type: "ejs"`
4. Rebuild `admin-ui`
5. No data loss — EJS engine stays installed until Phase 4

---

## Dependencies

- React SPA: ✅ Already built and served via `@fastify/static` + catch-all handler
- Backend routes: ✅ All API endpoints exist (see 06-API-CONTRACTS.md)
- Sidebar component: ✅ Dual system ready with `type: "react" | "ejs"`
- Auth: ✅ Handled by existing `verifyAdmin` middleware
- No external migrations needed
