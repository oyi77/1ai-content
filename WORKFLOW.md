# 🏭 1AI-CONTENT FACTORY — COMPLETE WORKFLOW

> **SaaS content factory** untuk kreator: YouTuber, Affiliate, Facebook, X/Twitter, Threads
> 
> Satu bot Telegram → buat konten → posting ke semua sosmed → analisa hasil

---

## 📋 WORKFLOW OVERVIEW

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    1AI-CONTENT FACTORY WORKFLOW                              │
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  CREATE  │───▶│  EDIT    │───▶│  DISTRIB │───▶│ ANALYZE  │              │
│  │ Content  │    │ Content  │    │ Content  │    │ Results  │              │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘              │
│       │               │               │               │                     │
│       ▼               ▼               ▼               ▼                     │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ AI Video │    │ Overlay  │    │ Cloak    │    │ Channel  │              │
│  │ AI Music │    │ Voice    │    │ Browser  │    │ Analysis │              │
│  │ AI Voice │    │ Watermark│    │ 43+      │    │ Strategy │              │
│  │ AI Image │    │ Music    │    │ Profiles │    │ Growth   │              │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 🎯 WORKFLOW 1: CREATE CONTENT

### 1A. AI Video Generation

```
User: /create romantic beach sunset

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  TELEGRAM BOT                                                    │
│  ├─ User sends: /create romantic beach sunset                   │
│  ├─ Bot parses: prompt = "romantic beach sunset"                │
│  └─ Bot calls: ContentCommands.handleCreate()                   │
│                                                                  │
│  VIDEO GENERATION PIPELINE                                       │
│  ├─ PromptOptimizer.optimize(prompt)                             │
│  │   └─ AI enhances prompt for better video quality             │
│  ├─ VideoGenerationService.generateVideo(optimized_prompt)      │
│  │   ├─ Tier 1: GeminiGen.ai (primary)                         │
│  │   ├─ Tier 2: BytePlus Seedance (fallback)                   │
│  │   ├─ Tier 3-9: XAI, LaoZhang, EvoLink, etc.                │
│  │   └─ Tier 10: Demo mode (sample video)                      │
│  ├─ VideoEditorService.postProcess(video)                        │
│  │   ├─ Trim to target duration                                │
│  │   ├─ Add watermark                                          │
│  │   └─ Quality check                                          │
│  └─ Return: video_url, video_path, metadata                    │
│                                                                  │
│  TELEGRAM BOT                                                    │
│  ├─ Reply: "✅ Video created!"                                  │
│  ├─ Send video preview                                          │
│  └─ Show: /publish button                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Files:**
- `src/commands/create.ts` — Telegram command handler
- `src/services/video-generation.service.ts` — Multi-provider video gen
- `src/services/prompt-optimizer.service.ts` — AI prompt enhancement
- `src/services/video-editor.service.ts` — Post-processing
- `src/services/geminigen.service.ts` — GeminiGen.ai provider

---

### 1B. AI Music Generation (NEW)

```
User: /suno lo-fi chill beats

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  TELEGRAM BOT                                                    │
│  ├─ User sends: /suno lo-fi chill beats                        │
│  ├─ Bot parses: prompt = "lo-fi chill beats", style = "lofi"   │
│  └─ Bot calls: SunoService.generate()                           │
│                                                                  │
│  SUNO GENERATION PIPELINE                                        │
│  ├─ Parse style from prompt                                     │
│  │   └─ Map: "lo-fi" → "lo-fi hip hop, chill beats, 80bpm"    │
│  ├─ SunoClient.generate(prompt, style, instrumental=True)       │
│  │   ├─ Try: Suno API (if API key available)                   │
│  │   ├─ Try: suno-api package                                  │
│  │   └─ Fallback: FFmpeg simple tone                           │
│  ├─ Post-process audio                                          │
│  │   ├─ Trim to target duration (30s for shorts, 3min for full)│
│  │   ├─ Normalize volume                                       │
│  │   └─ Add fade in/out                                        │
│  └─ Return: audio_url, audio_path, metadata                    │
│                                                                  │
│  TELEGRAM BOT                                                    │
│  ├─ Reply: "🎵 Music generated!"                                │
│  ├─ Send audio preview                                          │
│  └─ Show: /loop button (to create looping video)                │
└─────────────────────────────────────────────────────────────────┘
```

**Files:**
- `services/music/generator.py` — Multi-engine music gen

---

### 1C. AI Voiceover (NEW)

```
User: /voice Beli sekarang di Shopee! Diskon 50%!

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  TELEGRAM BOT                                                    │
│  ├─ User sends: /voice Beli sekarang di Shopee! Diskon 50%!    │
│  ├─ Bot parses: text, language = "id" (auto-detect)            │
│  └─ Bot calls: TTSService.synthesize()                          │
│                                                                  │
│  TTS PIPELINE                                                    │
│  ├─ Auto-detect language (id/en/ms/th)                          │
│  ├─ Select voice                                                │
│  │   ├─ id: id-ID-ArdiNeural (male) / id-ID-GadisNeural (female)│
│  │   ├─ en: en-US-GuyNeural / en-US-JennyNeural                │
│  │   └─ User can override: /voice --voice en-US-JennyNeural    │
│  ├─ TTSEngine.synthesize(text, voice, language)                 │
│  │   ├─ Try: Edge TTS (free, high quality)                     │
│  │   └─ Try: MeloTTS (self-hosted, faster)                     │
│  └─ Return: audio_path, duration, voice_used                   │
│                                                                  │
│  TELEGRAM BOT                                                    │
│  ├─ Reply: "🎙️ Voiceover generated!"                            │
│  ├─ Send audio                                                  │
│  └─ Show: /create button (to add to video)                      │
└─────────────────────────────────────────────────────────────────┘
```

**Files:**
- `services/tts/engine.py` — Multi-engine TTS

---

### 1D. AI Image/Thumbnail (NEW)

```
User: /thumbnail romantic beach sunset

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  TELEGRAM BOT                                                    │
│  ├─ User sends: /thumbnail romantic beach sunset                │
│  ├─ Bot parses: prompt = "romantic beach sunset"                │
│  └─ Bot calls: ImageService.generateThumbnail()                 │
│                                                                  │
│  IMAGE GENERATION PIPELINE                                       │
│  ├─ PromptOptimizer.optimizeImagePrompt(prompt)                 │
│  ├─ ImageGenerationService.generate(prompt)                     │
│  │   ├─ Tier 1: NVIDIA (FLUX)                                 │
│  │   ├─ Tier 2: Replicate (Stable Diffusion)                  │
│  │   ├─ Tier 3: Together.ai (FLUX Schnell)                    │
│  │   └─ Tier 4: Hugging Face (free)                           │
│  ├─ Post-process                                                │
│  │   ├─ Resize to 1280x720 (YouTube thumbnail)                │
│  │   ├─ Add text overlay (product name, price)                │
│  │   └─ Add branding watermark                                │
│  └─ Return: image_url, image_path                              │
│                                                                  │
│  TELEGRAM BOT                                                    │
│  ├─ Reply: "🖼️ Thumbnail generated!"                            │
│  ├─ Send image                                                  │
│  └─ Show: /publish button                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Files:**
- `src/services/image.service.ts` — Multi-provider image gen

