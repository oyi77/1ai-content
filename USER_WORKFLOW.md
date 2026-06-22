# 🎬 VILONA CONTENT FACTORY — USER WORKFLOW

> Dari sudut pandang user: siapa mereka, apa masalahnya, apa yang mereka mau, dan bagaimana bot ini menyelesaikannya.

---

## 👤 SIAPA USER-NYA?

### Persona 1: Content Creator Pemula
- **Siapa:** Mahasiswa / ibu rumah tangga / karyawan yang mau side income dari konten
- **Masalah:** Gak bisa edit video, gak punya waktu riset, gak ngerti algoritma
- **Mau:** Tinggal kasih ide, langsung jadi video, auto-post ke semua platform
- **Goal:** 100K views/bulan → monetisasi dari ads & affiliate

### Persona 2: Affiliate Marketer
- **Siapa:** Seller Shopee/Tokopedia yang butuh konten promosi massal
- **Masalah:** Butuh 10-30 video/hari untuk promosi produk, gak mungkin bikin manual
- **Mau:** Clone konten kompetitor yang sudah viral → bikin versi lebih bagus → auto-post
- **Goal:** 50+ video/bulan → traffic ke link affiliate → komisi

### Persona 3: Agency / Reseller
- **Siapa:** Manage 10-50 akun klien, butuh konten untuk semua klien
- **Masalah:** Tim kecil, deadline ketat, butuh skalabilitas
- **Mau:** Satu command → batch generate 30 video → distribute ke 50 akun
- **Goal:** Handle 50 klien dengan 1 orang

---

## 🔄 WORKFLOW UTAMA (Looping)

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│   1. RISET          2. BUAT           3. POST          4. ANALISA   │
│   ─────────         ─────────         ─────────        ─────────    │
│   /analyze          /suno             /publish         (otomatis)   │
│   /clone            /voice                                  │       │
│                     /music                                  │       │
│                     /loop                                   ▼       │
│                     /storyboard                        Balik ke 1   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 📋 SCENARIO 1: "Gue mau clone channel lofi yang viral"

### User Goal
Punya channel YouTube lofi → butuh 10 video pertama → gak mau bikin dari nol

### Conversation Flow

```
USER:  /analyze https://youtube.com/@lofigirl

BOT:   🧠 Running deep analysis with AI... Ini butuh 1-3 menit.
       [loading animation]

BOT:   📊 Deep Channel Analysis

       Channel: Lofi Girl
       Subscribers: 14,200,000
       Videos: 20

       📈 Performance
       • Avg Views: 2,400,000
       • Max Views: 18,000,000
       • Engagement: 4.2%

       🧠 Winning Formula
       Animasi 2D aesthetic + lofi beats + rain/ambient sounds.
       Video panjang (1-12 jam) untuk background study/work.

       🎯 What Works
       • Consistent branding (same character, different scenes)
       • Minimal visual distraction — focus on audio
       • Seasonal themes (rain, snow, café, library)

       🔥 Viral Triggers
       • "Study with me" psychology — accountability
       • Rain/window ambience — ASMR crossover
       • Late-night vibes — emotional connection

       💡 Content Ideas
       • Lofi beats + hujan Jakarta malam hari
       • Lofi + suara kopi dituang + café aesthetic
       • Lofi + sunrise di Bali + pagi hari produktif
       • Study beats + perpustakaan aesthetic
       • Lofi + gamelan remix + batik visual

       🔄 Mau clone channel ini?
       [📋 Clone 10 Video (ID)]  [📋 Clone 10 Video (EN)]
       [🎬 Buat Storyboard]

USER:  [taps: 📋 Clone 10 Video (ID)]

BOT:   🔄 Cloning channel: Lofi Girl
       🌍 Language: Indonesian
       📋 Generating 10 video ideas...
       Ini butuh 1-2 menit...

BOT:   📋 Clone Plan: Lofi Girl

       🎯 Strategy: Bikin konten lofi Indonesia dengan sentuhan
       lokal (hujan Jakarta, kopi lokal, gamelan) yang lebih
       niche dan less competition.

       1. 🌧️ Lofi Hujan Jakarta — Study Beats untuk Malam Hari
          🪝 Hook: Suara hujan + lampu kota dari jendela
          📝 Video 3 jam, aesthetic warna biru-hujan
          🏷️ lofi, hujan, jakarta, study, belajar

       2. ☕ Lofi Café Nusantara — Kopi & Produktivitas
          🪝 Hook: Suara kopi dituang + gerimis
          📝 Video 2 jam, warm tone, café aesthetic
          🏷️ lofi, kopi, café, produktif, kerja

       3. 🌅 Lofi Sunrise Bali — Pagi yang Tenang
          🪝 Hook: Sunrise dari pantai + lofi beats
          📝 Video 4 jam, golden hour aesthetic
          🏷️ lofi, bali, sunrise, pagi, motivasi

       [... 7 video lagi ...]

       📅 Schedule: 2 video/minggu selama 5 minggu
       📈 Projection: 50K-200K views di bulan pertama

       🎬 Mau buat storyboard untuk video pertama?
       [🎬 Buat Storyboard Video #1]
       [🎵 Generate Music]

USER:  [taps: 🎬 Buat Storyboard Video #1]

BOT:   🎨 Generating storyboard: Lofi Hujan Jakarta...
       [generates 4 scene storyboard with images]

BOT:   [Scene 1 image: Window with rain, city lights]
       Scene 1: Establishing shot — jendela dengan hujan
       [Scene 2 image: Desk with laptop, warm light]
       Scene 2: Close-up — laptop, kopi, notebook
       [... more scenes ...]

       [✅ Approve]  [🔄 Regenerate]  [✏️ Edit]
```

