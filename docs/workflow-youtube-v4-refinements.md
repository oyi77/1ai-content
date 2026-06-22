# WORKFLOW v4.0 — REFINEMENTS & IMPLEMENTATION PLAN
## Appendix ke workflow-youtube-v4-niche-agnostic.md

**Tujuan:** Memperdalam v4 workflow dengan: cost model, error recovery, copyright risk, quality gates, scaling math, testing strategy, metrics/KPIs, YouTube ToS compliance (termasuk celah IP/AdSense), dan implementation plan yang mapped ke stack yang ada (Telegraf bot + Fastify backend + EJS frontend).

---

## 1. YOUTUBE ToS COMPLIANCE — BATASAN & CELAH

### 1.1 Channel Limits

| Limit | Angka | Sumber |
|---|---|---|
| Channel per Google Account | **100** (via Brand Account) | YouTube official |
| AdSense account per individu | **1** | Google AdSense policy |
| Channel per AdSense account | **Unlimited** (multi-channel link) | Standard practice |
| Video upload per hari per channel | **~100** (soft limit, bisa naik) | YouTube support |
| YouTube Data API v3 quota | **10.000 units/hari** (default) | Google Cloud |
| Upload video = API cost | **1.600 units** per upload | YouTube API docs |
| Video durasi max (verified) | **12 jam** atau **256GB** | YouTube |
| Video durasi max (unverified) | **15 menit** | YouTube |

### 1.2 IP & Device Tracking — Celah & Resiko

```
⚠️ YANG HARUS DIPAHAMI:
YouTube TRACKING secara aktif:
- IP address yang digunakan untuk login/upload
- Device fingerprint (browser, OS, screen resolution)
- Cookie dan session data
- Google account association patterns
```

**Resiko multi-channel dari IP yang sama:**
- YouTube **TIDAK secara eksplisit melarang** multi-channel dari IP yang sama
- TAPI: jika 1 channel kena strike/termination, YouTube **bisa** cross-reference IP/device untuk flag channel lain
- **Best practice:** isolasi per channel group, bukan per individual channel

**Strategi isolasi yang realistis:**

```yaml
isolation_strategy:
  # TIDAK PERLU: 1 IP per channel (overkill, mahal, kompleks)
  # YANG REALISTIS: group channel per "operator identity"

  approach: "identity_grouping"
  description: >
    Setiap "identity group" = 1 Google account + 1 IP range + 1 AdSense.
    Channel dalam group yang sama = share risk. Channel beda group = terisolasi.

  groups:
    group_A_indonesia:
      google_account: "gmail_folklore_id@gmail.com"
      adsense: "pub-1234567890"
      channels: ["channel_folklore_id", "channel_sejarah_id"]
      ip_range: "server_ip_1"  # dari VPS/hosting
      risk_level: "shared"  # jika 1 kena, semua kena

    group_B_usa:
      google_account: "gmail_music_us@gmail.com"
      adsense: "pub-0987654321"  # BISA sama dengan group_A (1 AdSense per person)
      channels: ["channel_lofi_us", "channel_ambient_us"]
      ip_range: "server_ip_2"  # beda IP dari group_A
      risk_level: "shared within group, isolated from group_A"

  # CELAH: YouTube tidak enforce strict 1-IP-per-channel.
  # Yang dilihat: pattern suspicious (misal: 50 channel baru dalam 1 hari dari IP sama).
  # Yang aman: gradual scaling, beda upload times, beda content style.
```

**Hard limits yang TIDAK bisa di-bypass:**

| Limit | Consequence jika dilanggar |
|---|---|
| 1 AdSense per person | Semua AdSense account di-banned |
| Reused content (re-upload) | Channel demonetized |
| Inauthentic content (mass-produced) | Channel demonetized |
| Non-disclosure AI content | 3-strike → permanent YPP removal |
| Spam/automation (bot upload) | Channel terminated |
| Copyright strikes (3x) | Channel permanently deleted |

### 1.3 AI Content Compliance — Celah & Strategy

**YouTube "Inauthentic Content" Policy (update Juli 2025):**

```
YANG BOLEH:
✅ AI sebagai TOOL untuk enhance storytelling
✅ AI-generated visuals sebagai ILUSTRASI untuk narasi original
✅ AI voice synthesis sebagai NARATOR untuk script yang di-research
✅ AI music sebagai BACKGROUND AUDIO
✅ Template-based production SELAMA ada variasi yang meaningful

YANG TIDAK BOLEH:
🚫 Mass-produced video tanpa variasi
🚫 Template-clone dimana hanya judul yang berubah
🚫 Re-upload konten orang lain dengan edit minimal
🚫 AI-generated content tanpa disclosure
🚫 Faceless slideshow dengan generic AI voiceover tanpa value-add
```

**Strategy compliance untuk workflow ini:**

```yaml
compliance_strategy:
  disclosure:
    requirement: "WAJIB set 'altered or synthetic content' toggle di YouTube Studio"
    implementation: "Publisher agent harus set flag ini via API saat upload"
    api_field: "selfDeclaredMadeForKids" # YouTube API belum punya field spesifik untuk AI disclosure
    workaround: "Manual step di YouTube Studio setelah upload (bisa di-automate via browser automation)"
    penalty_if_skipped: "3-strike → permanent YPP removal"

  originality_proof:
    requirement: "Bukti meaningful human input"
    implementation:
      - Script di-research dari multiple sources (bukan copy-paste)
      - Narasi punya angle/perspective yang unik per video
      - Visual di-generate custom per cerita (bukan template yang sama)
      - Thumbnail di-generate per video (bukan template statis)
    storage: "Proof folder di DB — simpan script drafts, research sources, generation prompts"

  anti_slop:
    requirement: "Hindari pattern yang terlihat mass-produced"
    implementation:
      - Variasi opening hook (jangan selalu "Tahukah kamu...")
      - Variasi visual style per video (jangan pakai style yang sama persis)
      - Variasi durasi (jangan semua 15 menit tepat)
      - Variasi upload time (±30 menit random dari slot)
      - Jangan upload >3 video per hari per channel
    monitoring: "Agent harus cek similarity score antar video terakhir — jika >70%, skip dan generate ulang"

  music_specific_compliance:
    copyright:
      ai_generated: "AMAN — AI-generated music = kamu punya hak (tergantung ToS provider)"
      royalty_free: "AMAN — pastikan lisensi komersial valid"
      cover_remix: "BERISIKO — Content ID bisa claim, perlu manual dispute"
      public_domain: "AMAN — pastikan benar-benar public domain"
    content_id_risk:
      description: "YouTube Content ID auto-scans audio. False positive bisa terjadi bahkan untuk AI music."
      mitigation:
        - "Pakai provider yang jamin no Content ID match (Suno, Udio)"
        - "Simpan proof of generation (prompt, timestamp, provider receipt)"
        - "Siapkan dispute template untuk false positive"
    reused_content_risk:
      description: "Music compilation = high risk untuk 'reused content' flag"
      mitigation:
        - "Setiap mix harus punya unique visual (bukan same loop untuk semua video)"
        - "Tambahkan value-add: tracklist, timestamps, description yang detailed"
        - "Jangan re-upload mix yang sama dengan judul berbeda"
```