---

### 1E. Looping Content (NEW)

```
User: /loop lofi_chill.mp3 --duration 1h --visual gradient

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  TELEGRAM BOT                                                    │
│  ├─ User sends: /loop lofi_chill.mp3 --duration 1h --visual gradient│
│  ├─ Bot parses: audio, duration, visual_type                   │
│  └─ Bot calls: LoopingEngine.createLoop()                       │
│                                                                  │
│  LOOPING VIDEO PIPELINE                                          │
│  ├─ Create visual background (30-second loop)                   │
│  │   ├─ gradient: Animated color gradient (sin-based)          │
│  │   ├─ stars: Starfield background                            │
│  │   ├─ waves: Wave animation                                  │
│  │   ├─ solid: Solid color                                      │
│  │   └─ image: Ken Burns effect on image                       │
│  ├─ Crossfade audio                                             │
│  │   ├─ Add fade in (1s)                                        │
│  │   └─ Add fade out (1s)                                       │
│  ├─ Loop to fill duration                                       │
│  │   ├─ stream_loop: Repeat visual + audio                     │
│  │   ├─ Scale to 1920x1080 (or 1080x1920 for shorts)          │
│  │   └─ CRF 23 for quality/size balance                       │
│  └─ Return: video_path, duration, file_size                    │
│                                                                  │
│  TELEGRAM BOT                                                    │
│  ├─ Reply: "🔁 Looping video created!"                          │
│  ├─ Send video preview                                          │
│  └─ Show: /publish button                                       │
└─────────────────────────────────────────────────────────────────┘
```