### Output yang User Dapat
1. **Deep analysis report** — AI-powered insights, bukan cuma statistik
2. **Clone plan** — 10 video ideas siap produksi
3. **Storyboard** — Visual preview untuk setiap video
4. **Music** — Background music matching style channel
5. **Voiceover** — Narration jika diperlukan
6. **Auto-publish** — Post ke YouTube/TikTok/Facebook

---

## 📋 SCENARIO 2: "Gue butuh 30 video affiliate minggu ini"

### User Goal
Promosi 10 produk Shopee → butuh 3 video per produk → total 30 video

### Conversation Flow

```
USER:  /voice Diskon 50% skincare Korea! Hanya hari ini di Shopee!

BOT:   🎙️ Generating voiceover...
       🗣️ Voice: id-ID-GadisNeural (Indonesia Female)
       [plays audio]

       ✅ Voiceover generated!
       [🔊 Play]  [🔄 Regenerate]
       Mau pakai di video?
       [🎬 Tambah ke Video]

USER:  /music upbeat motivational product promo

BOT:   🎶 Generating: upbeat motivational product promo music...
       [generates music]

BOT:   ✅ Background music generated!
       [🎵 Play]  [🔁 Buat Looping Video]

USER:  [taps: 🔁 Buat Looping Video]

BOT:   🔁 Pilih visual type:
       [🌊 Gradient]  [⭐ Stars]  [🌊 Waves]
       [🎨 Solid]  [🖼️ Image]

USER:  [taps: 🌊 Gradient]

BOT:   🔁 Visual type: gradient
       Kirim file audio (.mp3/.wav) yang mau dijadikan looping video.

USER:  [sends audio file]

BOT:   🔁 Downloading audio & creating loop...
       🎨 Visual: gradient
       ⏳ Proses ini butuh beberapa menit...

BOT:   ✅ Looping video created!
       [sends 60-minute looping video]
       🔁 Looping video (60 min) — gradient

USER:  /publish

BOT:   📤 Pilih platform:
       [📘 Facebook]  [🐦 X/Twitter]  [📸 Instagram]
       [🎵 TikTok]  [📺 YouTube]

USER:  [taps: 📘 Facebook]

BOT:   📤 Posting ke Facebook...
       🕵️ CloakBrowser: 5 profiles tersedia
       [📤 Post Semua]  [📋 Pilih Profile]
```

---

## 📋 SCENARIO 3: "Gue mau bikin channel dari nol"

### User Goal
Punya ide channel → butuh konten pertama → mulai posting

### Conversation Flow

