# 1ai-content Documentation

This directory contains technical documentation for the 1ai-content codebase — a Fastify + React + EJS content factory platform.

## Document Index

| # | Document | Contents |
|---|----------|----------|
| 01 | [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) | Fastify server startup, route registration order, nginx proxy, React SPAs, data flow lifecycle |
| 02 | [02-ROUTES.md](./02-ROUTES.md) | Complete route map by domain, exact method/path tables, how-to-add section |
| 03 | [03-SECURITY.md](./03-SECURITY.md) | Auth architecture, cookie-token flow, `isAdminRoute` logic, path traversal defense layers, rate limiting |
| 04 | [04-FRONTEND.md](./04-FRONTEND.md) | React SPA structure, EJS layout system, design system, API client pattern |
| 05 | [05-TESTING.md](./05-TESTING.md) | Jest unit tests, Playwright E2E tests, test patterns, adding tests |
| 06 | [06-EXECUTION.md](./06-EXECUTION.md) | Dev setup, production deployment, debugging procedures, rollback, CI/CD |

## Directory Layout

```
docs/
├── 01-ARCHITECTURE.md     — System architecture
├── 02-ROUTES.md           — Route map
├── 03-SECURITY.md         — Security architecture
├── 04-FRONTEND.md         — Frontend architecture
├── 05-TESTING.md          — Test infrastructure
├── 06-EXECUTION.md        — Operations guide
├── README.md              — This file
├── archive/               — Superseded documents (historical reference)
├── quarantine/            — Documents under review (may be outdated or inaccurate)
└── plans/                 — Future implementation plans (empty)
```

## Recent Changes

- **2026-07-28**: Archived outdated planning docs to `archive/`; replaced with 6 new factual, code-anchored technical documents
- **2026-07-27**: Path refactor `/admin/react/` → `/admin/`; security fixes (auth regression, auth leak, path traversal); 90/90 Playwright E2E tests passing

## For New Contributors

Start with [01-ARCHITECTURE.md](./01-ARCHITECTURE.md) for system overview, then [02-ROUTES.md](./02-ROUTES.md) for the route map. For operations and debugging, see [06-EXECUTION.md](./06-EXECUTION.md).

## Archived Documents

Documents in `archive/` predate the current documentation set and are retained for historical context. They may contain stale path references, outdated architectural assumptions, or superseded design decisions. Do not treat them as authoritative. Key archived items:

- `saas-frontend-migration/` — Prior plan for React SPA migration (superseded by current state)
- `phase-4-qa-report.md` — QA findings from Phase 4 polish
- Service lifecycle / multi-provider gateway / plugin architecture docs — Aspirational designs, not implemented

## Quarantine

Documents in `quarantine/` are under review. They may contain errors or unverified claims. Cross-reference with authoritative source code before acting on their recommendations.