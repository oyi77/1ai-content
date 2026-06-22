# CODEBASE.md — 1ai-content

> Auto-generated codebase memory for AI agents. Last updated: 2026-06-19.

## Purpose
AI Video Marketing SaaS platform ("OpenClaw Bot") delivered via Telegram. Generates marketing videos, images, and ebooks using a 9-tier AI provider fallback chain, with payment processing and multi-platform social media distribution.

## Tech Stack
- **Languages**: TypeScript (Node.js 20+), Python (ebook service)
- **Frameworks**: Telegraf (Telegram bot), Fastify (HTTP server), Prisma (ORM)
- **Runtime**: Node.js 20+, tsx for dev/production
- **Database**: PostgreSQL 15+, Redis 7+
- **Key Libraries**: telegraf, fastify, @prisma/client, bullmq, zod, ioredis, axios, winston, @sentry/node, @modelcontextprotocol/sdk

## Entry Points
- **Main**: `src/index.ts` — Bot + Fastify server startup
- **Bot**: Telegram webhook at `/webhook/telegram`
- **API**: Fastify HTTP server on port 3000
- **MCP**: `src/mcp/stdio.ts` — MCP protocol over STDIO
- **Ebook API**: `ebook/run_api.py` — Python FastAPI ebook service (port 8765)


## Key Files
| File | Purpose |
|------|---------|
| `src/index.ts` | App entry: bot initialization + Fastify server |
| `prisma/schema.prisma` | Database schema (24.9KB, full data model) |
| `config/ai.yml` | AI provider configuration (9-tier video, 5-tier image) |
| `config/features.yml` | Feature flags |
| `config/payment.yml` | Payment gateway config |
| `ebook/run_api.py` | Ebook generation FastAPI service |
| `ecosystem.config.js` | PM2 process config |
| `.env.example` | Complete environment variable reference |

## Architecture
Telegraf bot receives Telegram messages, routes through middleware (auth, rate limit, validation). Video/image generation uses BullMQ queues with 9-tier provider fallback and circuit breakers. Prisma ORM manages PostgreSQL data. Ebook generation runs as a sibling Python FastAPI service. Social media posting via PostBridge integration. Payments via Midtrans, Tripay, Duitku, NOWPayments, and Telegram Stars.

## Dependencies & Integration
- **External APIs**: 9 video providers (BytePlus, XAI, LaoZhang, EvoLink, Hypereal, SiliconFlow, Fal.ai, Kie, Remotion), 5 image providers (GeminiGen, NVIDIA, Replicate, Fal.ai, HuggingFace), OpenAI/Anthropic/Gemini for prompt optimization
- **Payment**: Midtrans, Tripay, Duitku, NOWPayments, Telegram Stars
- **Social**: PostBridge (Instagram, TikTok, YouTube, Facebook, Twitter, LinkedIn)
- **Internal**: Redis (queues + cache), PostgreSQL, Sentry, MCP protocol

## Run Commands
```bash
npm run dev              # Development with hot reload (tsx watch)
npm run build            # TypeScript compilation
npm run start            # Production start
npm run test             # Jest unit tests
npm run test:e2e         # E2E tests
npm run migrate:dev      # Run Prisma migrations (dev)
npm run db:seed          # Seed database
npm run lint             # ESLint
npm run format           # Prettier
cd ebook && python run_api.py  # Start ebook service
```

## Environment Variables
- `BOT_TOKEN`, `WEBHOOK_URL`, `DATABASE_URL`, `REDIS_URL`
- `BYTEPLUS_*`, `XAI_*`, `LAOZHANG_*`, `EVOLINK_*`, `HYPEREAL_*`, `SILICONFLOW_*`, `FALAI_*`, `KIE_*`
- `GEMINIGEN_*`, `NVIDIA_*`, `REPLICATE_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
- `MIDTRANS_*`, `TRIPAY_*`, `DUITKU_*`, `NOWPAYMENTS_API_KEY`
- `POSTBRIDGE_*`, `EBOOK_API_URL`, `LOG_LEVEL`
- `CIRCUIT_BREAKER_*`, `BULLMQ_CONCURRENCY`, feature flags (`ENABLE_*`)
