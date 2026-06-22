# 🎬 Vilona Content Factory — Complete Documentation

> AI-powered content creation platform accessible via Telegram bot `@vilonacontentbot`

**Last updated:** 2026-06-21

---

## 🚀 Quick Start

```
1. Open Telegram → search @vilonacontentbot
2. Send /start
3. Pick a command and start creating!
```

---

## 📋 All Commands (18)

### 🎬 Content Creation

| Command | Input | What it does | Time |
|---------|-------|-------------|------|
| `/clip <url>` | YouTube/TikTok URL | Auto-clip long video → 5 viral shorts with karaoke subtitles | 5-10 min |
| `/faceless <topic>` | Topic text | Generate faceless video (script + stock footage + TTS + captions) | 3-5 min |
| `/product <name> \| <desc> \| <harga>` | Product info | Generate e-commerce product video | 3-5 min |
| `/storyboard <desc>` | Description | Generate visual storyboard (4 scenes) | 2-3 min |

### 🎵 Audio Tools

| Command | Input | What it does | Time |
|---------|-------|-------------|------|
| `/suno <prompt>` | Music description | Generate AI music (Suno AI / FFmpeg fallback) | 1-2 min |
| `/voice <text>` | Text to speak | Generate voiceover (Edge TTS, ID/EN) | ~2s |
| `/music <prompt>` | Music description | Generate background music | ~5s |
| `/loop` | Upload audio file | Create looping video from audio | 1-3 min |

### 📊 Intelligence

| Command | Input | What it does | Time |
|---------|-------|-------------|------|
| `/analyze <url>` | YouTube/TikTok URL | Deep channel analysis + AI clone plan | 2-5 min |
| `/trends <niche>` | Niche keyword | Scan trending topics (YouTube, Google, Reddit) | 30-60s |

### 🤖 Automation

| Command | Input | What it does |
|---------|-------|-------------|
| `/autopilot start` | — | Auto-generate & publish 3 videos/day |
| `/autopilot stop` | — | Stop auto-pilot |
| `/autopilot status` | — | Check auto-pilot status |
| `/calendar` | — | View content calendar (30 days) |
| `/analytics` | — | View performance analytics |

### ⚙️ Management

| Command | Input | What it does |
|---------|-------|-------------|
| `/connect` | — | Connect social media account (API or browser) |
| `/accounts` | — | View connected accounts |
| `/brand <key> <value>` | Key + value | Set brand settings (name, colors, font) |
| `/publish` | — | Publish content to social media |

---

## 🔄 Complete Workflows

### Workflow 1: Clone a Channel

```
Step 1: /analyze https://youtube.com/@lofigirl
        → AI analyzes channel: hook patterns, content structure, viral triggers
        → Shows analysis report + Clone buttons

Step 2: [Tap: 📋 Clone 10 Video (ID)]
        → AI generates 10 video ideas based on real data
        → Criticism loop: AI critiques and refines each idea
        → Shows clone plan with hooks, titles, scripts

Step 3: /faceless <first video idea>
        → Generates faceless video with stock footage + TTS + captions
        → Sends video file

Step 4: [Tap: 📤 Publish ke TikTok]
        → Auto-publishes to connected TikTok account
```

### Workflow 2: Auto-Clip Long Video

```
Step 1: /clip https://youtube.com/watch?v=xxx
        → Downloads video
        → Whisper transcription (word-level)
        → AI detects 5 most viral moments
        → Extracts clips, reframes to 9:16
        → Adds karaoke subtitles + thumbnails
        → Sends all 5 clips

Step 2: [Tap: 📤 Publish ke Semua]
        → Publishes all clips to all connected platforms
```

### Workflow 3: Product Video

```
Step 1: /product Skincare Korea | Serum anti-aging premium | Rp 89.000
        → AI generates product video script
        → Stock footage + TTS + captions
        → Sends product video + SEO tags

Step 2: [Tap: 📤 Publish]
        → Auto-publishes with SEO-optimized caption
```

### Workflow 4: Full Auto-Pilot

```
Step 1: /connect → Connect TikTok + Instagram + YouTube accounts

Step 2: /autopilot start
        → Every 6 hours:
          1. Scan trending topics
          2. Generate 3 faceless videos
          3. Auto-publish to all platforms
          4. Report results to Telegram

Step 3: /analytics → Check performance
Step 4: /calendar → View scheduled content
```