**Files:**
- `services/looping/engine.py` — Looping video engine

---

### 1F. Channel Analysis (NEW)

```
User: /analyze @lofigirl

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  TELEGRAM BOT                                                    │
│  ├─ User sends: /analyze @lofigirl                             │
│  ├─ Bot parses: channel = "@lofigirl"                          │
│  └─ Bot calls: ChannelAnalyzer.analyzeChannel()                 │
│                                                                  │
│  CHANNEL ANALYSIS PIPELINE                                       │
│  ├─ Data Collection (yt-dlp)                                    │
│  │   ├─ Channel metadata (name, subscribers, description)      │
│  │   ├─ Video list (title, views, likes, duration, date)       │
│  │   ├─ Thumbnails (URLs)                                       │
│  │   └─ Transcript of top 20 videos                            │
│  ├─ Performance Analysis                                        │
│  │   ├─ Total/avg/max/min views                                 │
│  │   ├─ Engagement rate (likes/views)                          │
│  │   ├─ Upload frequency                                        │
│  │   └─ Top 5 / bottom 5 performers                            │
│  ├─ Content Analysis                                            │
│  │   ├─ Title patterns (how-to, numbered, question)            │
│  │   ├─ Top 20 keywords                                         │
│  │   ├─ Duration distribution                                   │
│  │   └─ Sample titles                                           │
│  └─ Strategy Generation                                         │
│      ├─ What works: Top patterns                                │
│      ├─ What to copy: Winning formats                          │
│      ├─ What to improve: Gaps found                             │
│      └─ Content calendar: 30-day plan                          │
│                                                                  │
│  TELEGRAM BOT                                                    │
│  ├─ Reply: "📊 Channel Analysis Report"                         │
│  ├─ Send formatted report                                       │
│  └─ Show: /factory button (to create similar content)           │
└─────────────────────────────────────────────────────────────────┘
```

**Files:**
- `services/analysis/channel_analyzer.py` — Channel analyzer

---

## 🎯 WORKFLOW 2: EDIT & COMPOSE

### 2A. Video Composition (Combine All)

```
User: /compose video.mp4 --voice voiceover.mp3 --music bgm.mp3 --watermark

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  VIDEO COMPOSITION PIPELINE                                      │
│                                                                  │
│  Input:                                                          │
│  ├─ video.mp4 (AI generated or looping)                        │
│  ├─ voiceover.mp3 (TTS generated)                              │
│  ├─ bgm.mp3 (Suno/MusicGen generated)                          │
│  └─ watermark.png (branding)                                    │
│                                                                  │
│  Process:                                                        │
│  ├─ 1. Scale video to 1920x1080 (or 1080x1920 for shorts)     │
│  ├─ 2. Overlay voiceover on video                               │
│  │   └─ [0:a]volume=1.0[voice]; [1:a]volume=0.3[music];       │
│  │      [voice][music]amix=inputs=2:duration=longest[a]        │
│  ├─ 3. Mix background music (lower volume)                      │
│  ├─ 4. Add text overlays (product name, price, CTA)            │
│  ├─ 5. Add watermark                                            │
│  ├─ 6. Add subtitles (auto-generated from voiceover)           │
│  └─ 7. Export with faststart (for web streaming)                │
│                                                                  │
│  Output: final_video.mp4                                        │
└─────────────────────────────────────────────────────────────────┘
```

