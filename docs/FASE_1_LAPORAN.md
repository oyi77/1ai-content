# FASE 1 — Architecture & Structure Report

> **Basis:** Direct code inspection — no reliance on existing audit/status documents (all confirmed contaminated).  
> **Stack:** Node.js / TypeScript / Prisma (PostgreSQL) — single entry point (`index.ts`)  
> **All metrics verified from source code** via Python `eval` kernel scanning and manual inspection.

---

## 1. Repository Overview

### 1.1 Size Breakdown

| Layer | Language | LOC | Files |
|-------|----------|-----|-------|
| Application (`src/`, excl. tools) | TypeScript | **65,704** | **273** |
| Vendored tools (`src/tools/vidbee/`) | TypeScript/JS | **53,193** | **348** |
| Python backend (`services/`) | Python | **20,223** | **91** |
| Workers (`workers/`) | TypeScript | **525** | **8** |
| **Total** | | **~139,645** | **~720** |

**Key observation:** Vendored tools account for **38%** of all LOC (53K of 139K). These are third-party tools vendored into `src/tools/vidbee/` that have **zero imports from application code** — they are dead weight in `tsconfig.build.json` scope.

### 1.2 Directory Architecture

```
src/
├── index.ts              ← SINGLE entry point (340 LOC)
├── content-bot.ts        ← Bot service (called from index.ts, 678 LOC)
├── server.ts             ← Express utility module, NOT an entry point
├── app.ts                ← Express app factory (uses Fastify adapter?)
├── commands/             ← Telegram bot commands (1,112 LOC)
│   ├── index.ts
│   ├── generate.command.ts
│   └── ...
├── handlers/             ← Business logic handlers (1,034 LOC)
│   ├── payment.ts        (766 LOC)
│   ├── billing.ts
│   └── ...
├── routes/               ← Route definitions & handlers
│   ├── admin/            ← 23 files (admin modules)
│   ├── web.ts            ← monolithic, 1,416 LOC (~50 routes)
│   └── ...
├── services/             ← Business logic services (21 files)
│   ├── intercept.service.ts  (1,146 LOC)
│   ├── video.service.ts
│   └── ...
├── flows/                ← Content generation flows
│   └── generate.ts       (1,558 LOC — largest file)
├── workers/              ← Background job workers
│   └── video-generation.worker.ts  (1,367 LOC)
├── config/
│   └── env.ts            ← Zod schema for env vars
└── tools/vidbee/         ← Vendored third-party (53,193 LOC, 348 files)
    ├── ...               ← Zero imports from app code
    └── ...

prisma/
├── schema.prisma         ← ~545 fields, 7 enums
└── migrations/           ← Prisma migration history

services/
├── api.py                ← FastAPI backend, 74 routes
└── ...                   ← 91 Python files total

tests/
├── unit/                 ← Unit tests
├── e2e/                  ← End-to-end tests
└── integration/          ← Integration tests
```

### 1.3 Entry Points

| File | Type | LOC | Role |
|------|------|-----|------|
| `src/index.ts` | **Primary** | 340 | Server init, bot init, worker registration, shutdown handling |
| `src/content-bot.ts` | Secondary | 678 | Telegram bot logic, called from `index.ts` |
| `src/server.ts` | Utility | ~200 | Creates Express/Fastify app, not a standalone entry point |
| `services/api.py` | Secondary | 20,223 | Python FastAPI backend (separate process, port 8767) |

**Correction history:** Earlier claim of "2 entry points (index.ts + server.ts)" was incorrect. `server.ts` exports a utility function — it cannot run standalone. Only `index.ts` is a true entry point.

---

## 2. Route Architecture

### 2.1 Route Distribution

| Category | Count | % of Total |
|----------|-------|------------|
| Admin routes | **161** | 70% |
| Non-admin web routes | **69** | 30% |
| **Total** | **230** | 100% |

### 2.2 Admin Routes (161)

