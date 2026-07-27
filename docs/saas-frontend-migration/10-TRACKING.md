# Migration Tracking

> Progress tracker for SaaS frontend migration.
> Date: 2026-07-28
> Status: ◌ Not started | 🔄 In progress | ✅ Complete | ❌ Blocked

---

## Phase 1: Admin React SPA — Status

```
Pages migrated: 7 / 40  (18%)
Completed:      ◌
ETA:            5-7 days
```

| ID | Page | Route | Pattern | Agent | Status | Notes |
|----|------|-------|---------|-------|--------|-------|
| — | **Dashboard** | /admin/react/dashboard | D | — | ✅ | Already migrated |
| — | **Analytics** | /admin/react/analytics | D | — | ✅ | Already migrated |
| — | **Content** | /admin/react/content | — | — | ✅ | Already migrated |
| — | **Users** | /admin/react/users | B | — | ✅ | Already migrated |
| — | **Payments** | /admin/react/payments | B | — | ✅ | Already migrated |
| — | **Tools** | /admin/react/tools | — | — | ✅ | Already migrated |
| — | **Settings** | /admin/react/settings | C | — | ✅ | Already migrated (partial) |

### Batch A — Simple Pages (11 pages, 0.5-1h each)

| ID | Page | Route | Pattern | Agent | Status | Notes |
|----|------|-------|---------|-------|--------|-------|
| T01 | Captions Manager | /admin/captions | B | — | ◌ | |
| T02 | CloakBrowser | /admin/cloak | B | — | ◌ | |
| T03 | Engagement | /admin/engagement | B | — | ◌ | |
| T04 | Trending Scanner | /admin/trending | A | — | ◌ | |
| T05 | Content Calendar | /admin/calendar | A | — | ◌ | |
| T06 | Looping Video | /admin/looping | A | — | ◌ | |
| T07 | Re-Metadata | /admin/remeta | A | — | ◌ | |
| T08 | Repurpose | /admin/repurpose | A | — | ◌ | |
| T09 | TTS Voice | /admin/tts | C | — | ◌ | |
| T10 | Research | /admin/research | A | — | ◌ | |
| T11 | Media Gallery | /admin/medias | A | — | ◌ | |

### Batch B — CRUD Pages (6 pages, 1-2h each)

| ID | Page | Route | Pattern | Agent | Status | Notes |
|----|------|-------|---------|-------|--------|-------|
| T12 | Fanpage Manager | /admin/fanpage | B | — | ◌ | |
| T13 | Prompt Management | /admin/prompts | B | — | ◌ | Exists redirect stub |
| T14 | Interceptions | /admin/interceptions | B | — | ◌ | |
| T15 | A/B Tests | /admin/ab-tests | B | — | ◌ | |
| T16 | Personas | /admin/personas | B | — | ◌ | |
| T17 | Pricing Config | /admin/pricing | C+B | — | ◌ | |

### Batch C — Medium Pages (9 pages, 1.5-3h each)

| ID | Page | Route | Pattern | Agent | Status | Notes |
|----|------|-------|---------|-------|--------|-------|
| T18 | Bookshelf Generator | /admin/bookshelf | Custom | — | ◌ | LLM generation UI |
| T19 | Comic Generator | /admin/comic | Custom | — | ◌ | |
| T20 | Movie Generator | /admin/movie | Custom | — | ◌ | |
| T21 | Video Tools | /admin/video-tools | A | — | ◌ | |
| T22 | Storyboard | /admin/storyboard | Custom | — | ◌ | |
| T23 | Ad Renderer | /admin/render-ad | C | — | ◌ | |
| T24 | Carousel Generator | /admin/carousel | Custom | — | ◌ | |
| T25 | Music Generator | /admin/music | C | — | ◌ | |
| T26 | Channel Analysis | /admin/analyze | D | — | ◌ | |
| T27 | Autopilot | /admin/autopilot | B | — | ◌ | |