**Files:**
- `src/services/video-editor.service.ts` — Video editing
- `src/services/audio-vo.service.ts` — Audio voiceover
- `src/services/watermark.service.ts` — Watermarking

---

### 2B. Content Rework (Clone & Improve)

```
User: /remix https://youtube.com/watch?v=xxx

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  CONTENT REWORK PIPELINE                                         │
│                                                                  │
│  Step 1: Analyze Original                                       │
│  ├─ Download video metadata (yt-dlp)                            │
│  ├─ Get transcript (youtube-transcript-api)                     │
│  ├─ Analyze structure (hooks, content, CTA)                     │
│  └─ Extract visual style (thumbnail, duration, pacing)          │
│                                                                  │
│  Step 2: Generate Improved Version                               │
│  ├─ AI rewrites script (better hooks, stronger CTA)             │
│  ├─ Generate new AI video (better quality)                      │
│  ├─ Generate better thumbnail                                   │
│  ├─ Optimize title + description                                │
│  └─ Add trending hashtags                                       │
│                                                                  │
│  Step 3: Quality Check                                           │
│  ├─ Compare engagement prediction                               │
│  ├─ SEO score                                                   │
│  └─ Visual quality score                                        │
│                                                                  │
│  Output: improved_video.mp4 + optimized_title + thumbnail       │
└─────────────────────────────────────────────────────────────────┘
```

**Files:**
- `src/services/content-rework.service.ts` — Content rework
- `src/services/content-analysis.service.ts` — Content analysis

---

## 🎯 WORKFLOW 3: DISTRIBUTE (POST TO ALL SOSMED)

### 3A. Single Post (Manual)

```
User: /publish
Bot: Menu tombol publish_to_<platform> (TikTok/IG/FB/YouTube/X) untuk akun yang sudah terhubung
User: tap publish_to_<platform>
Bot: Upload konten terakhir (session lastVideoPath) → POST /posts → status

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  PUBLISH PIPELINE (via 1ai-social bridge :8200)                  │
│                                                                  │
│  Step 1: Check Connected Accounts                                │
│  ├─ GET /accounts (header X-User-Id)                             │
│  └─ Jika tidak ada → reply "Ketik /connect dulu"                 │
│                                                                  │
│  Step 2: Pick Platform (inline keyboard)                         │
│  └─ Callback publish_to_<platform> per akun terhubung            │
│                                                                  │
│  Step 3: Publish Last Content                                    │
│  ├─ Jika session.lastVideoPath kosong → arahkan buat konten      │
│  ├─ Upload media: POST /media/upload (form-data file)            │
│  └─ Publish: POST /posts {platform, media_url, content}          │
│                                                                  │
│  Output: Post ID + status per platform ✅                        │
└─────────────────────────────────────────────────────────────────┘
```

**Files:**
- `src/commands/social-vilona.commands.ts` — connect/publish/schedule commands & callbacks
- 1ai-social (`SOCIAL_SERVICE_URL` :8200) — OAuth, upload media & posting

---

### 3B. Batch Post (Factory Mode)

> ⚠️ 2026-08-02 (audit): `/factory` TIDAK terdaftar di bot listener (`src/commands/index.ts`) — bukan command aktif. Section ini dipertahankan sebagai catatan desain mode produksi massal, BUKAN alur yang berjalan saat ini.