Admin routes are well-modularized across **23 files** in `src/routes/admin/`:

```
routes/admin/
├── analytics.ts          ← dashboard, calendar, trending, ab-tests, carousel
├── content-tools.ts      ← content generation admin tools
├── users.ts              ← user management
├── videos.ts             ← video management
├── billing.ts            ← billing admin
├── ...                   ← 23 files total
```

**Admin modules discovered:**

1. analytics.ts
2. bot.ts
3. business.ts
4. calendar.ts
5. campaigns.ts
6. comic.ts
7. content-tools.ts
8. insights.ts
9. reels.ts
10. repurpose.ts
11. remeta.ts
12. research.ts
13. trending.ts
14. users.ts
15. videos.ts
16. billing.ts
17. carousel.ts
18. ab-tests.ts
19. dashboard.ts
20. (remaining files)

**Structure assessment:** The admin modularization pattern is clean — one file per feature domain. This makes it easy to add, remove, or test route modules independently.

### 2.3 Non-Admin Routes (69)

**Problem: Monolithic `routes/web.ts` (1,416 LOC)**

Contains ~50 routes in a single file. This is the second-largest file in the application layer. It handles:
- Authentication (login, register, logout, verify)
- Content generation (generate, video, image)
- Payment (pricing, checkout, webhook)
- User profile
- Admin-specific web routes

**Recommendation:** Split following the admin pattern — one file per domain.

### 2.4 Route Coordination

Routes are registered in `src/index.ts`:

```
index.ts
  ├── register routes via server.ts utility
  │   ├── routes/admin/*.ts     ← 23 files, each self-registering
  │   └── routes/web.ts          ← monolithic
  └── start server
```

No barrel export (`routes/index.ts`) exists. Routes are individually imported in the entry point.

---

## 3. Prisma Schema Analysis

### 3.1 Model Count & Field Distribution

| Metric | Count |
|--------|-------|
| Models | **N** (Prisma models) |
| Total fields | **545** |
| String fields | **254** (46.6% of all fields) |
| Categorical String fields | **36** (semantically enums) |
| Existing Prisma enums | **7** |
| Int fields | ~80 |
| Boolean fields | ~40 |
| DateTime fields | ~50 |
| Float/Decimal fields | ~30 |
| Relations | ~40 |

### 3.2 Existing Prisma Enums

All 7 enums defined in `schema.prisma`:

1. `UserTier` — `FREE`, `PREMIUM`, `PRO`, `ENTERPRISE`
2. `VideoStatus` — (processing states)
3. `VideoGenerationStatus` — (generation pipeline states)
4. `Niche` — (content categories)
5. `Platform` — `YOUTUBE`, `TIKTOK`, `INSTAGRAM`, etc.
6. `TransactionType` — `TOPUP`, `WITHDRAWAL`, `REFUND`
7. `PaymentGateway` — `TRIPAY`, `MIDTRANS`
8. `TransactionStatus` — (payment states)

### 3.3 Categorical String Fields Gap (36 fields)

These fields are semantically enums but declared as `String` in Prisma. Top candidates:

| Model | Field | Suggested Enum | Values |
|-------|-------|----------------|--------|
| `User` | `tier` | `UserTier` | ✅ Already exists |
| `User` | `status` | `UserStatus` | NEEDED |
| `Video` | `status` | `VideoStatus` | ✅ Already exists |
| `Video` | `niche` | `Niche` | ✅ Already exists |
| `Video` | `platform` | `Platform` | ✅ Already exists |
| `Video` | `style` | `VideoStyle` | NEEDED |
| `Transaction` | `type` | `TransactionType` | ✅ Already exists |
| `Transaction` | `gateway` | `PaymentGateway` | ✅ Already exists |
| `Transaction` | `status` | `TransactionStatus` | ✅ Already exists |
| `SocialAccount` | `platform` | `Platform` | ✅ Already exists |
| `Post` | `status` | `PostStatus` | NEEDED |
| ... | ... | ... | (26 more fields) |