### 1.4 AdSense Strategy — Revenue Optimization

```yaml
adsense_strategy:
  account_structure:
    rule: "1 AdSense per person — TIDAK bisa punya lebih"
    multi_channel: "Banyak channel → 1 AdSense → revenue teragregasi"
    tracking: "Wajib pakai YouTube Analytics per channel (AdSense tidak breakdown per channel)"

  ypp_requirements:
    subscribers: 1000
    watch_hours: 4000 (12 bulan terakhir) ATAU shorts_views: 10jt (90 hari)
    compliance: "Tidak ada active strikes"

  revenue_estimation:
    # Berdasarkan CPM tiers dari FASE 0B
    tier_S_usa_uk:
      cpm_range: "$15-40"
      estimated_rpm: "$8-20"  # RPM = revenue per 1000 views (lebih rendah dari CPM)
      monthly_views_target: 100000
      monthly_revenue_estimate: "$800-2000"

    tier_A_europe:
      cpm_range: "$8-15"
      estimated_rpm: "$4-8"
      monthly_views_target: 100000
      monthly_revenue_estimate: "$400-800"

    tier_D_indonesia:
      cpm_range: "$0.5-2"
      estimated_rpm: "$0.3-1"
      monthly_views_target: 100000
      monthly_revenue_estimate: "$30-100"

  payout_threshold: "$100"  # AdSense minimum payout
  payment_cycle: "Monthly, around 21st-26th"
```

---

## 2. COST MODEL — BIAYA PER VIDEO

### 2.1 Cost Breakdown per Video Component

```yaml
cost_per_video:
  # Pipeline A: NARRATED_SLIDESHOW

  script_writing:
    tool: "LLM (Claude/GPT)"
    cost_per_script: "$0.05-0.15"  # ~2000-5000 tokens output
    notes: "Bisa turun dengan smaller model untuk draft, bigger untuk polish"

  voice_synthesis:
    tool: "TTS API (ElevenLabs / Azure / Google TTS)"
    cost_per_minute: "$0.01-0.30"  # tergantung provider & quality
    tier_1_15min: "$0.15-4.50"
    tier_2_30min: "$0.30-9.00"
    tier_3_60min: "$0.60-18.00"
    best_value: "ElevenLabs Starter ($5/bulan, 30 menit) atau Azure TTS ($0.016/min)"

  image_generation:
    tool: "DALL-E / Stable Diffusion / Midjourney API"
    images_per_video: "10-30"  # tergantung durasi
    cost_per_image: "$0.02-0.08"  # DALL-E 3 = $0.04/image
    tier_1_total: "$0.20-2.40"
    tier_2_total: "$0.40-4.80"
    tier_3_total: "$0.80-9.60"
    self_hosted_option: "Stable Diffusion di GPU server = $0/image (listrik/compute only)"

  video_gen_opening:
    tool: "text-to-video (Kling / Wan / Runway)"
    duration: "60 detik"
    cost: "$0.10-1.00"  # tergantung provider
    notes: "Hanya 1 video per produksi — cost terkontrol"

  thumbnail_generation:
    tool: "DALL-E / Stable Diffusion"
    cost: "$0.02-0.08"
    notes: "1 image per video"

  seo_research:
    tool: "LLM + web search"
    cost: "$0.02-0.05"
    notes: "Minimal cost"

  video_assembly:
    tool: "FFmpeg (self-hosted)"
    cost: "$0.00"  # compute only
    notes: "FFmpeg gratis, butuh server CPU/GPU"

  # TOTAL per video (Pipeline A):
  total_pipeline_a:
    tier_1_15min: "$0.65-8.20"
    tier_2_30min: "$1.10-17.50"
    tier_3_60min: "$1.90-33.00"
    realistic_estimate: "$2-5 per video (dengan self-hosted SD + ElevenLabs + Kling)"

  # Pipeline B: MUSIC_VISUALIZER

  music_generation:
    tool: "Suno / Udio / self-hosted"
    cost_per_track: "$0.00-0.50"
    suno_pro: "$10/bulan = 500 lagu = $0.02/lagu"
    self_hosted: "$0.00 (compute only)"

  visual_generation:
    tool: "Stable Diffusion loop / ambient slideshow"
    cost: "$0.00-0.50"  # self-hosted = gratis
    notes: "Bisa reuse visual yang sama dengan variasi kecil"

  assembly:
    tool: "FFmpeg"
    cost: "$0.00"

  # TOTAL per video (Pipeline B):
  total_pipeline_b:
    with_suno: "$0.02-0.52"
    self_hosted: "$0.00-0.10"
    realistic_estimate: "$0.05-0.30 per video"
```

### 2.2 Monthly Cost Projection

```yaml
monthly_cost_projection:
  # Asumsi: 5 channel aktif, masing-masing upload 1 video/hari

  scenario_conservative:
    channels: 5
    videos_per_day: 1  # per channel
    days: 30
    total_videos: 150
    avg_cost_per_video: "$1.50"  # mix narrated + music
    api_costs: "$225"
    infrastructure: "$50"  # server, Redis, PostgreSQL
    ai_tools_subscriptions: "$50"  # ElevenLabs, Suno, dll
    total_monthly: "$325"

  scenario_aggressive:
    channels: 15
    videos_per_day: 2
    days: 30
    total_videos: 900
    avg_cost_per_video: "$1.00"  # economies of scale
    api_costs: "$900"
    infrastructure: "$150"
    ai_tools_subscriptions: "$150"
    total_monthly: "$1,200"

  break_even:
    # Dengan CPM rata-rata $5 (mix tier S-D)
    # Revenue per 1000 views = $5 CPM → $5/1000 views
    # Butuh 65,000 views/bulan untuk break even ($325 cost)
    # Atau 240,000 views/bulan untuk aggressive ($1,200 cost)
    conservative_views_needed: 65000
    aggressive_views_needed: 240000
    realistic_timeline: "3-6 bulan per channel untuk reach 65K views/bulan"
```

