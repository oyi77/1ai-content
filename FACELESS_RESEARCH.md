# 🎬 Faceless Video Generator — GitHub Research

> Repository terbaik untuk content faceless TikTok, YouTube Shorts, Instagram Reels, Facebook
> Diurutkan berdasarkan: completeness, production-readiness, dan relevansi dengan sistem kita

---

## 🏆 TIER 1 — Langsung Bisa Diadopsi

### 1. `gyoridavid/short-video-maker` ⭐⭐⭐⭐⭐
**1,192 stars — THE best open-source faceless video maker**

| | |
|---|---|
| **URL** | https://github.com/gyoridavid/short-video-maker |
| **Stars** | 1,192 ⭐ |
| **Stack** | TypeScript, Remotion, Kokoro TTS, Whisper, Pexels, FFmpeg |
| **License** | MIT |
| **Format** | Portrait (9:16) + Landscape (16:9) |

**Pipeline:**
```
Text prompt → Kokoro TTS → Whisper captions → Pexels stock footage → Remotion render → MP4
```

**Kenapa TERBAIK:**
- **TypeScript** — sama stack dengan bot kita
- **REST API + MCP server** — bisa langsung dipanggil dari bot
- **Remotion** — React-based video rendering, kualitas tinggi
- **Whisper captions** — auto-generated subtitles yang akurat
- **Pexels integration** — free stock footage, auto-search berdasarkan keyword
- **Docker ready** — `docker run` langsung jalan
- **25+ royalty-free music** included
- **Portrait + Landscape** — support TikTok (9:16) dan YouTube (16:9)

**Yang bisa kita adopsi:**
- `ShortCreator` class — pipeline pattern
- `Pexels.ts` — stock footage search + download
- `Whisper.ts` — caption generation
- `FFmpeg.ts` — video composition
- REST API pattern → langsung integrate ke Python API kita

**Limitation:** English-only TTS (Kokoro). Kita sudah punya Edge TTS (Indonesian).

---

### 2. `xixihhhh/clipforge` ⭐⭐⭐⭐⭐
**150 stars — Most complete production system (Chinese market focus)**

| | |
|---|---|
| **URL** | https://github.com/xixihhhh/clipforge |
| **Stars** | 150 ⭐ |
| **Stack** | Next.js 16, TypeScript, FFmpeg, Drizzle DB, Multi-AI |
| **License** | AGPL v3 |
| **Format** | Vertical 9:16 (TikTok/Douyin/Xiaohongshu) |

**Fitur LENGKAP:**
- **5 script templates**: Beauty, Food, Home, Fashion, Electronics
- **4 script styles**: Pain-point seeding, Scene recommendation, Comparison review, Story
- **Golden 3-second hooks**: Visual impact, Suspense, Contrast, Promise, Emotion
- **Multi-source stock footage**: Openverse (free, no key), Pixabay, Pexels
- **Ken Burns motion**: Slow zoom, pan, depth drift untuk static images
- **Chinese subtitle burn**: Auto-detect Chinese fonts, per-scene timing
- **Multi-platform export**: Auto-adapt to Douyin/Kuaishou/Xiaohongshu/TikTok
- **A/B testing**: Generate 3 versions per video
- **Batch production**: Select N products → generate all at once
- **SEO optimization**: Auto-generate hashtags, cover text, interaction guide per platform

**Kenapa SANGAT relevan:**
- **Product video focus** — cocok untuk affiliate marketing
- **Free stock footage engine** — Openverse tanpa API key
- **Edge TTS** — sama dengan yang kita pakai
- **Multi-platform export** — auto-resize untuk setiap platform
- **Batch mode** — generate 10+ video sekaligus

**Yang bisa kita adopsi:**
- Stock footage engine (Openverse + Pexels + Pixabay)
- Ken Burns motion effect untuk static images
- Multi-platform export logic
- A/B testing pattern
- SEO optimization per platform

---

### 3. `SaarD00/AI-Youtube-Shorts-Generator` ⭐⭐⭐⭐
**126 stars — Best Python pipeline (faceless video factory)**

| | |
|---|---|
| **URL** | https://github.com/SaarD00/AI-Youtube-Shorts-Generator |
| **Stars** | 126 ⭐ |
| **Stack** | Python, Gemini 2.0 Flash, Edge-TTS, FFmpeg, Pexels |
| **License** | MIT |

**Pipeline:**
```
Topic → Gemini script → Edge-TTS voiceover → Pexels dual-visual → FFmpeg compose → MP4
```

**Fitur unik:**
- **A/B Split Visual** — setiap scene punya 2 video, switch mid-scene untuk retensi
- **Avatar Injection** — random mascot video di tengah untuk branding
- **Smart Trimming** — sync video ke audio duration
- **Silence Removal** — auto-trim dead air dari TTS
- **Pro Transitions** — xfade (fade, slide, wipes) antar scene

**Kenapa relevan:**
- **Python** — sama dengan backend kita
- **Gemini** — kita sudah pakai OmniRoute (compatible)
- **Edge-TTS** — sama dengan TTS engine kita
- **Modular architecture**: `brain.py` (script) + `audio.py` (TTS) + `asset_manager.py` (Pexels) + `composer.py` (FFmpeg)

**Yang bisa kita adopsi:**
- A/B split visual pattern
- Avatar injection untuk branding
- Modular `brain → audio → assets → composer` pattern
- Silence removal dari TTS output

---

## 🥈 TIER 2 — Pattern & Components

### 4. `SamurAIGPT/AI-Youtube-Shorts-Generator`
**Long-form → Short-form converter (Opus Clip alternative)**