```
User: /factory @lofigirl 10

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  FACTORY MODE PIPELINE                                           │
│                                                                  │
│  Step 1: Analyze Target Channel                                 │
│  ├─ ChannelAnalyzer.analyzeChannel("@lofigirl")                │
│  ├─ Extract: top 10 video patterns                             │
│  ├─ Extract: visual style, music style, pacing                 │
│  └─ Generate: 10 content ideas based on patterns               │
│                                                                  │
│  Step 2: Batch Generate Content                                 │
│  ├─ For each idea (10 videos):                                  │
│  │   ├─ Generate AI video (video-generation.service)           │
│  │   ├─ Generate matching music (music.generator)               │
│  │   ├─ Generate voiceover if needed (tts.engine)              │
│  │   ├─ Compose final video (video-editor.service)             │
│  │   └─ Generate thumbnail (image.service)                     │
│  └─ Total: 10 videos ready                                      │
│                                                                  │
│  Step 3: Schedule & Post                                        │
│  ├─ Create posting schedule (spread across days)                │
│  │   ├─ Day 1: 2 videos                                        │
│  │   ├─ Day 2: 2 videos                                        │
│  │   └─ ... (continue)                                         │
│  ├─ Post via CloakBrowser CDP                                   │
│  └─ Track results                                               │
│                                                                  │
│  Output: 10 videos posted over 5 days                           │
└─────────────────────────────────────────────────────────────────┘
```

**Files:**
- `services/analysis/channel_analyzer.py` — Channel analyzer
- All video/music/TTS services

---

## 🎯 WORKFLOW 4: ANALYZE & OPTIMIZE

### 4A. Competitor Benchmark

```
User: /benchmark @channel1 @channel2

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  BENCHMARK PIPELINE                                              │
│                                                                  │
│  Step 1: Analyze Both Channels                                  │
│  ├─ ChannelAnalyzer.analyzeChannel("@channel1")                │
│  └─ ChannelAnalyzer.analyzeChannel("@channel2")                │
│                                                                  │
│  Step 2: Compare Metrics                                        │
│  ├─ Views: channel1 vs channel2                                │
│  ├─ Engagement: channel1 vs channel2                           │
│  ├─ Upload frequency: channel1 vs channel2                     │
│  ├─ Content style: channel1 vs channel2                        │
│  └─ Best performing: channel1 vs channel2                      │
│                                                                  │
│  Step 3: Generate Recommendations                               │
│  ├─ What channel1 does better                                   │
│  ├─ What channel2 does better                                   │
│  ├─ Content gaps in both                                        │
│  └─ Strategy to beat both                                       │
│                                                                  │
│  Output: Comparison report + strategy                           │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4B. Content Gap Analysis

```
User: /gap affiliate marketing

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  CONTENT GAP PIPELINE                                            │
│                                                                  │
│  Step 1: Research Niche                                         │
│  ├─ ViralScannerService.scanViralVideos("affiliate marketing") │
│  ├─ Extract: trending topics, formats, styles                  │
│  └─ Identify: underserved topics                               │
│                                                                  │
│  Step 2: Analyze Competition                                    │
│  ├─ Top 10 channels in niche                                    │
│  ├─ Their content patterns                                      │
│  └─ What they're missing                                        │
│                                                                  │
│  Step 3: Generate Ideas                                         │
│  ├─ 10 content ideas no one is doing                            │
│  ├─ 10 content ideas doing poorly (opportunity)                 │
│  └─ 10 trending topics to capitalize on                         │
│                                                                  │
│  Output: Content gap report + 30 ideas                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🎯 WORKFLOW 5: AUTOMATION

### 5A. Auto-Schedule

> ⚠️ 2026-08-02 (audit): `/schedule` TIDAK mem-parse argumen waktu (`/schedule 09:00 daily`). Realita: reply info + tombol (Open Calendar admin · Setup AutoPilot); jadwal aktual via `/calendar schedule <topic> | <YYYY-MM-DD HH:MM>` dan `/autopilot create <niche>`. Diagram di bawah = desain lama, tidak berlaku.