---

## 3. ERROR RECOVERY — FAILURE HANDLING PER SUB-AGENT

### 3.1 Pipeline Failure Matrix

```yaml
error_recovery:
  # Setiap sub-pipeline punya failure mode dan recovery strategy

  script_writer_failure:
    failure_modes:
      - "LLM timeout / rate limit"
      - "Output tidak sesuai format"
      - "Script terlalu pendek/panjang"
    recovery:
      retry: 3  # exponential backoff
      fallback: "Gunakan template script dengan fill-in dari idea summary"
      escalation: "Notif Telegram jika retry habis"
    partial_save: "Simpan draft di DB — bisa resume dari checkpoint"

  voice_synthesis_failure:
    failure_modes:
      - "TTS API timeout"
      - "Voice quality jelek (robotic)"
      - "Audio file corrupt"
    recovery:
      retry: 3
      fallback_provider: "Switch dari ElevenLabs → Azure TTS → Google TTS"
      quality_check: "Validasi audio duration matches script length ±10%"
    partial_save: "Simpan script — voice bisa di-generate ulang tanpa script ulang"

  video_gen_failure:
    failure_modes:
      - "Text-to-video API timeout (video gen = lambat)"
      - "Output tidak sesuai prompt"
      - "Video file corrupt / too large"
    recovery:
      retry: 2  # video gen = mahal, jangan retry terlalu banyak
      fallback: "SKIP opening AI video → langsung masuk slideshow-only mode"
      quality_check: "Validasi video duration, resolution, file size"
    partial_save: "Simpan narasi + slideshow — opening bisa ditambah nanti"

  image_generation_failure:
    failure_modes:
      - "Image gen API timeout"
      - "NSFW filter trigger (false positive)"
      - "Image tidak relevan dengan prompt"
    recovery:
      retry: 3
      fallback: "Gunakan stock image dari Unsplash API (free)"
      quality_check: "Validasi image resolution ≥ 1280x720"
    partial_save: "Simpan subset gambar yang berhasil — slideshow tetap jalan dengan yang ada"

  music_generation_failure:
    failure_modes:
      - "Suno/Udio API timeout"
      - "Generated music kena Content ID (false positive)"
      - "Audio quality jelek"
    recovery:
      retry: 2
      fallback: "Switch ke royalty-free library (YouTube Audio Library)"
      content_id_check: "Pre-scan audio sebelum upload ke YouTube"
    partial_save: "Simpan visual — music bisa di-swap tanpa render ulang visual"

  assembly_failure:
    failure_modes:
      - "FFmpeg crash (memory/disk)"
      - "Audio-video sync issue"
      - "Output file terlalu besar (>256GB)"
    recovery:
      retry: 2
      fallback: "Re-render dengan lower quality settings"
      quality_check: "Validasi file size, duration, audio sync"
    partial_save: "Simpan semua component — assembly bisa di-retry kapan saja"

  youtube_upload_failure:
    failure_modes:
      - "API quota exceeded (10K units/hari)"
      - "OAuth token expired"
      - "Video rejected (copyright, community guidelines)"
      - "Network timeout"
    recovery:
      retry: 3  # exponential backoff
      quota_handling: "Jika quota habis → queue untuk besok, jangan force upload"
      token_refresh: "Auto-refresh OAuth token sebelum expired"
      rejection_handling: "Simpan rejection reason → notif Telegram → manual review"
    partial_save: "Video package tetap di queue — tidak hilang"
```

### 3.2 Circuit Breaker Pattern

```yaml
circuit_breaker:
  description: "Jika 1 provider gagal terus-menerus, switch ke fallback otomatis"

  rules:
    voice_synthesis:
      failure_threshold: 5  # 5 gagal berturut-turut
      reset_timeout: "30 menit"
      fallback_chain: ["elevenlabs", "azure_tts", "google_tts"]

    image_generation:
      failure_threshold: 10
      reset_timeout: "1 jam"
      fallback_chain: ["dalle3", "stable_diffusion_api", "unsplash_stock"]

    video_generation:
      failure_threshold: 3
      reset_timeout: "2 jam"
      fallback_chain: ["kling", "wan", "skip_opening"]

    music_generation:
      failure_threshold: 5
      reset_timeout: "30 menit"
      fallback_chain: ["suno", "udio", "royalty_free_library"]
```

---

## 4. QUALITY GATES — VALIDASI SEBELUM PUBLISH

### 4.1 Technical Quality Checks

```yaml
quality_gates:
  # Setiap video package WAJIB pass semua check sebelum masuk publish queue

  audio_checks:
    format: "mp3 / wav / aac"
    sample_rate: "44100 Hz minimum"
    bitrate: "128 kbps minimum"
    loudness: "-14 LUFS ± 2 (YouTube recommended)"
    peak: "-1 dBTP maximum"
    silence_check: "Tidak ada silence > 3 detik di awal/akhir"
    duration_match: "Audio duration = script expected duration ±10%"
    tool: "FFmpeg loudnorm filter + custom validation script"

  video_checks:
    resolution: "1920x1080 minimum (1080p)"
    framerate: "24-30 fps"
    codec: "H.264 (compatibility) atau H.265 (size efficiency)"
    container: "MP4"
    max_file_size: "128 GB (YouTube limit) — practical: < 2 GB"
    duration_match: "Video duration = audio duration ±2 detik"
    audio_sync: "Audio-video sync check di 3 titik (awal, tengah, akhir)"
    tool: "FFprobe + custom validation"

  thumbnail_checks:
    resolution: "1280x720 minimum"
    aspect_ratio: "16:9"
    file_size: "< 2 MB"
    format: "PNG / JPG"
    text_readability: "Text readable di 168x94px (mobile preview size)"
    tool: "Sharp/image processing + custom validation"

  seo_checks:
    title:
      length: "≤ 100 characters"
      has_entity: "MUST contain specific entity name"
      no_clickbait_mismatch: "Title matches actual content"
    description:
      length: "≥ 200 characters"
      has_keywords: "MUST contain relevant keywords"
      has_timestamps: "Recommended untuk video > 10 menit"
    tags:
      count: "15-30 tags"
      has_broad: "≥ 3 broad tags (genre, category)"
      has_longtail: "≥ 5 long-tail tags (specific topic)"
    tool: "Custom validation script"

  content_checks:
    ai_disclosure:
      check: "Video MUST be flagged as 'altered or synthetic content'"
      implementation: "Set via YouTube API metadata OR manual YouTube Studio toggle"
    similarity_check:
      check: "Video similarity vs last 10 uploads < 70%"
      implementation: "Compare script text + visual hashes + audio fingerprint"
      tool: "Custom similarity scoring"
    copyright_precheck:
      check: "Audio fingerprint scan sebelum upload"
      implementation: "Check against known Content ID database"
      tool: "YouTube Data API content search OR custom fingerprint DB"
```

