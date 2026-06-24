# 07 — Modularity Recommendations

## Current State Assessment

### ✅ What's Good

1. **Clear layer separation** — commands, handlers, services, routes, workers
2. **Config externalization** — Zod-validated env config
3. **Provider abstraction** — 9-tier fallback with circuit breaker
4. **Queue system** — BullMQ for async processing
5. **Database ORM** — Prisma with type safety

### ⚠️ Issues Found

#### 1. God Files (High Priority)

| File | Lines | Issue |
|------|-------|-------|
| `src/index.ts` | 446 | Too many responsibilities |
| `src/routes/admin.ts` | 300+ | All admin routes in one file |
| `src/flows/generate.ts` | 1400+ | Monolithic generation flow |

**Recommendation:** Split into smaller, focused modules.

#### 2. Hardcoded Values (High Priority)

49 instances of hardcoded localhost URLs in fallback patterns.

**Recommendation:** All URLs must come from config. No exceptions.

**Status:** ⏳ Being fixed by automated agent.

#### 3. Missing Test Coverage (High Priority)

15+ services with 0% coverage, including critical paths:
- `video-generation.service.ts` (30%)
- `payment.service.ts` (54%)
- All YouTube services (0%)
- All workers (0%)

**Recommendation:** Prioritize tests for payment and video generation.

#### 4. Inconsistent Error Handling (Medium Priority)

Some routes use try/catch, others don't. Some log errors, others swallow them.

**Recommendation:** Standardize error handling middleware.

#### 5. No API Versioning (Low Priority)

All routes at `/api/` without version prefix.

**Recommendation:** Add `/api/v1/` prefix for future compatibility.

## Proposed Modular Structure

```
src/
├── modules/
│   ├── video/
│   │   ├── commands.ts
│   │   ├── service.ts
│   │   ├── worker.ts
│   │   └── types.ts
│   ├── payment/
│   │   ├── commands.ts
│   │   ├── service.ts
│   │   ├── webhooks.ts
│   │   └── types.ts
│   ├── admin/
│   │   ├── routes/
│   │   │   ├── dashboard.ts
│   │   │   ├── users.ts
│   │   │   ├── pricing.ts
│   │   │   └── providers.ts
│   │   └── middleware.ts
│   └── ecosystem/
│       ├── routes.ts
│       ├── service.ts
│       └── types.ts
├── shared/
│   ├── database/
│   ├── redis/
│   ├── queue/
│   └── utils/
└── index.ts (thin entry point)
```

## Migration Plan

### Phase 1: Critical Fixes (1-2 days)
- [ ] Remove hardcoded URLs → config
- [ ] Add tests for payment service
- [ ] Add tests for video generation

### Phase 2: Structure (3-5 days)
- [ ] Split `src/index.ts` into route modules
- [ ] Extract admin routes into separate files
- [ ] Create shared error handling middleware

### Phase 3: Testing (1 week)
- [ ] Add integration tests for payment flows
- [ ] Add E2E tests for video generation
- [ ] Achieve 70% coverage on critical paths

### Phase 4: Documentation (2-3 days)
- [ ] Complete docs/ folder
- [ ] Add Mermaid diagrams
- [ ] Create llms.txt

## Design Principles to Follow

1. **Single Responsibility** — Each module does one thing
2. **Dependency Inversion** — Services depend on abstractions, not implementations
3. **Explicit Over Implicit** — No magic, clear interfaces
4. **Fail Fast** — Validate early, fail loudly
5. **Idempotency** — Payment and external operations must be safe to retry