```
User: /schedule 09:00 daily

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  SCHEDULE PIPELINE                                               │
│                                                                  │
│  Step 1: Create Schedule                                        │
│  ├─ Parse: "09:00 daily" → cron: "0 9 * * *"                  │
│  ├─ Create schedule entry in database                          │
│  └─ Link to content queue                                       │
│                                                                  │
│  Step 2: Auto-Content Generation (Cron)                         │
│  ├─ Every day at 09:00:                                         │
│  │   ├─ Check content queue                                     │
│  │   ├─ If queue empty: generate new content                   │
│  │   │   ├─ Scan viral topics                                   │
│  │   │   ├─ Generate video                                      │
│  │   │   ├─ Generate music                                      │
│  │   │   └─ Generate voiceover                                  │
│  │   ├─ Post to all platforms                                   │
│  │   └─ Track results                                           │
│  └─ Send daily summary to Telegram                              │
│                                                                  │
│  Output: Automated daily posting                                │
└─────────────────────────────────────────────────────────────────┘
```

**Files:**
- `src/commands/social-vilona.commands.ts` — `scheduleCommand` (`/schedule` = info + tombol; TIDAK parse argumen — jadwal via `/calendar schedule`)
- `src/commands/tiktok-automation/calendar.ts` — `/calendar schedule <topic> | <YYYY-MM-DD HH:MM>`
- `src/commands/tiktok-automation/autopilot.ts` — `/autopilot status` / `/autopilot create <niche>`

---

### 5B. Auto-Pilot (Full Automation)