### 4.2 Quality Gate Implementation

```python
# Pseudocode — mapped ke TypeScript di implementation

def quality_gate(video_package: dict) -> dict:
    results = {
        "passed": True,
        "checks": [],
        "blocking_failures": [],
        "warnings": []
    }

    # 1. Audio checks
    audio = ffprobe(video_package["audio_path"])
    if audio["sample_rate"] < 44100:
        results["blocking_failures"].append("Audio sample rate < 44100 Hz")
    if audio["loudness"] not in range(-16, -12):  # LUFS
        results["warnings"].append(f"Audio loudness {audio['loudness']} LUFS (target: -14)")
    if audio["duration"] < video_package["expected_duration"] * 0.9:
        results["blocking_failures"].append("Audio terlalu pendek")

    # 2. Video checks
    video = ffprobe(video_package["video_path"])
    if video["width"] < 1920 or video["height"] < 1080:
        results["blocking_failures"].append("Video resolution < 1080p")
    if video["file_size"] > 2 * 1024 * 1024 * 1024:  # 2GB
        results["warnings"].append("Video file > 2GB — upload akan lambat")

    # 3. Thumbnail checks
    thumb = image_info(video_package["thumbnail_path"])
    if thumb["width"] < 1280:
        results["blocking_failures"].append("Thumbnail width < 1280px")

    # 4. SEO checks
    seo = video_package["seo_package"]
    if len(seo["title"]) > 100:
        results["blocking_failures"].append("Title > 100 characters")
    if len(seo["tags"]) < 15:
        results["warnings"].append("Tags < 15 — consider adding more")

    # 5. Similarity check
    similarity = check_similarity_vs_recent(video_package, last_n=10)
    if similarity > 0.70:
        results["blocking_failures"].append(f"Similarity {similarity:.0%} vs recent uploads — too high")

    results["passed"] = len(results["blocking_failures"]) == 0
    return results
```

---

## 5. SCALING MATH — KAPASITAS & LIMITS

### 5.1 YouTube API Quota Management

```yaml
api_quota:
  daily_quota: 10000  # units
  upload_cost: 1600    # units per upload
  other_costs:
    get_video_list: 1    # units per request
    get_analytics: 1     # units per request
    update_video: 50     # units per update
    create_playlist: 50  # units per playlist

  daily_capacity:
    max_uploads: 6       # 10000 / 1600 = 6.25
    remaining_for_reads: 400  # 10000 - (6 × 1600)

  practical_schedule:
    # 6 upload/hari = 2 channel × 3 video, atau 6 channel × 1 video
    # Jika punya 15 channel × 1 video/hari = 15 upload = 24,000 units
    # BUTUH: quota increase request ke Google

    channels_per_quota_tier:
      default_10k: "6 channel × 1 video/hari"
      increased_50k: "30 channel × 1 video/hari"
      increased_100k: "60 channel × 1 video/hari"

    quota_increase_request:
      how: "Google Cloud Console → YouTube Data API → Quotas → Request Increase"
      justification: "Content management platform, multiple channels, scheduled uploads"
      typical_approval: "1-2 minggu"
      typical_granted: "50K-100K units/hari"

  quota_monitoring:
    check_interval: "Setiap jam"
    alert_threshold: "80% usage"
    action_on_threshold: "Prioritize upload, defer analytics reads"
    action_on_exceeded: "Queue uploads untuk besok"
```

### 5.2 Infrastructure Scaling

```yaml
infrastructure:
  # Current stack: Node.js + Fastify + PostgreSQL + Redis + BullMQ

  compute_requirements:
    small_scale:  # 1-5 channel
      cpu: "2 vCPU"
      ram: "4 GB"
      storage: "50 GB SSD"
      gpu: "Tidak perlu (pakai API untuk image/video gen)"
      cost: "$20-40/bulan"

    medium_scale:  # 5-15 channel
      cpu: "4 vCPU"
      ram: "8 GB"
      storage: "200 GB SSD"
      gpu: "Optional: 1× T4 untuk self-hosted Stable Diffusion"
      cost: "$80-150/bulan"

    large_scale:  # 15-50 channel
      cpu: "8 vCPU"
      ram: "16 GB"
      storage: "500 GB SSD"
      gpu: "1× A10G untuk self-hosted image/video gen"
      cost: "$200-500/bulan"

  redis_scaling:
    small: "256 MB — cukup untuk 5 channel"
    medium: "1 GB — cukup untuk 15 channel"
    large: "4 GB — cukup untuk 50 channel"
    notes: "Redis dipakai untuk: event bus, job queue, session cache, rate limiter"

  postgresql_scaling:
    small: "Shared CPU, 1 GB RAM — cukup untuk 5 channel"
    medium: "2 vCPU, 4 GB RAM — cukup untuk 15 channel"
    large: "4 vCPU, 8 GB RAM — cukup untuk 50 channel"
    notes: "Yang bikin berat: video_metrics_log (tiap video × 3 check = banyak row)"

  storage_scaling:
    # Video files = paling besar
    avg_video_size: "200 MB"  # 15 menit 1080p
    videos_per_day: 15  # 15 channel × 1 video
    daily_storage: "3 GB"
    monthly_storage: "90 GB"
    retention: "Hapus video dari server setelah upload sukses + verify"
    strategy: "Upload ke YouTube → verify → delete local file → keep metadata di DB"
```