### Batch D — Complex Pages (5 pages, 2-4h each)

| ID | Page | Route | Pattern | Agent | Status | Notes |
|----|------|-------|---------|-------|--------|-------|
| T28 | Model Playground | /admin/playground | Custom | — | ◌ | Most complex page |
| T29 | Provider Mgmt | /admin/providers | C | — | ◌ | |
| T30 | AI Config | /admin/ai-config | C | — | ◌ | |
| T31 | Pinterest Scan | /admin/pinterest | Custom | — | ◌ | |
| T32 | Dynamic Pricing | /admin/dynamic-pricing | C | — | ◌ | |
| T33 | Settings (expand) | /admin/settings | C | — | ◌ | Needs more tabs |

---

## Phase 2: Customer Web App — Status

```
Pages: 10
Status: ◌ Not started
```

| ID | Page | Route | Pattern | Agent | Status | Notes |
|----|------|-------|---------|-------|--------|-------|
| T34 | Auth (Context+Login) | /app/login | Custom | — | ◌ | Prerequisite for all |
| T35 | Customer Dashboard | /app/dashboard | D | — | ◌ | |
| T36 | Profile & Settings | /app/profile, /app/settings | C | — | ◌ | |
| T37 | My Videos | /app/videos | Custom | — | ◌ | |
| T38 | Billing & Top Up | /app/billing | Custom | — | ◌ | 🔴 Payment flow |
| T39 | Subscription | /app/subscription | A | — | ◌ | |
| T40 | Referral System | /app/referral | A | — | ◌ | |
| T41 | Send Balance | /app/send | C | — | ◌ | |
| T42 | AI Image Gen | /app/image | Custom | — | ◌ | |
| T43 | Create Video Wizard | /app/create | Custom | — | ◌ | 🔴 6-step wizard |

---

## Phase 3: Public Pages — Status

```
Pages: 4
Status: ◌ Not started
```

| ID | Page | Route | Pattern | Agent | Status | Notes |
|----|------|-------|---------|-------|--------|-------|
| T44 | Landing Page | / | Custom | — | ◌ | 🟡 Dynamic pricing + i18n |
| T45 | FAQ | /faq | Static | — | ◌ | |
| T46 | Terms of Service | /terms | Static | — | ◌ | |
| T47 | Privacy Policy | /privacy | Static | — | ◌ | |

---

## Phase 4: Cleanup — Status

```
Tasks: 6
Status: ◌ Not started (needs P1+P2+P3 complete)
```

| ID | Task | Files Modified | Status | Notes |
|----|------|---------------|--------|-------|
| T48 | Remove EJS dependency | package.json | ◌ | |
| T49 | Delete EJS views | src/views/* | ◌ | ~54 files |
| T50 | Replace reply.view() | src/routes/* | ◌ | Multiple files |
| T51 | Simplify Sidebar | Sidebar.tsx | ◌ | Remove ejs type |
| T52 | Remove EJS engine | src/index.ts | ◌ | |
| T53 | Update AGENTS.md | AGENTS.md | ◌ | |

---

## Key Metrics

| Metric | Current | Target | 
|--------|---------|--------|
| React admin pages | 7 | 40 |
| Customer pages (React) | 0 | 10 |
| Public pages (React) | 0 | 4 |
| EJS files remaining | ~54 | 0 |
| Sidebar items type "ejs" | 27 | 0 |
| `reply.view()` calls | 39+ | 0 |
| npm ejs dependency | installed | removed |

---

## Daily Log

| Date | Progress | Agent |
|------|----------|-------|
| 2026-07-28 | Plan created, all docs drafted | — |
| — | — | — |
| — | — | — |

---

## Blockers

| Date | Blocker | Priority | Status |
|------|---------|----------|--------|
| — | — | — | — |

---

> **How to update:** After completing any task, edit this file and mark ◌ → ✅.
> Add your agent ID/name and date.