```
> Catatan 2026-08-02 (audit): `/autopilot` TIDAK punya sub-command `start`. Sub-command nyata: `bare`/`status` = tampilkan status, `create <niche>` = buat job autopilot (lihat `src/commands/tiktok-automation/autopilot.ts`). Diagram di bawah = desain alur 24/7 yang diinginkan, BUKAN antarmuka perintah.

User: /autopilot
User: /autopilot status
User: /autopilot create <niche>

Flow:
┌─────────────────────────────────────────────────────────────────┐
│  AUTOPILOT PIPELINE                                              │
│                                                                  │
│  Continuous Loop (24/7):                                        │
│  ├─ 1. SCAN: Find viral content in niche                       │
│  ├─ 2. ANALYZE: What's working now                             │
│  ├─ 3. CREATE: Generate similar content                        │
│  ├─ 4. EDIT: Compose final video                               │
│  ├─ 5. POST: Distribute to all platforms                       │
│  ├─ 6. TRACK: Monitor performance                              │
│  └─ 7. OPTIMIZE: Adjust strategy based on results             │
│                                                                  │
│  Schedule:                                                       │
│  ├─ 00:00 - Scan & analyze                                      │
│  ├─ 02:00 - Generate 3 videos                                   │
│  ├─ 06:00 - Post morning content                                │
│  ├─ 12:00 - Post afternoon content                              │
│  ├─ 18:00 - Post evening content                                │
│  └─ 22:00 - Daily report                                        │
│                                                                  │
│  Output: 24/7 automated content factory                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📱 COMPLETE TELEGRAM COMMANDS

> Catatan 2026-08-02 (audit, diperbarui 2026-08-10): tabel di bawah diverifikasi dari `src/commands/index.ts` — daftar otoritatif bot utama (`src/index.ts`). Perintah `/suno /voice /music /loop /analyze /storyboard` TIDAK aktif di produksi — satu-satunya entry `src/content-bot.ts` yang mendaftarkannya SUDAH DIHAPUS (audit dead-code 2026-08-03) sehingga perintah tersebut kini tidak punya handler sama sekali. `/thumbnail /benchmark /gap /strategy /compose /remix /factory /status /history` TIDAK punya handler sama sekali (fictional).

### User & Account

| Command | Description |
|---------|-------------|
| `/start` `/menu` `/dashboard` | Main menu / dashboard (alias) |
| `/help` | Guide lengkap |
| `/profile` `/settings` `/videos` | Profil, pengaturan, daftar video |
| `/subscription` | Langganan / kuota |
| `/topup` `/pricing` `/referral` | Top-up kredit, harga, referral |
| `/send` `/cancel` `/delete_account` | Kirim, batalkan, hapus akun |
| `/support` | Kontak dukungan |

### Content Creation

| Command | Description |
|---------|-------------|
| `/create <prompt>` | Generate AI video |
| `/image` | Menu generate foto (produk/logo/dst) |
| `/ebook` `/ebooks` | Buat / list ebook |
| `/carousel` | Buat TikTok carousel |
| `/clip` `/edit` `/rework` `/regen` | Clip, edit, rework, regenerate video |
| `/repurpose` `/remeta` | Repurpose / re-metadata |
| `/scrape` | Scrape content |

### AI Assistant & Analysis

| Command | Description |
|---------|-------------|
| `/chat` `/ask` | Chat dengan AI (OmniRoute) |
| `/prompts` `/prompt` | Prompt library |
| `/daily` | Daily prompt |
| `/trending` | Trending content |
| `/fingerprint` | Fingerprint akun |
| `/viral` | Cari viral videos |

### Automation & Publishing

| Command | Description |
|---------|-------------|
| `/autopilot` | Status AutoPilot |
| `/autopilot status` | Status detail |
| `/autopilot create <niche>` | Buat job AutoPilot baru |
| `/calendar` | Content calendar |
| `/abtest` | A/B test konten |
| `/connect` | Hubungkan akun sosial (1ai-social bridge, port 8200) |
| `/publish` | Publikasi konten terakhir ke akun terhubung (menu button `publish_to_<platform>`) |
| `/schedule` | Jadwalkan posting |
| `/yt` `/youtube` | Menu workflow YouTube (button) |

### Admin

| Command | Description |
|---------|-------------|
| `/broadcast` | Broadcast ke semua user |
| `/system_status` | Status sistem |
| `/grant_credits` `/deduct_credits` | Kelola kredit user |
| `/payment_settings` `/admin` | Pengaturan pembayaran (alias) |

### ⚠️ Tidak aktif / tidak terdaftar

- **Fictional** (tidak ada handler di codebase): `/suno`, `/voice`, `/music`, `/loop`, `/analyze`, `/storyboard` (entry `src/content-bot.ts` dihapus 2026-08-03), `/thumbnail`, `/benchmark`, `/gap`, `/strategy`, `/compose`, `/remix`, `/factory`, `/status`, `/history`

---

## 🔧 SERVICE ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────────┐
│                    1AI-CONTENT (TypeScript)                      │
│                                                                  │
│  EXISTING SERVICES (src/services/)                              │
│  ├─ video-generation.service.ts    (9-tier video gen)           │
│  ├─ video-editor.service.ts        (trim, crop, overlay)        │
│  ├─ video-clipper.service.ts       (clip extraction)            │
│  ├─ video-storyboard.service.ts    (storyboard gen)             │
│  ├─ image.service.ts               (image gen)                  │
│  ├─ audio-vo.service.ts            (audio voiceover)            │
│  ├─ watermark.service.ts           (watermarking)               │
│  ├─ content-analysis.service.ts    (content cloning)            │
│  ├─ content-rework.service.ts      (content rework)             │
│  ├─ viral-scanner.service.ts       (viral scanning)             │
│  ├─ postautomation.service.ts      (PostBridge posting)         │
│  ├─ campaign.service.ts            (campaign management)        │
│  ├─ prompt-optimizer.service.ts    (AI prompt enhancement)      │
│  ├─ quality-check.service.ts       (quality verification)       │
│  └─ analytics.service.ts           (analytics)                  │
│                                                                  │
│  NEW PYTHON SERVICES (services/)                                │
│  ├─ looping/engine.py              (looping video creation)     │
│  ├─ analysis/channel_analyzer.py   (channel analysis)           │
│  ├─ tts/engine.py                  (multi-engine TTS)           │
│  ├─ music/generator.py             (background music)           │
│  └─ cloak_adapter/__init__.py      (CloakBrowser CDP adapter)   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE                                │
│                                                                  │
│  CloakBrowser Manager (Docker, port 8090)                       │
│  ├─ 30 Facebook profiles (unique fingerprint)                   │
│  ├─ 13 X/Twitter profiles (unique fingerprint)                  │
│  └─ + Instagram/TikTok/YouTube profiles (to add)                │
│                                                                  │
│  PostgreSQL (port 5432)                                         │
│  ├─ users, videos, subscriptions, transactions                 │
│  ├─ social_accounts, campaigns, analytics                      │
│  └─ content_queue, post_tracker                                │
│                                                                  │
│  Redis (port 6379)                                              │
│  ├─ Session cache                                               │
│  ├─ Queue (BullMQ)                                              │
│  └─ Rate limiting                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📊 DATA FLOW

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   USER       │     │   BOT        │     │   SERVICES   │
│   (Telegram) │────▶│   (Telegraf) │────▶│   (TypeScript│
│              │     │              │     │    + Python) │
└──────────────┘     └──────────────┘     └──────┬───────┘
                                                  │
                    ┌─────────────────────────────┼──────────────┐
                    │                             │              │
                    ▼                             ▼              ▼
             ┌──────────────┐           ┌──────────────┐ ┌──────────────┐
             │   Cloak      │           │   AI APIs    │ │   Storage    │
             │   Browser    │           │              │ │              │
             │   (CDP)      │           │ ├─ GeminiGen │ │ ├─ PostgreSQL│
             │              │           │ ├─ Suno      │ │ ├─ Redis     │
             │ ├─ 30 FB     │           │ ├─ Edge TTS  │ │ ├─ S3/R2    │
             │ ├─ 13 X      │           │ ├─ Gemini    │ │ └─ Local FS │
             │ ├─ N IG      │           │ └─ NVIDIA    │ │              │
             │ ├─ N TikTok  │           │              │ │              │
             │ └─ N YT      │           └──────────────┘ └──────────────┘
             └──────────────┘
```

