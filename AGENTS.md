<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-17 | Updated: 2026-05-17 -->

# 1ai-content

## Purpose
Telegram bot SaaS platform for AI-powered video generation. Built with TypeScript, Telegraf, Fastify, BullMQ, Prisma, and Redis. Users create short-form videos via a conversational bot interface with multi-provider AI generation, credit-based pricing, and an admin dashboard.

## Key Files

| File | Description |
|------|-------------|
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript config with `@/*` path alias to `src/*` |
| `Dockerfile` | Production container build |
| `docker-compose.yml` | Full stack: app, PostgreSQL, Redis, Prometheus, Grafana |
| `CLAUDE.md` | AI assistant instructions and project architecture guide |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | Application source code (see `src/AGENTS.md`) |
| `tests/` | Test suites (see `tests/AGENTS.md`) |
| `prisma/` | Database schema and migrations (see `prisma/AGENTS.md`) |
| `config/` | YAML reference configs (see `config/AGENTS.md`) |
| `scripts/` | DevOps scripts (see `scripts/AGENTS.md`) |
| `docs/` | Product documentation (see `docs/AGENTS.md`) |
| `monitoring/` | Prometheus + Grafana configs (see `monitoring/AGENTS.md`) |
| `ebook/` | AI ebook generator FastAPI service (sibling; port 8765) |

## Sibling Services

| Service | Entry | Bot Integration |
|---------|-------|-----------------|
| `ebook/` | `ebook/run_api.py` → uvicorn on port `8765` | `src/commands/ebook.ts` + `src/services/ebook.service.ts` |

Environment: `EBOOK_API_URL` (default `http://localhost:8765`), `EBOOK_API_KEY` (optional).

## For AI Agents

### Working In This Directory
- Use `@/*` path alias for all src imports (e.g. `@/services/user.service`)
- Critical env vars: `BOT_TOKEN`, `DATABASE_URL`, `REDIS_URL`, `ADMIN_PASSWORD`, `WEBHOOK_URL`, `WEBHOOK_SECRET`
- For local dev with polling: `FORCE_POLLING=true` and delete Telegram webhook first

### Testing Requirements
- `npm test` — unit + integration (Jest)
- `npm run test:e2e` — end-to-end
- `npm run typecheck` — TypeScript type checking

### Common Patterns
- Redis-backed per-user sessions (24h TTL)
- BullMQ for async video generation jobs
- 9-tier provider fallback with circuit breaker
- Multiple payment gateways (Midtrans, Tripay, DuitKu, NOWPayments)

## Dependencies

### External
- `telegraf` — Telegram bot framework
- `fastify` — HTTP server
- `bullmq` / `ioredis` — Job queues and Redis
- `@prisma/client` — Database ORM
- `typescript` / `tsx` — Language and dev runner

<!-- MANUAL: -->
