# 🏗️ STACK CONTENT INTEGRATION PLAN
## Integrating Open-Source Video Tools into 1AI-Content Factory

**Date:** 22 June 2026
**Status:** Planning → Implementation

---

## 📋 EXECUTIVE SUMMARY

Integrate 5 open-source video tools into the existing 1AI-Content Telegram bot SaaS to create the most comprehensive AI content factory on the market.

### Tools

| Tool | Role | Stars | Language | Integration Type |
|------|------|-------|----------|-----------------|
| **ViMax** | Agentic video generation (Director/Screenwriter/Producer) | 10.5k | Python | Python microservice |
| **VidBee** | Video downloading from any website | 9.5k | TypeScript | NPM dependency + API wrapper |
| **OpenCut** | Video editor (CapCut alternative) | 58.7k | TypeScript | Future web editor embed |
| **Open-Sora** | AI video generation (text-to-video) | 29.1k | Python | Python microservice |
| **OpenMontage** | Agentic video production (12 pipelines, 52 tools) | 9.4k | TS/JS | Skill library integration |

---

## 🎯 INTEGRATION ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                    TELEGRAM BOT (Telegraf)                        │
│                    Node.js + TypeScript                           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    1AI-CONTENT ENGINE                             │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ VIDEO GEN    │  │ VIDEO EDIT  │  │ VIDEO PRODUCTION         │  │
│  │              │  │             │  │                          │  │
│  │ • GeminiGen  │  │ • FFmpeg    │  │ • Storyboard             │  │
│  │ • BytePlus   │  │ • OpenCut*  │  │ • Montage Pipeline       │  │
│  │ • Open-Sora ▲│  │ • VidBee  ▲│  │ • ViMax Agent ▲          │  │
│  │ • ViMax    ▲│  │             │  │ • OpenMontage ▲          │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬──────────────┘  │
│         │                │                       │                 │
│         ▼                ▼                       ▼                 │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │              POST-PROCESSING PIPELINE                        │  │
│  │  watermark → trim → overlay → audio mix → export            │  │
│  └─────────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ▲ = NEW integration                                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PYTHON SERVICES (FastAPI)                       │
│                                                                   │
│  vimax_service.py     — ViMax agent runtime (port 8770)          │
│  opensora_service.py  — Open-Sora inference (port 8771)          │
│  vidbee_service.py    — Video download API (port 8772)           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📐 PHASE BREAKDOWN

### Phase 1: VidBee Integration (Video Sourcing)
**Goal:** Enable users to download/source videos from any website for remixing, cloning, and reference.

**What:**
- Clone VidBee, extract core download logic
- Wrap as Python FastAPI service on port 8772
- Add `/download <url>` Telegram command
- Add `video_download.service.ts` in TypeScript
- Store downloaded videos in existing video pipeline

**Files to create:**
- `services/vidbee/service.py` — FastAPI wrapper
- `src/services/video-download.service.ts` — TS client
- `src/commands/download.ts` — Telegram command
- `src/handlers/callbacks/download.ts` — Callback handler

**Dependencies:**
- yt-dlp (already installed for channel analyzer)
- VidBee core extraction

---

### Phase 2: Open-Sora Integration (AI Video Generation)
**Goal:** Add text-to-video and image-to-video generation via open-source model.

**What:**
- Clone Open-Sora, set up inference service
- Wrap as Python FastAPI service on port 8771
- Add as Provider #10 in the 9-tier fallback chain
- Add `/sora <prompt>` command for direct Open-Sora generation
- Add `OPEN_SORA_ENABLED` and `OPEN_SORA_API_URL` env vars

**Files to create:**
- `services/opensora/service.py` — FastAPI wrapper
- `src/services/open-sora.service.ts` — TS client
- Modify `src/services/video-generation.service.ts` — Add provider
- Modify `src/config/hpas-engine.ts` — Add Open-Sora preset

**Dependencies:**
- PyTorch + CUDA (RTX 2060 SUPER available)
- Open-Sora model weights

