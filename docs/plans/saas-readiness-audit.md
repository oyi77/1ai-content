# SaaS Readiness Audit — 1ai-content

Date: 2026-08-03 · Method: 4 parallel read-only scout agents (AuthAudit, EssentialDormouse, SmartChipmunk, GiantSkunk) + schema cross-reference (`prisma/schema.prisma`). Every claim below is grounded in the cited source location.

## Scorecard

| # | Dimension | Score | Verdict |
|---|-----------|-------|---------|
| 1 | User Auth (self-service) | 7/10 | Email/password + verify + forgot/reset implemented and wired to `/app` React UI. No Google OAuth (no `googleId` column, no `/auth/google*`). Landing `?register=1` CTAs dead. |
| 2 | Auth Security | 6/10 | bcrypt SALT_ROUNDS=10, `timingSafeCompare`, generic 401 (no user-enum leak), `isBanned` enforced. **No rate limiting on any self-service auth endpoint**; JWT in localStorage (XSS-exposed). |
| 3 | Multi-tenancy | 7/10 | Per-user isolation via `telegramId` FK across child models; email users get synthetic negative `telegramId`. No org/workspace model (acceptable for this product class). |
| 4 | Customer Dashboard | 6/10 | 12 pages behind `ProtectedRoute`, works end-to-end. Error states collapse to `alert()`/empty; `MyVideos.tsx` has no error state (misleads as "no videos"). |
| 5 | API Keys / Rate Limiting | 6/10 | API keys: SHA-256, `revokedAt`, tier-gated (agency-only), strict+soft middleware. Redis sliding-window limiters exist and are wired to 5 routes. Auth endpoints unprotected; buckets key on IP not user; `RATE_LIMIT_*` not env-driven. |
| 6 | Landing Page | 8/10 | Per-request serve, hardened OG/canonical, data-driven pricing with fallback, 18/18 e2e green. **Zero client-side pixels** (fbq/gtag/ttq absent) — conversion-only tracking. |
| 7 | Onboarding | 3/10 | **No customer-app onboarding / first-value flow.** Signup → empty dashboard. Schema slots (`selectedNiche`, `userMode`, `welcomeBonusUsed`) unused. Telegram-only flow. |
| 8 | Admin Panel | 9/10 | 3-mechanism auth guard, login rate limit (5/15min, Redis ip-keyed), server-rendered login, 89-spec e2e green. |

**Total: 52/80**

## Top-5 Gaps (severity-ranked)

### 1. BILLING — `/api/subscription/buy` is broken (HIGH)
`src/routes/web/finance.ts` subscription purchase builds a `packageId` that `PaymentService.createTransaction` rejects, and `createTransaction` (`src/services/payment.service.ts:103-199`) can never mint a `type:'subscription'` transaction — it hard-codes `type: 'topup'`. Result: the web path can never activate a subscription; only the Telegram bot path (direct Duitku, `src/commands/` subscription flow) can. Customers on the web can buy credit packs but never subscribe.

### 2. AUTH — No rate limiting on self-service auth endpoints (HIGH)
`register`, `login`, `forgot`, `reset` (`src/routes/web/auth-email.ts:35-225`) are unprotected — brute-force / credential-stuffing surface. Existing Redis limiters cover only admin login + a few content routes, and those bucket by `request.ip` (preHandler ordering means `request.user` isn't populated yet) — not truly per-user.

### 3. ONBOARDING — No first-value flow (MEDIUM)
Signup lands on an empty dashboard. No niche selection, no welcome-bonus wiring, no "create your first video" CTA. Schema already has `selectedNiche`/`userMode`/`welcomeBonusUsed` on `User` — unused.

### 4. LANDING — `?register=1` CTAs are dead (LOW)
`admin-ui/src/landing/App.tsx:107,136,259,324` link `/app/login?register=1`, but `LoginPage.tsx` only auto-switches on `verifyToken` — never reads `register=1`. Marketing CTAs land on the login form instead of registration.

### 5. DASHBOARD — Error handling collapses (LOW/MEDIUM)
`MyVideos.tsx`, `Billing.tsx`, `Subscriptions.tsx` swallow failures into `alert()` or empty render; `MyVideos.tsx` has no error state at all (network failure reads as "no videos"). `any` casts pervade these files (existing debt). JWT in localStorage is XSS-exfiltratable (flagged under Auth Security).

## Additional findings (lower priority)
- **No client-side marketing pixels** on landing (dim 6): env keys `FACEBOOK_PIXEL_ID`/`GA4_TRACKING_ID`/`TIKTOK_PIXEL_ID` are parsed (`src/config/env.ts:203-208`) and used only for server-side conversion (`services/analytics.service.ts:35-38`).
- **No Google OAuth** (dim 1): email/password only. `User` has no `googleId` column.
- **Hardcoded HMAC salt** `'openclaw-admin-v1'` in `src/routes/admin/auth.ts:16`; legacy Set-Cookie header variant omits HttpOnly (`auth.ts:96`; the `reply.setCookie` variant at :56-59 is fine).
- **OG/canonical hardcode production domain** (`admin-ui/index.html:12,15`) — not env-driven.
- **`RATE_LIMIT_*` limits are constants** (`src/routes/...limiter`), not env-configurable.
- **ViralScan FK anomaly** — some child model relations key on `uuid` vs `telegramId` (inconsistent tenancy join key).

## Build plan (next phases)
1. **Fix Auth** — wire `register=1` on LoginPage; add auth rate limiter; (deferred: Google OAuth).
2. **Fix Billing** — repair `/api/subscription/buy` to mint `type:'subscription'` transactions through the unified gateway; fail closed on missing webhook secret.
3. **Fix Onboarding** — first-value wizard (niche → welcome bonus → create-first-video CTA) persisting `selectedNiche`/`userMode`/`welcomeBonusUsed`.
4. **Fix Dashboard** — error-state hardening (MyVideos, Billing, Subscriptions); typed API error parsing.
5. **Verify** — smoke + jest + Playwright + builds; commit + push.