| | |
|---|---|
| **URL** | https://github.com/SamurAIGPT/AI-Youtube-Shorts-Generator |
| **Fitur** | LLM highlight detection, auto-cropping, viral clip extraction |
| **Kenapa relevan** | User bisa convert video panjang → multiple shorts |

### 5. `TerzicScript/shorts-flow`
**Reddit/Story content generator**

| | |
|---|---|
| **URL** | https://github.com/TerzicScript/shorts-flow |
| **Fitur** | Reddit story → video, auto-splitting, hook generation, Kokoro TTS |
| **Kenapa relevan** | Story-based content sangat viral di TikTok |

### 6. `Dark2C/Viral-Faceless-Shorts-Generator`
**Docker-first, easy deployment**

| | |
|---|---|
| **URL** | https://github.com/Dark2C/Viral-Faceless-Shorts-Generator |
| **Fitur** | Gemini + Edge-TTS + FFmpeg, Docker containerized |
| **Kenapa relevan** | Simple pipeline, easy to integrate |

---

## 🎯 REKOMENDASI IMPLEMENTASI

### Architecture yang harus kita bangun:

```
┌─────────────────────────────────────────────────────────┐
│  FACELESS VIDEO PIPELINE                                 │
│                                                          │
│  1. SCRIPT ENGINE (brain)                                │
│     ├─ Input: topic / clone plan / product               │
│     ├─ LLM: generate script (hook → content → CTA)       │
│     ├─ Output: scenes[] with text + visual_keywords       │
│     └─ Style: educational / story / product / listicle    │
│                                                          │
│  2. AUDIO ENGINE (voice)                                 │
│     ├─ TTS: Edge TTS (ID/EN/MS/TH) ← sudah ada          │
│     ├─ Post-process: silence removal, volume boost        │
│     └─ Output: voiceover.mp3 per scene                   │
│                                                          │
│  3. VISUAL ENGINE (assets)                               │
│     ├─ Stock: Pexels + Openverse (free, no key)           │
│     ├─ AI: OmniRoute image gen (if needed)                │
│     ├─ Ken Burns: zoom/pan untuk static images            │
│     └─ A/B Split: 2 visual per scene, switch mid-scene    │
│                                                          │
│  4. COMPOSE ENGINE (editor)                              │
│     ├─ FFmpeg: stitch scenes + voiceover + captions       │
│     ├─ Whisper: auto-generate captions                    │
│     ├─ Transitions: xfade (fade, slide, wipes)            │
│     ├─ Avatar injection: random mascot scene              │
│     └─ Multi-platform: 9:16 (TikTok/Reels) + 16:9 (YT)  │
│                                                          │
│  5. PUBLISH ENGINE (distribute)                          │
│     ├─ CloakBrowser: post ke semua platform               │
│     ├─ SEO: auto hashtags, title, description per platform│
│     └─ Schedule: spread across days                       │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Step by Step:

| # | Task | Source Repo | Effort |
|---|------|-------------|--------|
| 1 | **Script Engine** — LLM generate script per scene | `SaarD00/brain.py` pattern | 2-3 jam |
| 2 | **Stock Footage** — Pexels + Openverse integration | `clipforge` stock engine | 3-4 jam |
| 3 | **Ken Burns** — zoom/pan untuk static images | `clipforge` compose engine | 1-2 jam |
| 4 | **Caption Burn** — Whisper + FFmpeg subtitle overlay | `short-video-maker/Whisper.ts` | 2-3 jam |
| 5 | **A/B Split** — 2 visual per scene, switch mid-scene | `SaarD00/composer.py` | 2-3 jam |
| 6 | **Multi-platform** — auto-resize 9:16, 16:9, 3:4 | `clipforge` export logic | 1-2 jam |
| 7 | **Batch Mode** — generate N videos dari clone plan | `clipforge` batch mode | 2-3 jam |

### Commands yang perlu ditambah ke bot:

| Command | Input | Output |
|---------|-------|--------|
| `/faceless <topic>` | Topic text | 60s faceless video dengan stock footage + TTS + captions |
| `/batch <count>` | Jumlah video | Generate N video dari clone plan |
| `/product <name> <desc>` | Product info | Product video dengan A/B split visuals |
| `/story <script>` | Story text | Reddit-style story video |

---

## 📊 COMPARISON

| Feature | short-video-maker | ClipForge | AutoShorts |
|---------|-------------------|-----------|------------|
| **Language** | TypeScript | TypeScript | Python |
| **TTS** | Kokoro (EN only) | Edge TTS (multi) | Edge TTS (multi) |
| **Stock footage** | Pexels | Openverse+Pexels+Pixabay | Pexels |
| **Captions** | Whisper | FFmpeg subtitles | FFmpeg subtitles |
| **Render** | Remotion | FFmpeg | FFmpeg |
| **API** | REST + MCP | REST (Next.js) | CLI only |
| **Multi-platform** | 9:16 + 16:9 | 9:16 + 3:4 + custom | 9:16 only |
| **Batch mode** | ❌ | ✅ | ❌ |
| **Product video** | ❌ | ✅ (e-commerce) | ❌ |
| **Docker** | ✅ | ✅ | ❌ |
| **License** | MIT | AGPL v3 | MIT |
| **Stars** | 1,192 | 150 | 126 |

**Rekomendasi:** Gabungkan **short-video-maker** (pipeline pattern + Remotion) + **ClipForge** (stock engine + Ken Burns + multi-platform) + **AutoShorts** (A/B split + avatar injection)

---

**Last updated: 2026-06-21**
