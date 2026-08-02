# 01 — Architecture

## Overview

1ai-content is a multi-service content platform: a **Fastify HTTP server** (port 3002) serves EJS views, a React admin SPA, and a customer-facing React SPA. A **Python FastAPI server** (port 8767) handles media processing (video, audio, bookshelf generation). An **nginx reverse proxy** (port 6969, managed by cf-router) routes everything from `content.aitradepulse.com` to the correct backend.

```
User → content.aitradepulse.com:443
  ↓ Cloudflare
  ↓ cf-router nginx :6969
  ├── /api/py/* → http://127.0.0.1:8767/       (Python backend)
  └── /*  → http://127.0.0.1:3002             (Fastify Node.js server)
```

## Fastify Server (`src/index.ts`)

Entry point. Builds the Fastify instance, wires plugins, registers route modules, starts the server and Telegram bot.

### Startup sequence

1. **Config loading** — `src/config/env.ts` exports `getConfig()` reading `.env`
2. **Plugin registration** (in order):
   - `@fastify/cors` — CORS for cross-origin requests
   - `@fastify/formbody` — URL-encoded body parsing
   - `@fastify/cookie` — Cookie parsing/signing
   - `@fastify/rate-limit` — Global rate limiter (100 req/min)
   - Custom `asyncHandler` — wraps route handlers to catch async errors
3. **Route registration** (order matters — see Routes section below)
4. **SPA catch-all handlers**
5. **404/500 error handlers**
6. **Server listen** on port from `.env` (default 3002)
7. **Telegram bot init** — webhook mode (production) or polling (dev)

### Key files

| File | Purpose |
|------|---------|
| `src/index.ts` | Entry point, Fastify setup, route registration, bot launch |
| `src/config/env.ts` | Environment config (getConfig, getConfigForAdmin) |
| `src/config/database.ts` | Prisma client singleton |
| `src/config/redis.ts` | Redis client (rate limiting, caching) |
| `src/config/queue.ts` | BullMQ queue setup |

## Route Registration (`src/index.ts` lines 311–366)

Order is critical — Fastify evaluates routes in registration order.

```
311: /api/py/*  reverse-proxy to Python :8767    (fastify-http-proxy)
323: health check routes
324: webhook routes (Telegram bot)
325: adminRoutes — all /admin/* routes             (key: auth + SPA)
326: webRoutes — public routes (pages, auth, content, finance, chat, aliases)
328-335: @fastify/static for admin-ui/dist at /admin/
337-344: @fastify/static for public/ at /public/
346-359: @fastify/static admin-ui/dist/assets di /assets/ (single bundle)
360-364: agency, content-api, youtube-dashboard, ecosystem, analytics-api routes
361-365: test-only routes (NODE_ENV=test)
373-383: SPA fallback notFoundHandler — /admin/* & /app/* → admin-ui/dist/index.html
373-392: SPA fallback + 404 handler
392-409: 500 handler
```

### Why this order matters

| Rule | Why |
|------|-----|
| `/api/py/` proxy BEFORE `adminRoutes` | Admin EJS pages call `/api/py/*` — must resolve before any generic catch-all |
| `adminRoutes` BEFORE `@fastify/static` at `/admin/` | adminRoutes defines the SPA catch-all (`/admin/*`) and auth middleware. Static files registered after only serve assets. |
| `@fastify/static` plugins BEFORE SPA catch-all handlers | The `sendFile` decorator must be registered before the catch-all routes call it |
| SPA catch-alls AFTER `@fastify/static` | The static plugin's `wildcard: false` means it doesn't catch HTML5 History routes — the explicit `app.get('/admin/*', ...)` serves `index.html` for them |
| 404 handler LAST | setNotFoundHandler only catches routes that no `app.get`/`app.post` etc. matched |

## Route Modules

### `adminRoutes` — `src/routes/admin.ts`

The most complex module (~838 lines). Exports `adminRoutes(server)`.

**Structure:**
```
adminRoutes(server)
├── onRequest auth hook (lines 164–241)
│   └── verifies Basic auth or cookie-token for /admin/* paths
├── registerPricingRoutes(server)
├── registerPromptsRoutes(server)
├── registerContentToolsRoutes(server)
├── registerAnalyticsRoutes(server)
├── API endpoints:
│   ├── POST /admin/login — authenticate, set cookie token
│   ├── GET /admin/logout — clear cookie
│   ├── POST /admin/api/broadcast — send broadcast
│   ├── GET/POST /api/stats, /api/analytics, /api/users, etc.
│   ├── CRUD /api/pricing, /api/admin-prompts, /api/provider-costs
│   ├── /api/payment-settings — payment gateway config
│   └── /api/system/* — system management
├── Redirects:
│   ├── /admin/analytics → /admin/dashboard
│   ├── /admin/billing → /admin/pricing
│   └── /admin/broadcast → /admin/settings#broadcast
├── SPA catch-all: GET /admin/* (line 818–832)
│   ├── Path traversal protection
│   ├── Serve static assets from admin-ui/dist
│   └── Serve index.html for client-side routes
└── registerProviderCostRoutes(server)
```

### `webRoutes` — `src/routes/web.ts`

Aggregates 7 sub-modules for public-facing routes:

