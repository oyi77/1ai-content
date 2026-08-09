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
│     Sibling `services/ebook/` directory - port 8767          │
│  AI-powered ebook generation: outline → manuscript → QA   │
│  → cover → export (DOCX/PDF)                                │
└─────────────────────────────────────────────────────────────┘
```

### Ebook Generation Service

The `/ebook` Telegram command is handled by `src/commands/ebook.ts` and `src/services/ebook.service.ts`.
It calls the **ebook generation service** in `services/ebook/` (absorbed into media-api; default `http://localhost:8767`).

| Env Var | Default | Purpose |
|---------|---------|---------|
| `EBOOK_API_URL` | `http://localhost:8767` | Base URL of ebook generator (media-api) |
| `EBOOK_API_KEY` | (empty) | Optional authentication key |

To start the ebook service alongside the bot, see `services/ebook/AGENTS.md`. Entry point: `EbookContentGenerator` (`services/ebook/generator.py`), diregistrasi di `services/api.py` (prefix `/text/ebook`, port 8767). Port standalone lama (8765/8501) sudah dihapus dari `docker-compose.yml` — `api_port`/`ui_port` di `services/ebook/config.py` dikomentari (LEGACY).

Ebook generation runs inside the media-api (`services/api.py`, port 8767) — no separate service in `docker-compose.yml`.

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
| [04-FRONTEND.md](docs/04-FRONTEND.md) | Frontend SaaS — React SPA `admin-ui/` (3 namespace: `/`, `/admin/*`, `/app/*`) |
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
WEBHOOK_URL=https://api-saas.aitradepulse.com/webhook/telegram

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/1ai_content
REDIS_URL=redis://localhost:6379

# AI APIs (9-tier video fallback + image + prompt AI — lihat .env.example)
GEMINIGEN_API_KEY=xxx
KLING_API_KEY=xxx
BYTEPLUS_API_KEY=xxx

# Payment
MIDTRANS_SERVER_KEY=xxx
MIDTRANS_CLIENT_KEY=xxx
TRIPAY_API_KEY=xxx

# Ecosystem
ECOSYSTEM_API_KEY=your_ecosystem_api_key_here
SOCIAL_SERVICE_URL=http://127.0.0.1:8200
AFFILIATE_SERVICE_URL=http://127.0.0.1:3001
TRACKING_URL=https://track.aitradepulse.com
```

### Feature Flags

Feature flags dapat dikonfigurasi via admin dashboard atau environment variables:

```bash
# Enable/disable features (didefinisikan di src/config/env.ts)
FEATURE_PAYMENT=true
FEATURE_REFERRAL=true
FEATURE_VIDEO_GENERATION=true
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
curl https://content.aitradepulse.com/health

# Database health (admin-protected)
curl https://content.aitradepulse.com/health/db

# Queue status (admin-protected)
curl https://content.aitradepulse.com/health/queue
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
| Documentation | [content.aitradepulse.com](https://content.aitradepulse.com) |
| Telegram Bot | [@vilona_content_bot](https://t.me/vilona_content_bot) |

### Emergency Contacts

- **Security Issues**: laporkan lewat Telegram bot di atas (bukan email publik).

---

## 📄 License

This project is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.

© 2026 1AI Content. All rights reserved.

---

<p align="center">
  <strong>Made with ❤️ by OpenClaw Team</strong>
</p>
