# 00 — Overview

## What is 1ai-content?

1ai-content is a Telegram bot SaaS platform for AI-powered video generation. Users create short-form videos via a conversational bot interface with multi-provider AI generation, credit-based pricing, and an admin dashboard.

## Who is it for?

- **UMKM (Small Businesses)** in Indonesia who need viral ad content
- **Content creators** who want automated video production
- **Agencies** managing multiple client accounts
- **Affiliate marketers** using CPA model

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Bot Framework | Telegraf | Telegram bot interface |
| HTTP Server | Fastify | Admin dashboard + API |
| Database | PostgreSQL + Prisma | Persistent storage |
| Queue | BullMQ + Redis | Async video generation |
| AI Providers | 9-tier fallback (Gemini, OpenAI, Grok, etc.) | Content generation |
| Payments | Midtrans, Tripay, DuitKu, NOWPayments | Indonesian + crypto payments |
| Monitoring | Prometheus + Grafana | Metrics + dashboards |

## Architecture Pattern

**Modular Monolith** with clear separation:

```
src/
├── commands/     → Telegram bot commands
├── handlers/     → Callback + message handlers
├── services/     → Business logic (82 files)
├── routes/       → HTTP API endpoints
├── workers/      → Background job processors
├── config/       → Configuration + validation
├── utils/        → Shared utilities
└── types/        → TypeScript type definitions
```

## Quick Start

```bash
# Install
npm install

# Configure
cp .env.example .env  # Edit with your keys

# Database
npx prisma migrate dev

# Run
npm run dev

# Test
npm test
```

## Related Projects

| Project | Role | Integration |
|---------|------|-------------|
| 1ai-social | Content distributor | Publishes to social platforms |
| 1ai-affiliate | Revenue monetizer | Tracks CPA conversions |

See [ECOSYSTEM_ARCHITECTURE.md](ECOSYSTEM_ARCHITECTURE.md) for integration details.