### 5.3 BullMQ Queue Concurrency

```yaml
queue_concurrency:
  # Mapped ke BullMQ workers

  ideation_queue:
    concurrency: 1        # 1 batch per channel, sequential
    rate_limit: "10 per jam"

  production_queue:
    concurrency: 2        # Max 2 video diproduksi paralel (dari v4 spec)
    estimated_time_per_video: "15-45 menit"  # tergantung durasi + provider speed
    daily_throughput: "32-96 video/hari"  # theoretical max

  publish_queue:
    concurrency: 1        # 1 upload per time (YouTube API rate limit)
    rate_limit: "6 per hari"  # API quota constraint
    stagger: "5 menit antar upload"  # avoid suspicious pattern

  monitor_queue:
    concurrency: 5        # bisa check banyak video paralel
    rate_limit: "100 per jam"

  reoptimize_queue:
    concurrency: 2
    rate_limit: "20 per jam"

  quarantine_check_queue:
    concurrency: 1
    rate_limit: "10 per hari"
```

---

## 6. TESTING STRATEGY

### 6.1 Test Layers

```yaml
testing:
  # Mapped ke existing test setup: Jest + Playwright

  unit_tests:
    framework: "Jest (sudah ada di project)"
    target_coverage: "80%"
    what_to_test:
      - "quality_gate functions (audio/video/thumbnail/seo checks)"
      - "quarantine eligibility logic"
      - "triage decision tree"
      - "breakout detection logic"
      - "channel tier upgrade conditions"
      - "cost calculation functions"
      - "API quota tracking"
    mock_strategy: "Mock external APIs (YouTube, TTS, image gen) — test logic only"

  integration_tests:
    framework: "Jest + supertest (sudah ada)"
    what_to_test:
      - "BullMQ job flow: ideation → production → publish"
      - "Database operations: CRUD untuk semua tabel"
      - "Redis event bus: emit → subscribe → process"
      - "Telegram notification delivery (mock bot)"
      - "OAuth token refresh flow"
    mock_strategy: "Mock YouTube API, mock TTS/image APIs — test integration between modules"

  e2e_tests:
    framework: "Playwright (sudah ada) untuk frontend, custom untuk pipeline"
    what_to_test:
      - "Full pipeline: idea → script → voice → video → publish (dengan mock APIs)"
      - "Human gate flow: notification → approve/reject → action"
      - "Quarantine lifecycle: enter → monitor → exit/failed"
      - "Channel transfer flow: detect → notify → confirm → transfer"
      - "Error recovery: inject failure → verify retry → verify fallback"
    mock_strategy: "Mock semua external APIs — test full flow end-to-end"

  chaos_tests:
    framework: "Custom scripts"
    what_to_test:
      - "TTS API down → verify fallback chain kicks in"
      - "YouTube API quota exceeded → verify queue behavior"
      - "Redis down → verify graceful degradation"
      - "Database connection lost → verify retry + no data loss"
      - "Simultaneous failures di multiple sub-pipeline"
```

### 6.2 Test Implementation Priority

```yaml
test_priority:
  phase_1_critical:  # Week 1-2
    - "quality_gate unit tests"
    - "triage decision tree tests"
    - "quarantine eligibility tests"
    - "database CRUD tests"

  phase_2_important:  # Week 3-4
    - "BullMQ job flow integration tests"
    - "error recovery integration tests"
    - "API quota tracking tests"
    - "Telegram notification mock tests"

  phase_3_nice_to_have:  # Week 5-6
    - "Full pipeline E2E tests"
    - "Human gate flow tests"
    - "Chaos tests"
    - "Performance/load tests"
```

---

## 7. METRICS & KPIs

### 7.1 Channel Health Score

```python
def channel_health_score(channel_id: str) -> float:
    """Score 0-100 — higher = healthier channel"""
    channel = get_channel(channel_id)
    recent_videos = get_videos_last_n_days(channel_id, days=30)

    scores = {
        # 25 points: Watch time trend
        "watch_time_trend": calculate_trend(
            get_watch_hours(channel_id, days=30),
            get_watch_hours(channel_id, days=60, offset=30)
        ) * 25,  # positive trend = full points

        # 25 points: CTR average
        "ctr": min(avg_ctr(recent_videos) / 0.08, 1.0) * 25,  # 8% CTR = max

        # 20 points: AVD (Average View Duration)
        "avd": min(avg_avd(recent_videos) / 0.50, 1.0) * 20,  # 50% AVD = max

        # 15 points: Subscriber growth
        "subs_growth": min(subs_growth_rate(channel_id) / 0.10, 1.0) * 15,  # 10% growth = max

        # 15 points: Upload consistency
        "consistency": (upload_count_last_30d / expected_upload_count) * 15,
    }

    return sum(scores.values())
```

### 7.2 KPI Dashboard

```yaml
kpis:
  per_channel:
    views_total: "Total views 30 hari"
    views_trend: "% change vs 30 hari sebelumnya"
    watch_hours: "Total watch hours 30 hari"
    avg_ctr: "Average CTR video 30 hari"
    avg_avd: "Average View Duration %"
    subscriber_count: "Current subscribers"
    subscriber_growth: "New subs 30 hari"
    revenue_estimate: "Estimated AdSense revenue"
    video_count: "Video published 30 hari"
    health_score: "Channel health score (0-100)"

  per_video:
    views: "Views setelah 24h, 48h, 10d"
    ctr: "Click-through rate"
    avd_pct: "Average view percentage"
    avd_seconds: "Average view duration (detik)"
    traffic_source: "Search vs Suggested vs External vs Shorts"
    revenue_estimate: "Estimated revenue"

  portfolio_level:
    total_channels: "Jumlah channel aktif"
    total_videos_monthly: "Video diproduksi bulan ini"
    total_views_monthly: "Views across all channels"
    total_revenue_monthly: "Revenue across all channels"
    total_cost_monthly: "Cost (API + infra + subscriptions)"
    roi: "Return on Investment (revenue / cost)"
    break_even_status: "Sudah break even atau belum"
    quarantine_count: "Channel dalam quarantine"
    transfer_candidates: "Channel kandidat transfer ke master"

  targets:
    month_1: "1 channel aktif, 30 video, 10K views, $0 revenue (belum YPP)"
    month_3: "3 channel aktif, 90 video, 100K views, $50-200 revenue"
    month_6: "5 channel aktif, 300 video, 500K views, $500-2000 revenue"
    month_12: "10 channel aktif, 1000 video, 2M views, $2000-8000 revenue"
```