---

## 🚀 DEPLOYMENT CHECKLIST

### Phase 1: Core (NOW)
- [x] Looping engine built
- [x] Channel analyzer built
- [x] Suno client built
- [x] TTS engine built
- [x] Music generator built
- [x] CloakBrowser adapter built
- [ ] Wire to TypeScript bot (Telegram commands)
- [ ] Test end-to-end

### Phase 2: Enhanced
- [ ] Install Suno API key
- [ ] Install AudioCraft for self-hosted music
- [ ] Add more CloakBrowser profiles (IG, TikTok, YT)
- [ ] Implement content rework pipeline
- [ ] Implement factory mode

### Phase 3: Business
- [ ] Credit system (free/pro/agency)
- [ ] Referral system
- [ ] Auto-scheduling engine
- [ ] Dashboard + analytics
- [ ] Payment integration (Midtrans/Tripay)

---

## 💰 PRICING TIERS

| Feature | Free | Pro ($9.99/mo) | Agency ($29.99/mo) |
|---------|------|----------------|---------------------|
| AI Videos/day | 3 | 50 | Unlimited |
| Music Gen/day | 5 | 50 | Unlimited |
| Voiceover/day | 10 | 100 | Unlimited |
| Channel Analysis | 1/day | 10/day | Unlimited |
| Looping Videos | 1/day | 10/day | Unlimited |
| Auto-post | ❌ | ✅ | ✅ |
| CloakBrowser profiles | 1 | 10 | 43+ |
| Watermark | ✅ | ❌ | ❌ |
| Priority support | ❌ | ✅ | ✅ |

---

## 📋 SUMMARY

**Total Services**: 6 Python + 15+ TypeScript
**Total Commands**: 25+ Telegram commands
**Platforms Supported**: Facebook, X, Instagram, TikTok, YouTube, LinkedIn, Threads
**CloakBrowser Profiles**: 43+ (expandable)
**AI Providers**: 9-tier video fallback + Suno + Edge TTS + Gemini Vision

**One bot. All platforms. Full automation.** 🔥
