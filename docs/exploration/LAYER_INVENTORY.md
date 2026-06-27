# Layer Inventory — 1ai-content
## Date: 2026-06-26

| # | Layer | Technology | Entry Point | Test Suite |
|---|-------|------------|-------------|------------|
| 1 | Telegram Bot | Telegraf (Node.js/TS) | src/index.ts | tests/unit/ |
| 2 | Fastify HTTP Server | Fastify (Node.js/TS) | src/server.ts | — |
| 3 | Python API | FastAPI (Python) | services/api.py | — |
| 4 | PostgreSQL Database | Prisma ORM | prisma/schema.prisma | migrations |
| 5 | Redis / BullMQ | ioredis, bullmq | src/config/queue.ts | — |
| 6 | Carousel Service | Python + Pillow | services/carousel/ | — (NEW) |
| 7 | AutoPilot Service | Python | services/autopilot/ | — (NEW) |
| 8 | Calendar Service | Python (file-based) | services/calendar/ | — (NEW) |
| 9 | A/B Testing Service | Python (file-based) | services/ab_testing/ | — (NEW) |
| 10 | Trend Scanner | Python | services/trends/scanner.py | — |
| 11 | SEO Generator | Python | services/trends/seo_generator.py | — |
| 12 | Faceless Engine | Python | services/faceless/engine.py | — |
| 13 | CloakBrowser Adapter | Python (CDP) | services/cloakbrowser/ | — |
| 14 | TTS Engine | Python | services/tts/engine.py | — |
| 15 | Hybrid Publisher | Python | services/social/hybrid_publisher.py | — |
| 16 | Video Editor | FFmpeg (TS) | src/services/video-editor.service.ts | — |
| 17 | Image Generation | Multi-provider (TS) | src/services/image.service.ts | tests/unit/ |
| 18 | Social Publish | TS bridge | src/services/social-publish.service.ts | tests/unit/ |
| 19 | TikTok Automation Bridge | TS bridge | src/services/tiktok-automation.service.ts | — (NEW) |
| 20 | Nginx + CF Tunnel | Reverse proxy | ~/.cloudflare-router/ | cloudflare-router status |

### New Features Under QA
- Carousel: Layer 6 + 19 (Python generator/renderer/assembler → TS bridge → bot command)
- AutoPilot: Layer 7 + 19 (Python scheduler/publisher → TS bridge → bot command)
- Calendar: Layer 8 + 19 (Python CRUD → TS bridge → bot command)
- A/B Testing: Layer 9 + 19 (Python service → TS bridge → bot command)
- Trending: Layer 10 + 19 (Python scanner → TS bridge → bot command + dashboard)
