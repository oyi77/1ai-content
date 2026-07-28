# 02 — Route Map

## Route Registration Order (from `src/index.ts`)

Fastify evaluates routes in registration order. The sequence below is the authoritative list.

```
311  /api/py/*            → fastify-http-proxy to http://127.0.0.1:8767/
323  /health               → healthCheckRoutes
324  /webhook/telegram     → webhookRoutes (Telegram bot)
325  /admin(/...)          → adminRoutes         ← auth middleware here
326  / etc.                → webRoutes           ← public pages & API
329  /admin/assets/*       → @fastify/static (admin-ui/dist)
337  /public/*             → @fastify/static (public/)
347  /app/assets/*         → @fastify/static (customer-ui/dist)
355  /api/agency           → agencyRoutes
356  /api/content          → contentApiRoutes
357  /api/youtube          → youtubeDashboardRoutes
358  /api/ecosystem         → ecosystemRoutes
359  /api/analytics         → analyticsRoutes
361  (test routes if NODE_ENV=test)
370  /app/*                → Customer SPA catch-all
379  (setNotFoundHandler)  → 404 handler
392  (setErrorHandler)     → 500 handler
```

## Admin Routes (`src/routes/admin.ts`)

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/login` | Authenticate with password, set cookie token |
| GET | `/admin/logout` | Clear auth cookie, redirect to login |

### API Endpoints (inside adminRoutes)
All require auth (via `onRequest` hook).

| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/stats` | Dashboard statistics |
| GET/POST | `/api/analytics` | Analytics data |
| GET | `/api/analytics/dashboard` | Dashboard-specific analytics |
| GET/POST | `/api/users` | User management CRUD |
| GET | `/api/users/export` | Export users |
| GET/POST | `/api/transactions` | Transaction listing/management |
| GET/POST | `/api/videos` | Video content listing |
| GET/POST | `/api/broadcast` | Send broadcast to users |
| GET/POST | `/api/config` | System configuration |
| GET/POST | `/api/payment-settings` | Payment gateway config |
| GET/POST | `/api/pricing` | Pricing tiers |
| GET/PUT/DEL | `/api/admin-prompts/:id` | Admin prompt management |
| GET/POST | `/api/token-stats` | Token usage statistics |
| GET/POST | `/api/token-usage` | Detailed token usage |
| GET | `/api/profit-report` | Profit/loss reporting |
| GET/POST | `/api/settings/` | Per-user admin settings |
| GET/POST | `/api/niches` | Content niche management |
| GET/POST | `/api/personas` | Content persona management |
| GET/POST | `/api/admin/` | General admin API |
| GET/POST | `/api/admin-config` | Admin configuration |
| GET/POST | `/api/referral/` | Referral management |
| GET/POST | `/api/books` | Bookshelf books |
| GET/POST | `/api/comics` | Comic management |
| GET/POST | `/api/movies` | Movie generation |
| GET/POST | `/api/queue/queue` | Job queue management |
| GET/POST | `/api/subscriptions` | Subscription management |
| GET/POST | `/api/interceptions` | Ad interceptions |
| GET/POST | `/api/intercept/` | Intercept management |
| GET/POST | `/api/fanpages` | Fan page management |
| GET/POST | `/api/provider-costs` | AI provider cost management |
| GET/POST | `/api/system/*` | System management (not /health) |

### Redirects
| From | To | Purpose |
|------|----|---------|
| GET `/admin/analytics` | `/admin/dashboard` | Common mistaken path |
| GET `/admin/billing` | `/admin/pricing` | Legacy billing path |
| GET `/admin/broadcast` | `/admin/settings#broadcast` | Settings tab anchor |

### SPA Catch-all
| Method | Path | Behavior |
|--------|------|----------|
| GET | `/admin/*` | If file extension → serve static from `admin-ui/dist`. Otherwise → serve `index.html`. Path traversal protection applied. Auth checked via `onRequest`. |

## Web Routes (`src/routes/web.ts`)

### Page routes (`web/pages.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Landing page (EJS) |
| GET | `/faq` | FAQ page |
| GET | `/terms` | Terms of service |
| GET | `/privacy` | Privacy policy |
| GET | `/sw.js` | Service Worker |
| GET | `/manifest.json` | PWA manifest |
| GET | `/robots.txt` | Robots exclusion |
| GET | `/sitemap.xml` | Sitemap |