| Module | File | Routes |
|--------|------|--------|
| `pageRoutes` | `web/pages.ts` | `/`, `/faq`, `/terms`, `/privacy`, static files, PWA manifest |
| `authRoutes` | `web/auth.ts` | `POST /auth/telegram` — Telegram auth |
| `userRoutes` | `web/user.ts` | `/api/user/*`, `/api/user/videos`, `/api/video/:jobId` |
| `contentRoutes` | `web/content.ts` | Storyboard, video create/analyze, images, downloads |
| `financeRoutes` | `web/finance.ts` | Packages, payments, transactions, referral, p2p, subscriptions |
| `chatRoutes` | `web/chat.ts` | `/api/chat/landing` |
| `aliasRoutes` | `web/aliases.ts` | `/api/v1/*` redirects |

### Other route modules

| Module | File | Prefix/Notes |
|--------|------|-------------|
| `healthCheckRoutes` | `src/routes/health.ts` | `/health` |
| `webhookRoutes` | `src/routes/webhook.ts` | Telegram webhook |
| `agencyRoutes` | `src/routes/agency.ts` | Prefix `/api` |
| `contentApiRoutes` | `src/routes/content-api.ts` | |
| `youtubeDashboardRoutes` | `src/routes/youtube-dashboard.ts` | |
| `ecosystemRoutes` | `src/routes/ecosystem.ts` | |
| `analyticsRoutes` | `src/routes/analytics-api.ts` | |

## Python Backend (`services/api.py`)

FastAPI server on port 8767. Proxied via nginx at `/api/py/*` → `http://127.0.0.1:8767/`.

**Key endpoint groups:**
- `/research/generate-book` — SSE-streamed book generation
- `/bookshelf/generate` — Bookshelf pipeline generation (blocking POST)
- `/loop/video/{filename}` — Serves generated video files
- `/download/*` — TikTok/YouTube downloaders
- `/media/*` — Image/media processing

## React SPAs

### Admin SPA (`admin-ui/`)

| Config | Value |
|--------|-------|
| **Vite base** | `/` (tanpa basename) |
| **Build output** | `admin-ui/dist/` |
| **Router** | AdminApp di `src/App.tsx` (relatif, tanpa basename) |
| **Assets URL** | `/assets/*` |
| **Static file serving** | `@fastify/static` at `/admin/` + `/assets/` dari `admin-ui/dist`; SPA fallback notFoundHandler |

Served by:
1. `@fastify/static` — serves `/admin/*` & `/assets/*` (JS, CSS, dll) dari `admin-ui/dist` — registered at `index.ts:328-335` & `346-359`
2. `setNotFoundHandler` SPA fallback — serves `admin-ui/dist/index.html` untuk `/admin/*` & `/app/*` (index.ts:373-383)

### Consolidated SPA (`admin-ui/`)

| Config | Value |
|--------|-------|
| **Build output** | `admin-ui/dist/` |
| **Vite base** | `/` (tanpa basename) |
| **Router** | `src/main.tsx`: `/`→Landing, `/admin/*`→AdminApp, `/app/*`→CustomerApp |
| **Served at** | `/` + `/admin/*` + `/app/*` |

> Konsolidasi 2026-08-02: `customer-ui/` & `landing-ui/` dihapus; source digabung ke `admin-ui/src/{app,landing}`.

## nginx Reverse Proxy (`~/.cloudflare-router/nginx/sites/app_content.conf`)

Generated by cf-router. Listens on port 6969 for `content.aitradepulse.com`.

```
location /api/py/ {
    proxy_pass http://127.0.0.1:8767/;      # trailing slash strips /api/py prefix
    proxy_read_timeout 600s;                  # long timeout for LLM generation
    client_max_body_size 100m;                # large uploads for media processing
}

location / {
    proxy_pass http://127.0.0.1:3002;         # Fastify server
    # Maintenance mode check
}
```

## Data Flow: Request Lifecycle

```
1. User visits /admin/dashboard
2. DNS resolves content.aitradepulse.com → Cloudflare → cf-router nginx :6969
3. nginx matches location / → proxy_pass http://127.0.0.1:3002
4. Fastify @fastify/static at /admin/ checks: is it a known static file?
   → No (dashboard is not a file in admin-ui/dist root)
5. Fastify adminRoutes onRequest auth hook fires:
   → url = /admin/dashboard
   → isAdminRoute = true (matches catch-all)
   → verifyAdmin() checks: cookie token exists and is valid?
       → No → 401 Unauthorized (or redirect to login)
6. If authenticated: SPA catch-all at /admin/* → reply.sendFile("index.html")
7. React Router reads basename=/admin, pathname=/dashboard → renders Dashboard component
8. Dashboard component fetches /api/stats?...
9. Fastify matches GET /api/stats route → auth hook fires again (startsWith /api/stats)
   → authenticated → handler returns JSON
```

## Database (Prisma/PostgreSQL)

Prisma schema at `prisma/schema.prisma`. Key models:
- **User** — telegramId, username, credits, role, subscription
- **Video** — user association, status, prompts, output URLs
- **Transaction** — credit purchases, referral payments
- **Payment** — payment gateway records
- **AdminConfig** — key-value config store
- **Prompt/PromptHistory** — saved prompts
- **TokenTracker** — per-user token consumption

## Telegram Bot Integration

The bot (grammY) handles:
- `/start` → user registration in webhook/polling mode
- Credit top-up (connected to payment gateways: Midtrans, Tripay, Duitku)
- Content creation commands
- Admin alerts on errors

In production: webhook mode — Telegram calls `{WEBHOOK_URL}/webhook/telegram`
In dev: long polling mode — `bot.launch()`