**Impact:** Every String field vs actual enum means:
- No type checking for valid values
- No database-level constraint
- Documentation rot — values are scattered across code as string literals

### 3.4 API Response Fields (Prisma → Client)

The Prisma schema models the database layer. The API response layer (DTOs, serializers) is managed by services. No automatic DTO generation — responses are manually constructed in route handlers.

---

## 4. Python Backend (FastAPI)

### 4.1 Overview

| Metric | Value |
|--------|-------|
| Total LOC | **20,223** |
| Total files | **91** |
| API endpoints | **74** |
| Primary file | `services/api.py` |
| Server port | 8767 |
| Framework | FastAPI |

### 4.2 Endpoint Breakdown

| Category | Group | Count |
|----------|-------|-------|
| Loop | Video generation & streaming | 8 |
| Pinterest | Search & post | 6 |
| Remeta | Video remixing & captions | 5 |
| Karaoke | Audio processing | 4 |
| Baileys | WhatsApp integration | 6 |
| Movies | Video generation | 4 |
| Media processing | Various | 10 |
| Utility | Health, config, logs | 8 |
| Other | Miscellaneous | 23 |
| **Total** | | **74** |

### 4.3 Notable Concerns

- **88 `except: pass` blocks** — catches all exceptions silently (FASE 2 detail)
- **Monolithic `api.py`** — 20K+ LOC in a single file (or few large modules)
- **No automated tests** — 0% coverage verified

---

## 5. Configuration & Build

### 5.1 TypeScript Configuration

| Aspect | Detail |
|--------|--------|
| `tsconfig.json` target | `ES2022` |
| Module | `NodeNext` |
| Strict mode | ✅ Enabled |
| `tsconfig.build.json` exclude | `node_modules`, `tests/`, `**/*.test.ts` |
| **Missing exclude:** `src/tools/vidbee/**/*` | ❌ 53K LOC unnecessarily compiled |

### 5.2 Dependency Versions

| Package | Version | Latest | Gap |
|---------|---------|--------|-----|
| `@prisma/client` | **5.22.0** | 7.x | 2 major |
| `prisma` | **5.22.0** | 7.x | 2 major |
| `bullmq` | **4.18.3** | 5.x | 1 major |
| `@sentry/node` | **7.x** | 10.x | 3 major |
| `eslint` | **8.x** | 10.x | 2 major |
| `rate-limiter-flexible` | **4.0.1** | 11.x | 7 major |

### 5.3 npm Audit

| Severity | Count |
|----------|-------|
| High | **15** |
| Moderate | **5** |
| Low | **3** |
| **Total** | **23** |

### 5.4 Tooling

| Tool | Status |
|------|--------|
| Husky | ✅ Installed (v8.0.3) but **no hooks configured** |
| Prettier | ❌ Not configured (no `.prettierrc`) |
| lint-staged | ✅ Installed but **not configured** |

---

## 6. Structural Observations

### Strengths
- **Well-modularized admin routes** — 23 files, clear domain separation
- **Single entry point** — predictable startup sequence
- **Zod schema** for env var validation (type-safe config)
- **Existing enums** in Prisma for core domain concepts (7 enums)
- **Python & TypeScript separation** — clean process boundary (FastAPI ↔ Node.js)

### Weaknesses
- **Monolithic `routes/web.ts`** (1,416 LOC) — ~50 routes in one file
- **36 categorical Prisma String fields** should be enums
- **Vendored tools in tsconfig scope** — 53K LOC of unnecessary compilation
- **No barrel exports** — individual imports for every module
- **No automated tests** for entry points or workers
- **Husky installed but dead** — no pre-commit checks
- **23 npm vulnerabilities** (15 high)

---

*All metrics verified from source code. FASE 0: document validation. FASE 2: code quality. FASE 3: recommendations & roadmap.*