### Auth routes (`web/auth.ts`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/telegram` | Telegram login authentication |

### User routes (`web/user.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET/POST | `/api/user` | User CRUD |
| GET | `/api/user/me` | Current user profile |
| GET | `/api/user/videos` | User's video list |
| GET | `/api/user/history` | User activity history |
| GET | `/api/video/:jobId` | Video by job ID |
| GET | `/api/video/:jobId/download` | Video download URL |

### Content routes (`web/content.ts`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/storyboard` | Generate storyboard |
| POST | `/api/video/create` | Create video |
| POST | `/api/video/analyze` | Analyze video |
| POST | `/api/image/generate` | Generate image |
| GET | `/api/image/*` | Image serving |

### Finance routes (`web/finance.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/packages` | Available credit packages |
| POST | `/api/payment` | Initiate payment |
| GET | `/api/transactions` | User's transactions |
| POST | `/api/referral` | Referral code handling |
| GET/POST | `/api/p2p` | Peer-to-peer credit transfer |
| POST | `/api/subscriptions` | Subscription management |
| GET | `/payment/finish` | Payment completion page |

### Chat routes (`web/chat.ts`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat/landing` | Landing page chat |

### Alias routes (`web/aliases.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/*` | Redirects to current API paths |

## Python API Routes (`services/api.py`, port 8767)

Proxied via nginx at `/api/py/*`.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/py/research/generate-book` | POST | SSE-streamed book generation |
| `/api/py/bookshelf/generate` | POST | Bookshelf pipeline generation (blocking) |
| `/api/py/bookshelf/generate-book` | POST | Book generation (blocking) |
| `/api/py/loop/video/{filename}` | GET | Serve generated video file |
| `/api/py/download/tiktok` | POST | TikTok video/audio download |
| `/api/py/download/youtube` | POST | YouTube video download |
| `/api/py/download/youtube/mp3` | POST | YouTube audio extraction |
| `/api/py/download/instagram` | POST | Instagram media download |
| `/api/py/media/analyze` | POST | Media content analysis |
| `/api/py/captions/generate` | POST | Auto-caption generation |

## Other Route Modules

### Health (`src/routes/health.ts`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Server health check |

### Webhook (`src/routes/webhook.ts`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhook/telegram` | Telegram bot webhook |

### Test (`src/routes/test.ts`) — only in NODE_ENV=test
| Method | Path | Description |
|--------|------|-------------|
| GET | `/test/reset-rate-limit` | Reset rate limiter for tests |
| GET | `/test/health` | Test health check |

## Route Registration: How to Add

1. **Create the handler file** in `src/routes/` or `src/routes/<domain>/`
2. **Export an async function** that takes `server: FastifyInstance`
3. **Register in `src/index.ts`** with `await app.register(moduleName)` after the existing registrations
4. **For admin routes**: add the endpoint inside `adminRoutes()` in `src/routes/admin.ts`
5. **For admin API endpoints**: add the URL to the `isAdminRoute` list in the `onRequest` auth hook if it's not already covered by a `startsWith()` pattern

### Adding an Admin Route Example

```typescript
// src/routes/admin.ts — inside adminRoutes()
server.get("/api/my-new-feature", async (request, reply) => {
  return { data: "hello" };
});
```

No auth hook update needed if the path starts with `/api/` (the catch-all `startsWith("/api/")` at line 233 covers most API paths). If it's a new path pattern (e.g. `/admin/custom`), add to the `isAdminRoute` list.

### Adding a Public Route Example

```typescript
// src/routes/web/my-module.ts
import { FastifyInstance } from "fastify";

export async function myRoutes(server: FastifyInstance): Promise<void> {
  server.get("/api/public-endpoint", async (request, reply) => {
    return { public: true };
  });
}
```

```typescript
// src/routes/web.ts
import { myRoutes } from "./web/my-module";

export async function webRoutes(server: FastifyInstance): Promise<void> {
  await Promise.all([
    pageRoutes(server),
    // ...
    myRoutes(server),  // add here
  ]);
}
```