<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-01 -->

# Admin Dashboard Templates

EJS templates for the admin control panel. Served by Fastify at `/admin/dashboard` and sub-routes.

## Purpose

Render HTML dashboards for platform admins to monitor analytics, manage users, configure pricing, and adjust system settings.

## Key Files

| File | Purpose |
|---|
| `login.ejs` | Admin login form — Basic auth fallback UI |

> `analytics.ejs`, `prompts.ejs`, `pricing.ejs`, `users.ejs`, `config.ejs` were deleted 2026-08-03 — those admin surfaces moved to the React SPA (`admin-ui/`). See root AGENTS.md Prioritas #6.

## Subdirectories

None.

## For AI Agents

**Template structure:** EJS files use `<%% %>` (server-side); `<%%= %>` escapes output. Templates share a layout via partials. Login page is served at `/admin/login`; auth handled server-side (`src/routes/admin/auth.ts`).

> Deleted 2026-08-03: `analytics.ejs`, `prompts.ejs`, `pricing.ejs`, `users.ejs`, `config.ejs` — those admin surfaces moved to the React SPA (`admin-ui/`). Only `login.ejs` remains in this directory.