---

## 8. IMPLEMENTATION PLAN — MAPPED TO STACK

### 8.1 Architecture Mapping

```
┌─────────────────────────────────────────────────────────────┐
│                     1ai-hub (Orchestrator)                  │
│                   TypeScript / BullMQ Workers                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Telegram Bot │  │   Fastify    │  │  EJS Frontend│      │
│  │  (Telegraf)   │  │  (Backend)   │  │  (Dashboard) │      │
│  │              │  │              │  │              │      │
│  │ • Commands   │  │ • REST API   │  │ • Dashboard  │      │
│  │ • Notifs     │  │ • Webhooks   │  │ • Reports    │      │
│  │ • Human Gate │  │ • Health     │  │ • Settings   │      │
│  │ • Overrides  │  │ • Metrics    │  │ • Approval UI│      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                 │                 │               │
│  ┌──────┴─────────────────┴─────────────────┴───────┐      │
│  │              BullMQ + Redis (Event Bus)           │      │
│  └──────┬─────────────────┬─────────────────┬───────┘      │
│         │                 │                 │               │
│  ┌──────┴───────┐  ┌──────┴───────┐  ┌──────┴───────┐      │
│  │ 1ai-content  │  │ 1ai-social   │  │  1ai-ads     │      │
│  │ Workers      │  │ Workers      │  │  Workers     │      │
│  │              │  │              │  │              │      │
│  │ • Script Gen │  │ • SEO        │  │ • AdSense    │      │
│  │ • TTS        │  │ • CPM/Niche  │  │ • Revenue    │      │
│  │ • Image Gen  │  │   Research   │  │ • Tracking   │      │
│  │ • Video Gen  │  │ • Distribute │  │ • ROI Calc   │      │
│  │ • Assembly   │  │              │  │              │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │           PostgreSQL (Prisma ORM)                    │  │
│  │  channel_registry │ published_videos │ idea_backlog  │  │
│  │  video_metrics    │ breakout_clusters│ quarantine_log│  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 Module Structure (mapped ke existing src/)

```
src/
├── commands/              # Telegram bot commands (existing)
│   ├── youtube/           # NEW: YouTube workflow commands
│   │   ├── channel.ts     # /channel_add, /channel_list, /channel_status
│   │   ├── video.ts       # /video_approve, /video_reject, /video_edit
│   │   ├── quarantine.ts  # /quarantine_status, /quarantine_exit
│   │   └── report.ts      # /report_weekly, /report_channel
│   └── ...
│
├── services/              # Business logic (existing)
│   ├── youtube/           # NEW: YouTube workflow services
│   │   ├── niche-research.service.ts    # FASE 0B
│   │   ├── ideation.service.ts          # FASE 1
│   │   ├── production.service.ts        # FASE 2 (orchestrator)
│   │   ├── script-writer.service.ts     # FASE 2A
│   │   ├── voice-synthesis.service.ts   # FASE 2B
│   │   ├── visual-assembly.service.ts   # FASE 2C
│   │   ├── music-source.service.ts      # FASE 2B-1
│   │   ├── thumbnail.service.ts         # FASE 2D
│   │   ├── seo-optimizer.service.ts     # FASE 2E
│   │   ├── publisher.service.ts         # FASE 3
│   │   ├── monitor.service.ts           # FASE 4
│   │   ├── triage.service.ts            # FASE 4B
│   │   ├── breakout-analyst.service.ts  # FASE 5
│   │   ├── reoptimizer.service.ts       # FASE 5B
│   │   ├── scale-manager.service.ts     # FASE 6
│   │   ├── quarantine.service.ts        # FASE 7
│   │   ├── quality-gate.service.ts      # Quality checks
│   │   ├── cost-tracker.service.ts      # Cost tracking
│   │   └── youtube-api.service.ts       # YouTube Data API wrapper
│   └── ...
│
├── workers/               # BullMQ workers (existing)
│   ├── youtube/           # NEW: YouTube workflow workers
│   │   ├── ideation.worker.ts
│   │   ├── production.worker.ts
│   │   ├── publish.worker.ts
│   │   ├── monitor.worker.ts
│   │   ├── triage.worker.ts
│   │   ├── optimize.worker.ts
│   │   ├── reoptimize.worker.ts
│   │   ├── quarantine.worker.ts
│   │   └── niche-research.worker.ts
│   └── ...
│
├── routes/                # Fastify routes (existing)
│   ├── youtube/           # NEW: YouTube API routes
│   │   ├── channels.route.ts     # CRUD channels
│   │   ├── videos.route.ts       # Video management
│   │   ├── reports.route.ts      # Analytics & reports
│   │   ├── approvals.route.ts    # Human gate approvals
│   │   └── health.route.ts       # Pipeline health
│   └── ...
│
├── views/                 # EJS templates (existing)
│   ├── youtube/           # NEW: YouTube dashboard views
│   │   ├── dashboard.ejs         # Main dashboard
│   │   ├── channel-detail.ejs    # Per-channel detail
│   │   ├── video-list.ejs        # Video list + status
│   │   ├── approval.ejs          # Human gate approval page
│   │   ├── quarantine.ejs        # Quarantine status
│   │   └── reports.ejs           # Weekly/monthly reports
│   └── ...
│
├── config/                # Configuration (existing)
│   ├── youtube.config.ts  # NEW: YouTube workflow config
│   ├── niche-verticals.ts # NEW: Niche vertical definitions
│   └── cost-model.ts      # NEW: Cost configuration
│
├── types/                 # TypeScript types (existing)
│   ├── youtube.types.ts   # NEW: YouTube workflow types
│   └── ...
│
└── utils/                 # Utilities (existing)
    ├── youtube/           # NEW: YouTube utilities
    │   ├── quota-tracker.ts      # API quota management
    │   ├── content-checker.ts    # Similarity & copyright checks
    │   ├── audio-validator.ts    # Audio quality validation
    │   └── video-validator.ts    # Video quality validation
    └── ...
```

### 8.3 Prisma Schema Additions

```prisma
// Tambah ke schema.prisma yang sudah ada

