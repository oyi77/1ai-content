# Migration Tracking

> Progress tracker for SaaS frontend migration.
> Last updated: 2026-07-28 20:00 UTC
> **VERIFIED against codebase** — reflects actual file analysis.

---

## Legend

✅ Complete | 🔄 In progress | 🔴 Stays EJS (intentional) | ⏸ Kept EJS (intentional deviation from plan)

---

## Phase 1: Admin React SPA — Status

| # | Page | Route | Status | Notes |
|---|------|-------|--------|-------|
| ✅ | Dashboard | `/admin/react/dashboard` | ✅ | React live |
| ✅ | Analytics | `/admin/react/analytics` | ✅ | React live |
| ✅ | Content | `/admin/react/content` | ✅ | React live |
| ✅ | Users | `/admin/react/users` | ✅ | React live |
| ✅ | Payments | `/admin/react/payments` | ✅ | React live |
| ✅ | Tools | `/admin/react/tools` | ✅ | React live |
| ✅ | Settings | `/admin/react/settings` | ✅ | React live |
| ✅ | Pricing | `/admin/react/pricing` | ✅ | React live |
| ✅ | Playground | `/admin/react/playground` | ✅ | React live |
| ✅ | Captions | `/admin/react/captions` | ✅ | React |
| ✅ | CloakBrowser | `/admin/react/cloak` | ✅ | React |
| ✅ | Engagement | `/admin/react/engagement` | ✅ | React |
| ✅ | Video Tools | `/admin/react/video-tools` | ✅ | React |
| ✅ | Ad Renderer | `/admin/react/render-ad` | ✅ | React |
| ✅ | Storyboard | `/admin/react/storyboard` | ✅ | React |
| ✅ | Media Gallery | `/admin/react/medias` | ✅ | React |
| ✅ | Pinterest→FB | `/admin/react/pinterest` | ✅ | React |
| ✅ | TTS Voice | `/admin/react/tts` | ✅ | React |
| ✅ | Music Generator | `/admin/react/music` | ✅ | React |
| ✅ | Looping Video | `/admin/react/looping` | ✅ | React |
| ✅ | Autopilot | `/admin/react/autopilot` | ✅ | React |
| ✅ | Channel Analysis | `/admin/react/analyze` | ✅ | React |
| ✅ | Bookshelf | `/admin/react/bookshelf` | ✅ | React |
| ✅ | Book Research | `/admin/react/research` | ✅ | React |
| ✅ | Persona Mgmt | `/admin/react/personas` | ✅ | React |
| ✅ | Niche Mgmt | `/admin/react/niches` | ✅ | React |
| ✅ | Prompt Mgmt | `/admin/react/prompts` | ✅ | React |
| ✅ | Interceptions | `/admin/react/interceptions` | ✅ | React |
| ✅ | Content Calendar | `/admin/react/calendar` | ✅ | React |
| ✅ | Trending Scanner | `/admin/react/trending` | ✅ | React |
| ✅ | A/B Tests | `/admin/react/ab-tests` | ✅ | React |
| ✅ | Carousel Generator | `/admin/react/carousel` | ✅ | React |
| ✅ | Re-Metadata Engine | `/admin/react/remeta` | ✅ | React |
| ✅ | Content Repurpose | `/admin/react/repurpose` | ✅ | React |
| ✅ | AI Config | `/admin/react/ai-config` | ✅ | React — 16 endpoints |
| ✅ | Provider Mgmt | `/admin/react/providers` | ✅ | React — 8 endpoints |
| ✅ | Fanpage Manager | `/admin/react/fanpage` | ✅ | React |
| ✅ | `/admin/dashboard` 404 fix | N/A | ✅ | Route handler added |
| ✅ | Comic Generator | `/admin/react/comic` | ✅ | React |
| ✅ | Movie Generator | `/admin/react/movie` | ✅ | React |
| ✅ | Dynamic Pricing | `/admin/react/dynamic-pricing` | ✅ | React |
| ✅ | Broadcast | `/admin/settings#broadcast` | ✅ | Redirects to Settings (React) |
| | **Infrastructure** | | | |
| ✅ | Admin Login EJS kept | `/admin/login` | 🔴 | Stays EJS intentionally |
| ✅ | Admin Layout | partial | ✅ | Replaced by React sidebar |

**Total: 35+ React pages, 1 EJS (login), 56 EJS deleted**

---

## Phase 2: Customer Web App — Status

| # | Page | Status | Notes |
|---|------|--------|-------|
| ✅ | Dashboard (`/app`) | ✅ | React SPA |
| ✅ | Create Video Wizard | ✅ | React |
| ✅ | My Videos | ✅ | React |
| ✅ | Billing | ✅ | React |
| ✅ | Subscriptions | ✅ | React |
| ✅ | Referral | ✅ | React |
| ✅ | Send Balance | ✅ | React |
| ✅ | Profile | ✅ | React |
| ✅ | Settings | ✅ | React |
| ✅ | AI Image Generator | ✅ | React |

**Total: 10 React pages, all live at `/app/` via `customer-ui/`**

---

## Phase 3: Public Pages — Status (INTENTIONALLY KEPT as EJS)

| # | Page | Status | Notes |
|---|------|--------|-------|
| ⏸ | Landing (`/`) | 🔴 | Kept as EJS intentionally |
| ⏸ | FAQ | 🔴 | Kept as EJS intentionally |
| ⏸ | TOS | 🔴 | Kept as EJS intentionally |
| ⏸ | Privacy | 🔴 | Kept as EJS intentionally |

**Decision**: These 4 public pages were kept as EJS rather than migrated to React. No migration planned.

---

## Phase 4: Cleanup — Status

| # | Task | Status | Notes |
|---|------|--------|-------|
| ✅ | Delete admin EJS (39 files + partials) | ✅ | 53 orphaned EJS files deleted |
| ✅ | Delete web EJS (18 files) | ✅ | Kept 4 public + 1 youtube dashboard |
| ⏸ | Remove youtube dashboard EJS | 🔴 | Intentionally kept |
| ⏸ | Remove `ejs` npm dependency | 🔴 | Still used by 6 EJS templates |
| ⏸ | Remove `@fastify/view` registration | 🔴 | Still used by 6 EJS templates |
| ✅ | Remove sidebar partial | ✅ | Replaced by React Sidebar.tsx |
| ⏸ | Remove Broadcast sidebar `type: "ejs"` | ✅ | Changed to `type: "react"` /settings |

**Status**: 6 EJS templates remain intentionally. EJS infrastructure kept because templates are active.

---

## Summary

| Category | Total | ✅ Done | 🔴 Staying / Kept |
|----------|-------|---------|-------------------|
| Admin React pages | ~38 | 38 | 0 |
| Admin EJS (login) | 1 | 0 | 1 (login) |
| Customer React pages | 10 | 10 | 0 |
| Public EJS pages | 4 | 0 | 4 (landing, faq, tos, privacy) |
| Other EJS | 1 | 0 | 1 (youtube dashboard) |
| EJS files deleted | 56 | 56 | — |
| **React SPA total** | **~45** | **45** | — |

### Key deviations from original plan
1. **Phase 3 public pages** — kept as EJS, not migrated (intentional decision)
2. **Phase 4 EJS deps** — `ejs` + `@fastify/view` remain installed because 6 EJS templates are still active
3. **Admin login** — always planned to stay EJS; still correct