---

### Phase 3: ViMax Integration (Agentic Video Generation)
**Goal:** AI Director/Screenwriter/Producer that generates complete videos from ideas.

**What:**
- Clone ViMax, extract agent runtime
- Wrap as Python FastAPI service on port 8770
- Add `/vimax <idea>` command — generates full video from concept
- Add `/script <topic>` command — generates video script
- Integrate with existing storyboard pipeline

**Files to create:**
- `services/vimax/service.py` — FastAPI wrapper
- `src/services/vimax.service.ts` — TS client
- `src/commands/vimax.ts` — Telegram commands

**Dependencies:**
- ViMax agent runtime
- LLM API keys (OpenAI/Anthropic for agent reasoning)

---

### Phase 4: OpenMontage Integration (Production Pipelines)
**Goal:** 12 production pipelines, 52 tools, 500+ agent skills for professional video production.

**What:**
- Extract pipeline definitions from OpenMontage
- Port key pipelines to TypeScript services
- Add `/montage <pipeline>` command
- Integrate Remotion composer for programmatic video

**Files to create:**
- `src/services/montage.service.ts` — Pipeline orchestrator
- `src/commands/montage.ts` — Telegram commands
- `src/config/montage-pipelines.ts` — Pipeline definitions

**Dependencies:**
- Remotion (already in stack)
- FFmpeg (already installed)

---

### Phase 5: OpenCut Integration (Video Editor)
**Goal:** Web-based video editor accessible from Telegram.

**What:**
- Deploy OpenCut as separate web service
- Add deep-link from Telegram to editor: `/edit <video_id>`
- Future: embed editor in Telegram Web App

**Files to create:**
- `src/commands/edit.ts` — Launch editor
- `src/routes/editor.ts` — Editor proxy routes

**Dependencies:**
- OpenCut web app deployment

---

## 🔧 ENVIRONMENT VARIABLES (New)

```env
# Stack Content Integrations
VIDBEE_ENABLED=true
VIDBEE_API_URL=http://localhost:8772

OPEN_SORA_ENABLED=false  # GPU-intensive, enable when ready
OPEN_SORA_API_URL=http://localhost:8771

VIMAX_ENABLED=false  # Requires LLM API keys
VIMAX_API_URL=http://localhost:8770
VIMAX_LLM_PROVIDER=openai

MONTAGE_ENABLED=true
OPENCUT_URL=https://new.opencut.app
```

---

## 📊 CREDIT COSTS (Proposed)

| Feature | Credits | Notes |
|---------|---------|-------|
| `/download <url>` | 0.5 | Free sourcing, charge for processing |
| `/sora <prompt>` (5s) | 3.0 | GPU-intensive |
| `/sora <prompt>` (10s) | 5.0 | GPU-intensive |
| `/vimax <idea>` | 4.0 | Full agent pipeline |
| `/script <topic>` | 1.0 | Script generation only |
| `/montage <pipeline>` | 2.0-8.0 | Depends on pipeline |
| `/edit <video>` | 0 | Free editor access |

---

## ✅ SUCCESS CRITERIA

1. User can `/download https://tiktok.com/...` → get video file
2. User can `/sora cat playing piano` → get AI-generated video
3. User can `/vimax motivational video about success` → get complete video
4. User can `/montage cinematic` → get production-quality video
5. All features integrated into credit system
6. All features accessible via Telegram bot commands
7. Admin can enable/disable each integration

---

## 🚨 RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|------|--------|------------|
| Open-Sora needs GPU | High | Make optional, use cloud GPU fallback |
| ViMax needs LLM API | Medium | Use existing LLM providers in config |
| VidBee may break on site changes | Low | yt-dlp community maintains extractors |
| OpenCut not yet production-ready | Low | Phase 5 is future, use classic version |
| Server resources | High | Monitor RAM/CPU, add swap if needed |

---

**Next:** Implement Phase 1 (VidBee) → Phase 2 (Open-Sora) → Phase 3 (ViMax)