model ChannelRegistry {
  id                String    @id @default(cuid())
  channelId         String    @unique @map("channel_id")
  gmailAccount      String?   @map("gmail_account")
  adsensePubId      String?   @map("adsense_pub_id")
  nicheVertical     String    @map("niche_vertical")
  nicheName         String?   @map("niche_name")
  productionFormat  String    @map("production_format")
  targetCountry     String?   @map("target_country")
  targetLanguage    String?   @map("target_language")
  cpmTier           String    @default("tier_D") @map("cpm_tier")
  ytOauthToken      String?   @map("yt_oauth_token") // encrypted
  tier              String    @default("tier_1_cold_start")
  totalPublished    Int       @default(0) @map("total_published")
  channelAgeDays    Int       @default(0) @map("channel_age_days")
  trafficStatus     String    @default("unproven") @map("traffic_status")
  isMasterChannel   Boolean   @default(false) @map("is_master_channel")
  masterChannelId   String?   @map("master_channel_id")
  trafficScore      Float?    @map("traffic_score")
  quarantineStarted DateTime? @map("quarantine_started")
  createdAt         DateTime  @default(now()) @map("created_at")
  setupComplete     Boolean   @default(false) @map("setup_complete")

  publishedVideos   PublishedVideo[]
  ideas             IdeaBacklog[]
  metrics           VideoMetricsLog[]

  @@map("channel_registry")
}

model IdeaBacklog {
  id               String    @id @default(uuid())
  channelId        String    @map("channel_id")
  channel          ChannelRegistry @relation(fields: [channelId], references: [channelId])
  nicheVertical    String?   @map("niche_vertical")
  productionFormat String?   @map("production_format")
  batchId          String?   @map("batch_id")
  titleDraft       String?   @map("title_draft")
  nicheCategory    String?   @map("niche_category")
  subNiche         String?   @map("sub_niche")
  hookType         String?   @map("hook_type")
  toneVariant      String?   @map("tone_variant")
  summary          String?
  genre            String?
  mood             String?
  visualStyle      String?   @map("visual_style")
  useCase          String?   @map("use_case")
  durationMinutes  Int?      @map("duration_minutes")
  potentialScore   String?   @map("potential_score")
  conflictVersions Boolean   @default(false) @map("conflict_versions")
  breakoutBias     Json?     @map("breakout_bias")
  priority         String    @default("NORMAL")
  status           String    @default("pending")
  createdAt        DateTime  @default(now()) @map("created_at")

  publishedVideo   PublishedVideo?

  @@map("idea_backlog")
}

model PublishedVideo {
  id               String    @id @default(cuid())
  videoId          String    @unique @map("video_id")
  channelId        String    @map("channel_id")
  channel          ChannelRegistry @relation(fields: [channelId], references: [channelId])
  ideaId           String?   @map("idea_id")
  nicheVertical    String?   @map("niche_vertical")
  productionFormat String?   @map("production_format")
  title            String?
  durationMinutes  Int?      @map("duration_minutes")
  tier             String?
  toneVariant      String?   @map("tone_variant")
  publishedAt      DateTime? @map("published_at")
  monitoringStart  DateTime? @map("monitoring_start")
  status           String    @default("monitoring")
  breakoutCluster  String?   @map("breakout_cluster")
  triageDecision   String?   @map("triage_decision")
  triageAt         DateTime? @map("triage_at")

  metrics          VideoMetricsLog[]

  @@map("published_videos")
}

model VideoMetricsLog {
  id          String    @id @default(autoincrement())
  videoId     String    @map("video_id")
  video       PublishedVideo @relation(fields: [videoId], references: [videoId])
  checkAt     String    @map("check_at")
  views       Int?
  ctr         Float?
  avgViewPct  Float?    @map("avg_view_pct")
  avdSeconds  Int?      @map("avd_seconds")
  trafficSrc  Json?     @map("traffic_src")
  recordedAt  DateTime  @default(now()) @map("recorded_at")

  @@map("video_metrics_log")
}

model QuarantineLog {
  id               String    @id @default(autoincrement())
  channelId        String    @map("channel_id")
  action           String
  triggerType      String?   @map("trigger_type")
  channelAgeDays   Int?      @map("channel_age_days")
  trafficDropPct   Float?    @map("traffic_drop_pct")
  recoveryPct      Float?    @map("recovery_pct")
  quarantineMonths Float?    @map("quarantine_months")
  details          Json?
  recordedAt       DateTime  @default(now()) @map("recorded_at")

  @@map("quarantine_log")
}

model NicheCpmResearchLog {
  id              String    @id @default(autoincrement())
  researchDate    DateTime  @default(now()) @map("research_date")
  rawReport       Json?     @map("raw_report")
  cpmSnapshot     Json?     @map("cpm_snapshot")
  nicheAnalysis   Json?     @map("niche_analysis")
  crossNiche      Json?     @map("cross_niche")
  recommendations Json?
  appliedTo       String[]  @map("applied_to")

  @@map("niche_cpm_research_log")
}

model BreakoutCluster {
  id                   String    @id @default(uuid())
  channelId            String?   @map("channel_id")
  nicheVertical        String?   @map("niche_vertical")
  triggerVideoId       String?   @map("trigger_video_id")
  primaryElement       String?   @map("primary_element")
  secondaryElements    Json?     @map("secondary_elements")
  storyType            String?   @map("story_type")
  genreMood            String?   @map("genre_mood")
  toneVariant          String?   @map("tone_variant")
  trafficDriver        String?   @map("traffic_driver")
  bestDurationTier     String?   @map("best_duration_tier")
  active               Boolean   @default(true)
  revisitScheduledAt   DateTime? @map("revisit_scheduled_at")
  createdAt            DateTime  @default(now()) @map("created_at")

  @@map("breakout_clusters")
}