---

## 🔌 Connect Accounts

### API Method (YouTube, X/Twitter)

```
/connect → [▶️ YouTube (API)]
→ Send OAuth2 access token
→ Done! Auto-publish via API

/connect → [🐦 X/Twitter (API)]
→ Send: api_key|api_secret|access_token|access_token_secret
→ Done! Auto-publish via API
```

### Browser Method (TikTok, Instagram, Facebook, LinkedIn, Threads)

```
/connect → [🎵 TikTok]
→ Open CloakBrowser: http://server:8090
→ Login manually (including 2FA)
→ Select profile in bot
→ Done! Session persists
```

---

## 🎨 Brand Settings

```
/brand name MyBrand
/brand tagline Making content easy
/brand color #FF6B35
/brand font modern
```

Applied automatically to all generated content.

---

## 💰 Pricing (Credits)

| Action | Credits | Cost |
|--------|---------|------|
| `/voice` | 0.1 | ~Rp 50 |
| `/analyze` | 0.2 | ~Rp 100 |
| `/music` | 0.3 | ~Rp 150 |
| `/suno` | 1.0 | ~Rp 500 |
| `/loop` | 0.5 | ~Rp 250 |
| `/clone` | 0.8 | ~Rp 400 |
| `/faceless` | 0.5 | ~Rp 250 |
| `/clip` | 0.5 | ~Rp 250 |
| `/storyboard` | 0.5 | ~Rp 250 |

Topup via `/topup` command (Midtrans payment gateway).

---

## 🛠️ Technical Architecture

```
User (Telegram)
    │
    ▼
@vilonacontentbot (Telegraf — src/content-bot.ts)
    │
    ├── All commands → Python API (port 8767)
    │                     │
    │                     ├── Services (26 Python modules)
    │                     │   ├── faceless/ — Video generation
    │                     │   ├── clipper/ — Auto-clipping
    │                     │   ├── analysis/ — Channel analysis
    │                     │   ├── tts/ — Voice generation
    │                     │   ├── music/ — Music generation
    │                     │   ├── suno/ — Suno AI music
    │                     │   ├── looping/ — Looping video
    │                     │   ├── storyboard/ — Visual storyboard
    │                     │   ├── trends/ — Trend scanning + SEO
    │                     │   ├── calendar/ — Content calendar
    │                     │   ├── analytics/ — Performance tracking
    │                     │   ├── brand/ — Brand settings
    │                     │   ├── autopilot/ — Auto-pilot scheduler
    │                     │   ├── social/ — YouTube + Twitter APIs
    │                     │   └── cloakbrowser/ — Browser automation
    │                     │
    │                     └── External APIs
    │                         ├── OmniRoute LLM (localhost:20128)
    │                         ├── CloakBrowser (localhost:8090)
    │                         ├── Pexels (stock footage)
    │                         └── Openverse (free stock)
    │
    ├── PostgreSQL (localhost:5432) — Users, accounts, transactions
    └── Redis (localhost:6379) — Sessions, queues, cache
```

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `src/content-bot.ts` | Bot entry point (standalone) |
| `src/commands/content-factory.commands.ts` | All 18 command handlers |
| `src/handlers/callbacks/content-factory.ts` | Inline button handlers |
| `src/handlers/messages/content-factory.ts` | State-based message handlers |
| `src/services/content-factory.service.ts` | TypeScript → Python API bridge |
| `services/api.py` | Python FastAPI server (47 endpoints) |
| `services/faceless/` | Faceless video pipeline |
| `services/clipper/` | Auto-clipper pipeline |
| `services/analysis/` | Channel analyzer + transcripts |
| `services/trends/` | Trend scanner + SEO generator |
| `services/social/` | YouTube + Twitter APIs + hybrid publisher |

---

## 🚨 Troubleshooting

| Problem | Solution |
|---------|----------|
| Bot not responding | `pm2 restart vilonacontentbot` |
| API not responding | `pm2 restart content-factory-api` |
| Video generation slow | Normal — faceless takes 3-5 min, clipper takes 5-10 min |
| Suno music quality low | Install `suno-api` + set `SUNO_API_KEY` |
| CloakBrowser not posting | Check profiles at http://localhost:8090 |
| Credits insufficient | `/topup` to add credits |

---

**Built with ❤️ by Vilona Content Factory**
