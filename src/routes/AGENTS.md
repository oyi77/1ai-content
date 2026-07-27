<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-01 | Updated: 2026-04-01 -->

# routes

## Purpose
Fastify HTTP route handlers for the admin dashboard, webhooks, health checks, and public web pages.

## Key Files

| File | Description |
|------|-------------|
| `admin.ts` | Admin dashboard + API endpoints. Auth: Basic auth, cookie `admin_token`, or `?token=` query param vs `ADMIN_PASSWORD` |
| `health.ts` | Health check endpoint for monitoring |
| `web.ts` | Public web app routes — aggregator for 8 sub-modules in `web/` (was previously a 1423-line god object) |
| `web/pages.ts` | Landing page, FAQ, TOS, Privacy, static files, PWA manifest, payment finish page |
| `web/auth.ts` | `POST /auth/telegram` — Telegram login widget / Mini App auth |
| `web/user.ts` | `/api/user` CRUD, `/api/user/videos`, `/api/user/history`, `/api/video/:jobId` |
| `web/content.ts` | `/api/storyboard`, `/api/video/create`, `/api/video/analyze`, `/api/image/generate`, `/api/image/describe`, `/video/:jobId/download` |
| `web/finance.ts` | `/api/packages`, `/api/payment/create`, `/api/my/transactions`, `/api/user/p2p-transfer`, `/api/referral`, `/api/subscriptions` |
| `web/chat.ts` | `/api/chat/landing` — landing page AI chat widget |
| `web/aliases.ts` | `/api/v1/*` redirects for backward compatibility |
| `web/middleware.ts` | Shared `getUser()` helper for JWT/API-key auth |

## For AI Agents

### Working In This Directory
- Admin auth uses 3 methods — all compare against `ADMIN_PASSWORD` env var
- Webhook routes validate `WEBHOOK_SECRET`
- Payment webhooks normalize through `PaymentService.handleNotification()`

### Testing Requirements
- Unit tests in `tests/unit/routes/`
- E2E tests in `tests/e2e/` and `tests/e2e/playwright/`

## Dependencies

### Internal
- `@/services/*`, `@/views/*`, `@/config/env`

### External
- `fastify`, `@fastify/view`

<!-- MANUAL: -->
