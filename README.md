# 🤖 OpenClaw Bot

[![Version](https://img.shields.io/badge/version-3.0.0-blue.svg)](CHANGELOG.md)
[![License](https://img.shields.io/badge/license-PROPRIETARY-red.svg)](LICENSE)

> **AI Video Marketing SaaS Platform — Child Bot Architecture**

OpenClaw Bot adalah bot Telegram turunan yang terintegrasi dengan OpenClaw Core System untuk menyediakan layanan pembuatan video marketing AI secara otomatis.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [Configuration](#configuration)
- [Deployment](#deployment)
- [Monitoring](#monitoring)
- [Contributing](#contributing)
- [Changelog](#changelog)
- [Support](#support)

---

## 🎯 Overview

OpenClaw Bot memungkinkan pengguna untuk:
- 🎬 Generate video marketing dari foto produk
- 💰 Top-up kredit dengan multiple payment gateway
- 👥 Sistem referral & affiliate 2-tier
- 📊 Dashboard analytics untuk tracking performa
- 🎨 Multi-angle creative generation
- 🔗 Direct publish ke social media

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 20 LTS |
| **Framework** | Telegraf.js + Fastify |
| **Database** | PostgreSQL 15 (Primary-Replica) |
| **Cache** | Redis Cluster 7.x |
| **Queue** | BullMQ |
| **Storage** | AWS S3 / Cloudflare R2 |
| **AI Pipeline** | GeminiGen.ai API |
| **Payment** | Midtrans (primary) + Tripay (backup) |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TELEGRAM PLATFORM                        │
└───────────────────────┬─────────────────────────────────────┘
                        │ Webhook
┌───────────────────────▼─────────────────────────────────────┐
│                   OPENCLAW BOT                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Bot Core  │  │   Queue     │  │   State Manager     │  │
│  │   (Node.js) │  │   (BullMQ)  │  │   (Redis)           │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
┌───────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐
│  PostgreSQL  │ │    Redis    │ │   S3 CDN   │
│  (User Data) │ │  (Session)  │ │  (Assets)  │
└──────────────┘ └─────────────┘ └────────────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                   OPENCLAW CORE                             │
│         (Parent System - API Integration)                   │
└─────────────────────────────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│                 EBOOK SERVICE (FastAPI)                     │
│     Sibling `ebook/` directory - port 8765                  │
│  AI-powered ebook generation: outline → manuscript → QA   │
│  → cover → export (DOCX/PDF)                                │
└─────────────────────────────────────────────────────────────┘
```

### Ebook Generation Service

The `/ebook` Telegram command is handled by `src/commands/ebook.ts` and `src/services/ebook.service.ts`.
It calls the **sibling `ebook/` FastAPI service** (default `http://localhost:8765`).

| Env Var | Default | Purpose |
|---------|---------|---------|
| `EBOOK_API_URL` | `http://localhost:8765` | Base URL of ebook FastAPI service |
| `EBOOK_API_KEY` | (empty) | Optional authentication key |

To start the ebook service alongside the bot, see `services/ebook/AGENTS.md`. Entry point: `EbookContentGenerator` (`services/ebook/generator.py`), diregistrasi di `services/api.py` (port 8767; `api_port=8765` di `services/ebook/config.py`).

Atau jalankan service `ebook` pada root `docker-compose.yml`.

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Telegram Bot Token

### Installation

```bash
# Clone repository
git clone https://github.com/openclaw/bot.git
cd openclaw-bot

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your configuration

# Run migrations
npm run migrate:dev

# Start development
npm run dev

# Start production
npm run start
```

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md) | System architecture & design patterns |
| [02-ROUTES.md](docs/02-ROUTES.md) | API & bot routes |
| [03-SECURITY.md](docs/03-SECURITY.md) | Security policies & procedures |
| [04-FRONTEND.md](docs/04-FRONTEND.md) | Frontend SaaS (Vue SPAs) |
| [05-TESTING.md](docs/05-TESTING.md) | Testing conventions |
| [06-EXECUTION.md](docs/06-EXECUTION.md) | Deployment guides & CI/CD |
| [AGENTS.md](docs/AGENTS.md) | Docs conventions |

---

## ⚙️ Configuration

### Environment Variables

See [`.env.example`](.env.example) for complete configuration.

```bash
# Core
NODE_ENV=production
BOT_TOKEN=your_telegram_bot_token
WEBHOOK_SECRET=your_webhook_secret
WEBHOOK_URL=https://api.openclaw.ai/webhook

# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/openclaw
REDIS_URL=redis://localhost:6379

# AI APIs
GEMINIGEN_API_KEY=xxx
KLING_API_KEY=xxx
RUNWAY_API_KEY=xxx

# Payment
MIDTRANS_SERVER_KEY=xxx
MIDTRANS_CLIENT_KEY=xxx
TRIPAY_API_KEY=xxx

# Storage
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
S3_BUCKET=openclaw-assets
```

### Feature Flags

Feature flags dapat dikonfigurasi via admin dashboard atau environment variables:

```bash
# Enable/disable features
FEATURE_MULTI_ANGLE=true
FEATURE_VOICE_CLONING=true
FEATURE_TEAM_WORKSPACE=false
```

---

## 🚢 Deployment

### Docker

```bash
# Build image
docker build -t openclaw-bot:latest .

# Run container
docker run -d \
  --name openclaw-bot \
  --env-file .env \
  -p 3000:3000 \
  openclaw-bot:latest
```

### Kubernetes

> Manifests `k8s/` belum tersedia di repo — deploy via Docker (di atas) atau PM2 (`ecosystem.config.js`).

See [docs/06-EXECUTION.md](docs/06-EXECUTION.md) for detailed deployment guides.

---

## 📊 Monitoring

### Health Checks

```bash
# Bot health
curl https://api.openclaw.ai/health

# Database health
curl https://api.openclaw.ai/health/db

# Queue status
curl https://api.openclaw.ai/health/queue
```

### Metrics

| Metric | Endpoint | Description |
|--------|----------|-------------|
| `bot_users_active` | `/metrics` | Active users (hourly) |
| `bot_videos_generated` | `/metrics` | Videos generated count |
| `bot_queue_depth` | `/metrics` | Current queue depth |
| `bot_error_rate` | `/metrics` | Error rate percentage |

### Alerts

Alerts dikirim ke Slack/Telegram saat:
- Payment failure rate > 10%
- AI API down > 2 minutes
- Error rate > 5%
- Queue depth > 100

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) untuk panduan kontribusi.

### Development Workflow

1. Fork repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Code Standards

- ESLint + Prettier
- Conventional Commits
- 80%+ test coverage
- Documentation required for new features

---

## 📝 Changelog

See [CHANGELOG.md](CHANGELOG.md) untuk riwayat perubahan lengkap.

### Latest Release: v3.0.0

**Major Changes:**
- ✅ Production-grade security hardening
- ✅ Circuit breaker patterns untuk external APIs
- ✅ Comprehensive monitoring & observability
- ✅ Disaster recovery procedures
- ✅ RBAC untuk admin functions
- ✅ Multi-tenant architecture support

---

## 🆘 Support

### Channels

| Channel | Link |
|---------|------|
| Documentation | [docs.openclaw.ai](https://docs.openclaw.ai) |
| Discord | [discord.gg/openclaw](https://discord.gg/openclaw) |
| Email | support@openclaw.ai |
| Telegram | [@openclaw_support](https://t.me/openclaw_support) |

### Emergency Contacts

- **Technical On-Call**: `+62-xxx-xxxx-xxxx`
- **Security Issues**: `security@openclaw.ai`

---

## 📄 License

This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

© 2024 OpenClaw. All rights reserved.

---

<p align="center">
  <strong>Made with ❤️ by OpenClaw Team</strong>
</p>