```
USER:  /start

BOT:   🎬 Vilona Content Factory

       Halo Creator! Saya AI content assistant kamu.

       Commands:
       🎵 /suno <prompt> — Generate musik AI
       🎙️ /voice <text> — Buat voiceover
       🎶 /music <prompt> — Background music
       🔁 /loop — Buat video loop dari audio
       📊 /analyze <url> — Analisa channel YT/TikTok
       📤 /publish — Posting ke social media
       📋 /storyboard — Visual storyboard

       Ketik command untuk mulai! 🚀

USER:  /suno chill lo-fi beats untuk belajar

BOT:   🎵 Generating: chill lo-fi beats untuk belajar
       ⏳ Proses 1-2 menit...

BOT:   ✅ Music generated!
       [🎵 Plays: lofi_chill_30s.mp3]
       [🔁 Buat Looping Video]  [🔄 Regenerate]

USER:  /storyboard Lofi study beats dengan visual hujan di jendela,
       aesthetic kafe, warm lighting, 4 scenes

BOT:   🎨 Generating storyboard...
       [4 scene images generated]

BOT:   Scene 1: Wide shot — kafe aesthetic, hujan di jendela
       [image]
       Scene 2: Close-up — laptop dan kopi
       [image]
       Scene 3: Medium — buku terbuka, lampu warm
       [image]
       Scene 4: Wide — sudut kafe, hujan makin deras
       [image]

       [✅ Approve & Generate Video]  [🔄 Regenerate]  [✏️ Edit]
```

---

## 🎯 FITUR & COMMANDS SUMMARY

| Command | Input | Output | User Benefit |
|---------|-------|--------|--------------|
| `/analyze <url>` | URL channel YouTube/TikTok | Deep analysis + AI insights | Riset kompetitor tanpa effort |
| `/clone <url>` | URL channel | 10 video ideas siap produksi | Clone strategi yang sudah terbukti |
| `/suno <prompt>` | Deskripsi musik | Audio file (30s-3min) | Background music gratis |
| `/voice <text>` | Text untuk voiceover | Audio file (MP3) | Voiceover profesional gratis |
| `/music <prompt>` | Deskripsi musik | Audio file | Alternative music gen |
| `/loop` | Audio file + visual type | Looping video (60min) | Video long-form untuk YouTube |
| `/storyboard <desc>` | Deskripsi konten | 4 scene images | Visual planning sebelum produksi |
| `/publish` | Platform selection | Auto-post ke sosmed | Distribusi otomatis |

---

## 📊 USER JOURNEY MAP

```
DAY 1: Setup
├── /start → Kenalan dengan bot
├── /analyze @kompetitor → Riset niche
└── /clone → Dapat 10 video ideas

DAY 2-3: Produksi Batch 1
├── /suno → Generate 3 musik
├── /voice → Generate 5 voiceover
├── /loop → Buat 3 looping video
└── /storyboard → Preview visual

DAY 4: Distribusi
├── /publish → Post ke YouTube (3 video)
├── /publish → Post ke TikTok (3 video)
└── /publish → Post ke Facebook (3 video)

DAY 5-7: Monitor & Iterasi
├── Analisa performa video pertama
├── /analyze → Riset kompetitor lagi
├── /clone → Generate batch berikutnya
└── Repeat...

HASIL 30 HARI:
├── 30+ video diproduksi
├── 150+ post ke semua platform
├── 100K-500K total views
└── Monetisasi mulai masuk
```

---

## 🔧 TECHNICAL ARCHITECTURE (User tidak perlu tahu ini)

```
User (Telegram)
    │
    ▼
@vilonacontentbot (Telegraf — src/content-bot.ts)
    │
    ├── /analyze, /clone ──→ Python API (port 8767)
    │                           │
    │                           ├── ChannelAnalyzer + yt-dlp
    │                           ├── OmniRoute LLM (AI analysis)
    │                           └── Clone Plan Generator
    │
    ├── /suno, /music ────→ Python API
    │                           ├── SunoClient
    │                           └── MusicGenerator + FFmpeg
    │
    ├── /voice ───────────→ Python API
    │                           └── TTSEngine (Edge TTS)
    │
    ├── /loop ────────────→ Python API
    │                           └── LoopingEngine + FFmpeg
    │
    ├── /storyboard ──────→ Python API
    │                           └── StoryboardEngine + OmniRoute
    │
    └── /publish ─────────→ Python API
                                └── CloakBrowser CDP (43+ profiles)
```

---

## 💰 PRICING MODEL (Saran)

| Tier | Harga/bulan | Credits | Fitur |
|------|-------------|---------|-------|
| **Free** | Rp 0 | 10 credits | /voice, /suno (demo) |
| **Starter** | Rp 49K | 100 credits | Semua fitur, 1 platform |
| **Pro** | Rp 149K | 500 credits | Semua fitur, semua platform, /clone |
| **Agency** | Rp 499K | 2000 credits | Batch mode, 50 akun, priority |

1 credit = 1 action (1 voiceover = 1, 1 video = 5, 1 clone plan = 10)

---

**One bot. Every content need. Zero editing skills required.** 🎬