model AgentTaskLog {
  id          String    @id @default(autoincrement())
  agentName   String    @map("agent_name")
  phase       String?
  inputRef    String?   @map("input_ref")
  outputRef   String?   @map("output_ref")
  status      String?
  errorMsg    String?   @map("error_msg")
  startedAt   DateTime? @map("started_at")
  finishedAt  DateTime? @map("finished_at")

  @@map("agent_task_log")
}
```

### 8.4 Implementation Phases

```yaml
implementation_phases:
  # Phase 0: Foundation (Week 1-2)
  phase_0_foundation:
    tasks:
      - "Prisma schema migration (tabel baru)"
      - "YouTube API service wrapper (OAuth, upload, analytics)"
      - "BullMQ queue setup (9 queues sesuai fase)"
      - "Config system (niche verticals, cost model, quality gates)"
      - "Telegram notification templates"
    deliverable: "DB schema + queue infrastructure + YouTube API wrapper"
    testing: "Unit tests untuk config & utility functions"

  # Phase 1: Core Pipeline (Week 3-5)
  phase_1_core_pipeline:
    tasks:
      - "FASE 0B: Niche + CPM research agent (web search + analysis)"
      - "FASE 1: Ideation agent (LLM-based topic generation)"
      - "FASE 2A: Script writer service"
      - "FASE 2B: Voice synthesis service (dengan fallback chain)"
      - "FASE 2C: Visual assembly service (image gen + slideshow)"
      - "FASE 2D: Thumbnail generator"
      - "FASE 2E: SEO optimizer"
      - "Quality gate service"
    deliverable: "Narrated slideshow pipeline end-to-end"
    testing: "Integration tests untuk pipeline flow"

  # Phase 2: Music Pipeline (Week 6-7)
  phase_2_music_pipeline:
    tasks:
      - "FASE 2B-1: Music source service (Suno/Udio + royalty-free)"
      - "FASE 2B-2: Visual generator (ambient slideshow / visualizer)"
      - "FASE 2B-3: Music assembler (audio + visual merge)"
      - "Production router (branch by production_format)"
    deliverable: "Music visualizer pipeline end-to-end"
    testing: "Integration tests untuk music pipeline"

  # Phase 3: Publish + Monitor (Week 8-9)
  phase_3_publish_monitor:
    tasks:
      - "FASE 3: Publisher agent (YouTube upload + scheduling)"
      - "FASE 4: Monitor agent (analytics polling + classification)"
      - "FASE 4B: Triage agent (delete/keep/transfer logic)"
      - "API quota tracker"
    deliverable: "Upload + monitoring + triage operational"
    testing: "E2E tests untuk publish → monitor → triage flow"

  # Phase 4: Optimization + Scale (Week 10-11)
  phase_4_optimization:
    tasks:
      - "FASE 5: Breakout analyst agent"
      - "FASE 5B: Re-optimizer agent"
      - "FASE 6: Scale manager agent"
      - "Cost tracker service"
    deliverable: "Optimization loop operational"
    testing: "Integration tests untuk optimization flow"

  # Phase 5: Quarantine + Dashboard (Week 12-13)
  phase_5_quarantine_dashboard:
    tasks:
      - "FASE 7: Quarantine agent (detection + lifecycle)"
      - "EJS dashboard: channel overview, video list, reports"
      - "Telegram commands: channel management, approval, reports"
      - "Weekly report generator"
    deliverable: "Full workflow operational + dashboard"
    testing: "E2E tests untuk quarantine lifecycle + dashboard"

  # Phase 6: Production Readiness (Week 14-15)
  phase_6_production:
    tasks:
      - "Performance testing (load test queues)"
      - "Security review (OAuth token handling, API key management)"
      - "Monitoring setup (Prometheus metrics, Grafana dashboards)"
      - "Runbook documentation"
      - "Error alerting (Sentry integration)"
    deliverable: "Production-ready system"
    testing: "Full regression test suite"
```

---

## 9. TELEGRAM BOT COMMANDS — USER INTERFACE

```yaml
telegram_commands:
  # Channel Management
  channel_add:
    command: "/yt_channel_add"
    description: "Tambah channel baru ke registry"
    flow: "Bot tanya niche_vertical → target_country → production_format → simpan ke DB"

  channel_list:
    command: "/yt_channels"
    description: "List semua channel + status + tier"

  channel_status:
    command: "/yt_status <channel_id>"
    description: "Detail status 1 channel: tier, traffic, quarantine, recent videos"

  # Video Management
  video_approve:
    command: "/yt_approve <video_id>"
    description: "Approve video untuk publish (human gate)"

  video_reject:
    command: "/yt_reject <video_id> <reason>"
    description: "Reject video (alasan dikirim ke agent untuk revisi)"

  video_edit:
    command: "/yt_edit_title <video_id> <new_title>"
    description: "Edit judul video sebelum publish"

  # Quarantine
  quarantine_status:
    command: "/yt_quarantine"
    description: "List channel dalam quarantine + recovery progress"

  quarantine_exit:
    command: "/yt_quarantine_exit <channel_id>"
    description: "Force exit quarantine (operator override)"

  # Reports
  report_weekly:
    command: "/yt_report"
    description: "Generate weekly report: views, revenue, triage summary"

  report_channel:
    command: "/yt_report <channel_id>"
    description: "Detail report untuk 1 channel"

  # Transfer
  transfer_approve:
    command: "/yt_transfer <channel_id>"
    description: "Approve channel transfer ke master"

  # Research
  research_trigger:
    command: "/yt_research"
    description: "Trigger niche + CPM research secara manual"

  research_results:
    command: "/yt_research_results"
    description: "Lihat hasil research terakhir"
```

---

## 10. CATATAN PENTING — YANG BELUM TER-COVER

```yaml
open_questions:
  - "YouTube API quota increase: berapa yang bisa di-granted? Butuh apply dulu."
  - "AI music copyright: status legal masih abu-abu di beberapa negara. Perlu monitoring."
  - "Channel transfer: proses manual via YouTube Studio. Tidak bisa full automate."
  - "YouTube Shorts: apakah perlu pipeline terpisah? Shorts = format berbeda, algoritma berbeda."
  - "Multi-language TTS: kualitas ElevenLabs untuk bahasa selain Inggris belum tentu bagus."
  - "Video gen cost: text-to-video masih mahal ($0.10-1.00 per 60 detik). Bisa turun drastis dalam 6-12 bulan."
  - "YouTube policy changes: bisa berubah kapan saja. Perlu monitoring aktif."

future_enhancements:
  - "YouTube Shorts pipeline (vertical 9:16, < 60 detik)"
  - "Multi-platform distribution (TikTok, Instagram Reels, Facebook)"
  - "A/B testing: thumbnail variants, title variants"
  - "Audience engagement auto-reply (comment management)"
  - "Community tab posting automation"
  - "YouTube Live integration (music radio streams)"
  - "Revenue optimization: ad placement timing, mid-roll strategy"
```
