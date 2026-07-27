# Migration Tracking

> Progress tracker for SaaS frontend migration.
> Last updated: 2026-07-28 18:00 UTC
> **VERIFIED against codebase** — all numbers reflect actual file analysis.

---

## Legend

◌ Not started | 🔄 In progress | ✅ Complete | ❌ Blocked | 🔴 Not migrating (stays EJS)

---

## Phase 1: Admin React SPA — Status

| # | Page | Route | Status | Agent | Notes |
|---|------|-------|--------|-------|-------|
| | | **ALREADY DONE (9 pages)** | | |
| ✅ | Dashboard | `/admin/react/dashboard` | ✅ | — | React live |
| ✅ | Analytics | `/admin/react/analytics` | ✅ | — | React live |
| ✅ | Content | `/admin/react/content` | ✅ | — | React live |
| ✅ | Users | `/admin/react/users` | ✅ | — | React live |
| ✅ | Payments | `/admin/react/payments` | ✅ | — | React live |
| ✅ | Tools | `/admin/react/tools` | ✅ | — | React live |
| ✅ | Settings | `/admin/react/settings` | ✅ | — | React live |
| ✅ | Pricing | `/admin/react/pricing` | ✅ | — | Already redirects to React |
| ✅ | Playground | `/admin/react/playground` | ✅ | — | Already redirects to React |
| | | **BATCH A: Simple Cards (6 pages)** | | |
| T01 | Captions | `/admin/react/captions` | ◌ | | |
| T02 | CloakBrowser | `/admin/react/cloak` | ◌ | | |
| T03 | Engagement | `/admin/react/engagement` | ◌ | | |
| T04 | Video Tools | `/admin/react/video-tools` | ◌ | | |
| T05 | Ad Renderer | `/admin/react/render-ad` | ◌ | | |
| T06 | Storyboard | `/admin/react/storyboard` | ◌ | | |
| | | **BATCH B: CRUD Tables (8 pages)** | | |
| T07 | Media Gallery | `/admin/react/medias` | ◌ | | Verify exact API endpoints |
| T08 | Pinterest→FB | `/admin/react/pinterest` | ◌ | | View-only page |
| T09 | TTS Voice | `/admin/react/tts` | ◌ | | |
| T10 | Music Generator | `/admin/react/music` | ◌ | | |
| T11 | Looping Video | `/admin/react/looping` | ◌ | | |
| T12 | Autopilot | `/admin/react/autopilot` | ◌ | | |
| T13 | Channel Analysis | `/admin/react/analyze` | ◌ | | |
| T14 | Bookshelf | `/admin/react/bookshelf` | ◌ | | API: POST/GET/GET:id `/api/books` |
| | | **BATCH C: Medium (7 pages)** | | |
| T15 | Book Research | `/admin/react/research` | ◌ | | |
| T16 | Persona Mgmt | `/admin/react/personas` | ◌ | | API: CRUD `/api/personas` |
| T17 | Niche Mgmt | `/admin/react/niches` | ◌ | | API: CRUD `/api/niches` |
| T18 | Prompt Mgmt | `/admin/react/prompts` | ◌ | | API: CRUD `/api/admin-prompts` |
| T19 | Interceptions | `/admin/react/interceptions` | ◌ | | API: POST toggle/upload/deliver |
| T20 | Content Calendar | `/admin/react/calendar` | ◌ | | |
| T21 | Trending Scanner | `/admin/react/trending` | ◌ | | |
| T22 | A/B Tests | `/admin/react/ab-tests` | ◌ | | |
| | | **BATCH D: Complex (6 pages)** | | |
| T23 | Carousel Generator | `/admin/react/carousel` | ◌ | | |
| T24 | Re-Metadata Engine | `/admin/react/remeta` | ◌ | | |
| T25 | Content Repurpose | `/admin/react/repurpose` | ◌ | | |
| T26 | AI Config | `/admin/react/ai-config` | ◌ | | 16 endpoints — most complex |
| T27 | Provider Mgmt | `/admin/react/providers` | ◌ | | 8 endpoints |
| T28 | Fanpage Manager | `/admin/react/fanpage` | ◌ | | API: GET/POST/GET:id `/api/fanpages` |
| | | **INFRASTRUCTURE** | | |
| T29 | Fix `/admin/dashboard` 404 | N/A | ◌ | | **BUG**: no route handler exists |
| T30 | Comic Generator | `/admin/react/comic` | ◌ | | |
| T31 | Movie Generator | `/admin/react/movie` | ◌ | | |
| T32 | Dynamic Pricing | `/admin/react/dynamic-pricing` | ◌ | | |
| T33 | Broadcast | `/admin/react/broadcast` | ◌ | | |
| | | **STAYS EJS** | | |
| T37 | Admin Login | `/admin/login` | 🔴 | — | Stays EJS intentionally |
| T38 | Admin Layout | partial | 🔴 | — | Removed in Phase 4 |

## Phase 2: Customer Web App — Status

| # | Page | Status | Agent | Notes |
|---|------|--------|-------|-------|
| T34 | Dashboard (`/app`) | ◌ | | Vanilla JS EJS, most complex |
| T35 | Create Video Wizard | ◌ | | 6-step flow |
| T36 | View Videos | ◌ | | |
| T37 | Billing | ◌ | | |
| T38 | Subscriptions | ◌ | | |
| T39 | Referral | ◌ | | |
| T40 | Send Balance | ◌ | | |
| T41 | Profile | ◌ | | |
| T42 | Settings | ◌ | | |
| T43 | AI Image Generator | ◌ | | |

## Phase 3: Public Pages — Status

| # | Page | Status | Agent | Notes |
|---|------|--------|-------|-------|
| T44 | Landing (`/`) | ◌ | | Complex: Redis config, i18n, packages |
| T45 | FAQ | ◌ | | Simple |
| T46 | TOS | ◌ | | Simple |
| T47 | Privacy | ◌ | | Simple |

## Phase 4: Cleanup — Status

| # | Task | Status | Dependencies |
|---|------|--------|-------------|
| T48 | Delete admin EJS (39 files + 1 partial) | ◌ | All T01-T33 done |
| T49 | Delete web EJS (18 files) | ◌ | Phase 2 + 3 done |
| T50 | Delete youtube EJS (1 file) | ◌ | Phase 1 done |
| T51 | Remove `ejs` npm dependency | ◌ | All EJS files gone |
| T52 | Remove `@fastify/view` registration | ◌ | All EJS renders gone |
| T53 | Remove sidebar partial | ◌ | All admin pages use React sidebar |

---

## Summary

| Category | Total | ✅ Done | ◌ To Do | 🔴 Staying |
|----------|-------|---------|---------|------------|
| Admin pages | 39 | 9 | 29 | 1 (login) |
| Customer pages | 1+13 partials | 0 | 14 | 0 |
| Public pages | 4 | 0 | 4 | 0 |
| YouTube pages | 1 | 0 | 1 | 0 |
| **Total** | **~58** | **9** | **48** | **1** |
