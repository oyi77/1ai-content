# WORKFLOW: YouTube Niche Folklore/Sejarah — Multi-Country High-CPM Strategy
**Version:** 3.1 — 1ai-ecosystem Full Automation  
**Tujuan:** Channel YouTube income-stream dari niche folklore/sejarah, dijalankan sepenuhnya oleh AI Agent pipeline dalam 1ai-ecosystem. Target diperluas ke negara-negara dengan CPM tinggi — bukan hanya Indonesia. Intervensi manusia diminimalkan ke gate eksplisit saja.  
**Architecture:** Event-driven agent pipeline. Setiap fase emit event → agent subscriber eksekusi → output masuk ke queue fase berikutnya. Human-in-the-loop hanya di gate yang ditandai `[HUMAN_GATE]`.

---

## ECOSYSTEM INTEGRATION MAP

```
1ai-hub (Brain Layer / Orchestrator)
  ├── 1ai-content       → script writing, narasi AI, voice synthesis, video assembly, thumbnail generation
  ├── 1ai-social        → riset keyword, SEO, distribusi, cross-post, engagement monitoring, CPM research
  ├── 1ai-ads           → AdSense revenue tracking, ROI per video, CPM tracking per country
  └── Telegram Bot      → notifikasi, human gate approval, manual override
       (@berkahkarya-saas-bot / master orchestrator)
```

> ⚠️ `1ai-joki-engine` dan `1ai-reach` sudah di-merge ke `1ai-social`. Semua content generation pipeline ada di `1ai-content`. SEO & distribusi ada di `1ai-social`.

**Event Bus:** Redis pub/sub (channel: `yt_folklore:events`)  
**State Store:** PostgreSQL (schema: `yt_workflow`)  
**Queue:** Redis Streams (`yt_folklore:queue:<phase>`)  
**Scheduler:** Celery Beat (timezone: Asia/Jakarta)

---

## VIDEO FORMAT SPEC — TIERED DURATION STRATEGY

Setiap video di-produce dalam format yang ditentukan berdasarkan fase channel:

```yaml
video_format:
  tier_1_cold_start:
    duration_target: 15      # menit — untuk video pertama / channel baru
    rationale: >
      Durasi optimal saat channel belum punya data watch-time. Cukup panjang untuk 
      masuk YPP watch-hour requirement, tapi tidak terlalu berat diproduksi.
    apply_when: "total_published_videos < 10 OR channel_age_days < 30"

  tier_2_growing:
    duration_target: 30      # menit — setelah ada trafik awal
    rationale: >
      Upgrade durasi saat algo sudah mulai merekomendasikan channel. AVD yang tinggi
      di video 30 menit = sinyal kuat ke algo.
    apply_when: "avg_views_last_5 > 500 AND channel_age_days >= 30"

  tier_3_established:
    duration_target: 60      # menit — saat channel sudah punya breakout
    rationale: >
      Long-form untuk audience yang sudah engaged. Session watch-time sangat tinggi,
      boosts channel-level signals ke YouTube algo.
    apply_when: "breakout_detected == true AND avg_views_last_5 > 2000"
```

---

## VIDEO PRODUCTION SPEC — STRUKTUR KONTEN

```yaml
video_structure:
  segment_1_opening:
    duration_minutes: 1
    type: "AI_GENERATED_VIDEO"          # video asli — bukan slideshow
    description: >
      Menit pertama wajib pakai footage/visual yang di-generate AI (text-to-video model).
      Scene yang paling ikonik atau dramatis dari cerita. Fungsi: hook visual kuat,
      kesan "production value tinggi" saat orang pertama buka video.
    content_rule: "Tampilkan scene paling dramatis — bukan intro channel, langsung cerita"
    tool: "1ai-content → video_gen_module (text-to-video)"

  segment_2_main_body:
    duration: "remaining_duration_after_minute_1"
    type: "NARRATED_SLIDESHOW"
    description: >
      Sisanya boleh slideshow — gambar/ilustrasi yang looping atau berganti sesuai narasi.
      Gambar bisa looping (tidak harus selalu berbeda tiap detik), yang penting narasi mengalir.
    visual_rules:
      - Gambar relevan dengan adegan/tokoh yang sedang dinarasikan
      - Looping gambar diperbolehkan untuk segmen yang sama
      - Transisi: fade atau cut — jangan pakai efek berlebihan
      - Ilustrasi boleh AI-generated (konsisten style per video)
    tool: "1ai-content → slideshow_assembler"

  narration:
    type: "AI_VOICE_TTS"
    style: "cerita mengalir — natural storytelling, bukan robot"
    tone_variants:
      horror: "lambat, bisikan, beri jeda dramatis"
      heroik: "tegas, semangat, tempo naik di klimaks"
      misteri: "penasaran, hati-hati, suspensi"
      romansa_tragis: "lembut, melankolis"
    tool: "1ai-content → voice_synthesis_module"
    sync: "auto-sync narasi ke slide transitions"
```

---

## THUMBNAIL SPEC — SELF-GENERATED CLICKBAIT

```yaml
thumbnail:
  generated_by: "1ai-content → thumbnail_gen_module"
  style: "clickbait — maksimalkan CTR, bukan estetika"

  composition_rules:
    - Wajah ekspresif (shock / takut / marah / sedih) sebagai elemen utama
      — boleh wajah tokoh AI-generated, bukan foto asli orang nyata
    - Teks overlay: MAX 5 kata, ukuran besar, readable di thumbnail 168x94px (mobile preview)
    - Warna: kontras ekstrem — merah/kuning di atas gelap, atau putih di atas hitam
    - Background: gelap dramatis (satu warna atau gradient gelap), bukan warna terang
    - Elemen tambahan opsional: tanda tanya besar, lingkaran merah highlight, panah

  text_formula:
    - Trigger emotion: "RAHASIA", "TERSEMBUNYI", "SEBENARNYA", "TERNYATA", "YANG TAK DICERITAKAN"
    - Spesifik entitas: nama tokoh / nama tempat / nama kerajaan
    - Format: "[TRIGGER_WORD] [ENTITAS]" → contoh: "RAHASIA GELAP MAJAPAHIT" / "YANG SEBENARNYA TERJADI"

  generation_prompt_template: |
    Generate thumbnail YouTube clickbait untuk cerita: {story_title}
    Tone: {tone_variant}
    Elemen utama: wajah ekspresif AI-generated + teks "{thumbnail_text}"
    Warna dominan: gelap dengan aksen {accent_color}
    Ukuran: 1280x720px

  output: thumbnail.png → langsung attach ke video package
```

---

## FASE 0 — Setup Infrastruktur
**Type:** `manual_one_time` — tidak bisa diotomasi penuh (YouTube anti-bot)  
**Status tracking:** Simpan di DB setelah selesai. Phase ini hanya jalan sekali per channel.

| Step | Action | Automatable? |
|---|---|---|
| 0.1 | Buat 1 akun Gmail baru, belum pernah dipakai login YouTube/AdSense lain | ❌ Manual |
| 0.2 | Buat channel YouTube secara manual dari Gmail itu | ❌ Manual (hindari tool auto-create) |
| 0.3 | Lengkapi identitas channel: nama, foto profil, banner, deskripsi, tab "tentang" | ⚠️ AI-assist via 1ai-content (generate copy & asset), upload manual |
| 0.4 | Daftarkan / tautkan ke akun AdSense existing (1 nama penerima = 1 akun AdSense, multi-channel OK) | ❌ Manual |
| 0.5 | Input channel credentials ke `channel_registry` DB — YouTube API OAuth token, channel ID | ✅ Agent mulai kerja setelah ini |

**Schema DB:**
```sql
CREATE TABLE channel_registry (
  channel_id          TEXT PRIMARY KEY,
  gmail_account       TEXT,
  adsense_pub_id      TEXT,
  niche               TEXT DEFAULT 'folklore_id',
  yt_oauth_token      TEXT,            -- encrypted
  tier                TEXT DEFAULT 'tier_1_cold_start',
  total_published     INTEGER DEFAULT 0,
  channel_age_days    INTEGER DEFAULT 0,
  traffic_status      TEXT DEFAULT 'unproven', -- unproven | growing | established | transferred | deleted
  master_channel_id   TEXT,            -- diisi jika channel ini adalah "satelit" yang sudah di-transfer
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  setup_complete      BOOLEAN DEFAULT FALSE
);
```

**OUTPUT:** `setup_complete = TRUE` → emit `channel.ready` → FASE 0B (CPM Research) dan FASE 1 mulai paralel.
---

## FASE 0B — Auto Research: High-CPM Country Targeting
**Agent:** `cpm-research-agent` (via 1ai-hub → 1ai-social)  
**Type:** `recurring` — jalan ulang setiap 30 hari (CPM data berubah per season)  
**Trigger:** `channel.ready` | cron `0 8 1 * *` (tanggal 1 tiap bulan)  
**Queue:** `yt_folklore:queue:cpm_research`

### Tujuan
Channel Indonesia (CPM ~$0.5–2) jauh lebih rendah dari negara berbahasa Inggris atau negara Tier 1.
Strategi: buat **channel terpisah per target country** dengan konten yang disesuaikan bahasa & budaya lokal,
tapi tetap dalam niche folklore/history/mystery yang proven. Agent riset otomatis menentukan:
1. Negara mana yang CPM-nya tinggi dan niches-nya cocok
2. Topik folklore/history lokal yang belum banyak dikover
3. Bahasa konten yang direkomendasikan
4. Jadwal upload optimal per timezone negara target

### High-CPM Country Tiers (seed data — di-refresh otomatis)
```yaml
cpm_tiers_seed:
  tier_S:   # CPM $15–40
    countries: [USA, Canada, Australia, UK, New Zealand]
    language: English
    content_angle: "American folklore, Native American legends, Colonial mysteries, Appalachian myths"

  tier_A:   # CPM $8–15
    countries: [Norway, Sweden, Denmark, Finland, Netherlands, Germany, Switzerland, Austria]
    language: "English (dubbed/subtitled) atau bahasa lokal"
    content_angle: "Norse mythology, Viking history, European castle mysteries, Medieval legends"

  tier_B:   # CPM $5–8
    countries: [France, Spain, Italy, Belgium, Ireland, Japan, South Korea, Singapore]
    language: "English atau bahasa lokal"
    content_angle: "Celtic legends, Roman history mysteries, Japanese yokai/folklore, Korean historical drama"

  tier_C:   # CPM $2–5
    countries: [Brazil, Mexico, UAE, Saudi Arabia, Malaysia]
    language: "Portuguese / Spanish / Arabic / Malay"
    content_angle: "Amazonian myths, Aztec/Mayan mysteries, Arabian Nights real history, Malay folklore"

  tier_D:   # CPM $0.5–2 (baseline Indonesia)
    countries: [Indonesia, India, Philippines, Vietnam, Thailand]
    language: "Local language"
    content_angle: "Nusantara legends, Hindu epic localization, SEA folklore"
```

### Agent Instructions — CPM Research
```
SYSTEM:
Kamu adalah CPM Research Agent untuk strategi multi-country YouTube channel.
Tugas: riset dan update data CPM per negara + identifikasi peluang niche folklore/history
yang belum jenuh di negara-negara high-CPM.

TOOLS yang digunakan:
- Web search: cari CPM data terbaru YouTube per country (source: SocialBlade, Influencer Marketing Hub, 
  creator forums, Reddit r/NewTubers, r/youtube)
- Trend analysis: cari "underserved folklore niche" per negara target
- Competitor gap analysis: cek channel folklore/history yang ada di negara target,
  perhatikan gap topik yang belum banyak dikover

INPUT:
- cpm_tiers_seed: <dari config — dipakai sebagai baseline>
- current_date: <untuk seasonality — CPM naik Q4, turun Q1>
- existing_channels: <list channel yang sudah ada, beserta niche & country target>

TUGAS:
1. Update CPM estimate per tier country (cari data terbaru — data 30 hari ke belakang)
2. Untuk setiap Tier S dan A country, identifikasi:
   a. 3–5 sub-niche folklore/history yang BELUM jenuh (sedikit channel besar)
   b. Estimasi search volume untuk topik tersebut
   c. Bahasa yang direkomendasikan (English vs lokal)
   d. Kompetitor utama yang ada (nama channel + subscriber count)
3. Generate rekomendasi: negara mana yang paling worth dibuka channel baru sekarang
   (kombinasi CPM tinggi + kompetitor sedikit + niche tersedia)
4. Untuk negara yang sudah ada channel-nya: update niche bias untuk batch ideation berikutnya

OUTPUT FORMAT (JSON):
{
  "research_date": "<iso8601>",
  "cpm_snapshot": {
    "USA": { "cpm_usd": 18.5, "trend": "stable", "season_note": "Q4 peak expected" },
    "UK": { "cpm_usd": 12.3, "trend": "rising" },
    ...
  },
  "opportunities": [
    {
      "country": "USA",
      "tier": "S",
      "language": "English",
      "sub_niche": "Appalachian folk horror",
      "search_demand": "HIGH",
      "competition_level": "LOW",
      "top_competitors": ["Channel A (50K subs)", "Channel B (120K subs)"],
      "recommended_topics": ["Jack Tales origins", "Melungeon mystery", "Lost Colony Roanoke real story"],
      "priority_score": 9.2
    }
  ],
  "new_channel_recommendations": [
    {
      "country": "USA",
      "niche": "American folklore & unsolved mysteries",
      "language": "English",
      "estimated_monthly_cpm": 18.5,
      "priority": "OPEN_NOW"
    }
  ],
  "existing_channel_niche_updates": {
    "channel_id_xyz": { "add_topics": [...], "deprioritize_topics": [...] }
  }
}
```

**[HUMAN_GATE]:** Setelah research selesai → kirim summary ke Telegram: top 3 peluang + rekomendasi channel baru. Operator konfirmasi mana yang dibuka. Timeout 24 jam → tidak ada aksi otomatis (buka channel baru = keputusan strategis).

**OUTPUT:** `cpm_research_report` di DB → update `channel_strategy` per country → emit `phase.cpm_research.complete`

### Schema DB
```sql
CREATE TABLE cpm_research_log (
  id               SERIAL PRIMARY KEY,
  research_date    TIMESTAMPTZ DEFAULT NOW(),
  raw_report       JSONB,
  cpm_snapshot     JSONB,
  opportunities    JSONB,
  applied_to       TEXT[]    -- channel_ids yang ter-update dari research ini
);

CREATE TABLE country_channel_map (
  id               SERIAL PRIMARY KEY,
  channel_id       TEXT REFERENCES channel_registry(channel_id),
  target_country   TEXT,
  target_language  TEXT,
  cpm_tier         TEXT,
  niche_focus      TEXT,
  niche_pool       JSONB,    -- niche pool spesifik negara ini
  publish_timezone TEXT,     -- timezone untuk slot upload
  publish_slots    TEXT[],   -- jam upload optimal (local time negara target)
  last_cpm_update  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

---


---

## FASE 1 — Content Ideation Agent
**Agent:** `ideation-agent` (via 1ai-hub → 1ai-content)  
**Trigger:** `channel.ready` | `phase.cpm_research.complete` | `phase.optimize.complete` | `phase.monitor.normal`  
**Queue:** `yt_folklore:queue:ideation`  
**Bias input (opsional):** `breakout_cluster` dari FASE 5 | `cpm_research_report` dari FASE 0B (niche pool per country)

### Niche Pool (Country-Aware — diambil dari `country_channel_map.niche_pool`)
```yaml
# Niche pool BUKAN hardcoded global — tiap channel punya niche_pool sendiri
# berdasarkan target country dari FASE 0B CPM Research.
# Contoh per tier:

niche_pool_example:
  channel_USA_english:
    - american_folklore_appalachia
    - native_american_legends
    - colonial_america_mysteries
    - unsolved_american_historical_cases
    - cryptid_folklore_origins

  channel_UK_english:
    - british_folklore_celtic
    - medieval_english_mysteries
    - scottish_highland_legends
    - arthurian_legend_real_history
    - victorian_era_unsolved_mysteries

  channel_ID_bahasa:
    - legenda_cerita_rakyat_daerah      # per provinsi/suku
    - misteri_kontroversi_kerajaan      # nusantara
    - tokoh_sejarah_kontroversial
    - urban_legend_modern_indonesia
    - mitos_kepercayaan_lokal_angker

# Runtime: agent fetch dari DB country_channel_map.niche_pool berdasarkan channel_id
```

### Agent Instructions
```
SYSTEM:
Kamu adalah Content Ideation Agent untuk channel YouTube folklore/sejarah multi-country.
Tugas: generate batch ide konten yang tinggi potensi viral, standalone (tidak perlu nonton video lain),
dan belum pernah diupload di channel ini.
PENTING: Setiap channel punya target_country dan target_language sendiri — konten HARUS relevan
dan ditulis/dinarasikan dalam bahasa yang sesuai negara target.

INPUT:
- channel_id: <id channel yang sedang diproses>
- target_country: <dari country_channel_map>
- target_language: <dari country_channel_map> — bahasa konten & narasi
- cpm_tier: <S | A | B | C | D>
- niche_pool: <dari country_channel_map.niche_pool — BUKAN global pool>
- past_titles: <list judul video yang sudah upload, dari DB>
- breakout_cluster: <optional — tema/elemen dari video breakout terakhir>
- cpm_opportunities: <optional — dari CPM research report, topik yang recommended>
- channel_tier: <tier_1 | tier_2 | tier_3> — pengaruhi target durasi konten
- content_ratio: { proven_theme: 0.7, random_experiment: 0.3 }

TUGAS:
1. Generate 15 ide topik per batch.
   - 70% dari niche yang terbukti perform (proven_theme) atau breakout_cluster
   - 30% eksperimen/random dari niche_pool lain
2. Untuk setiap ide:
   a. Cek apakah ada konflik versi cerita (dari sumber berbeda) — kalau ada, tandai HIGH_HOOK
   b. Beri working title (mengandung entitas spesifik: nama tokoh/daerah/era)
   c. Tulis 2–3 kalimat ringkasan + angle hook utama
   d. Sertakan rekomendasi tone_variant: horror | heroik | misteri | romansa_tragis
   e. Skor potensi: RENDAH / SEDANG / TINGGI
3. Jangan generate ide yang:
   - Judulnya >80% mirip dengan past_titles (string similarity check)
   - Topiknya sudah dicover di 5 video terakhir
   - Tidak ada sumber referensi yang bisa dicari

OUTPUT FORMAT (JSON):
{
  "batch_id": "<uuid>",
  "generated_at": "<iso8601>",
  "channel_tier": "tier_1 | tier_2 | tier_3",
  "ideas": [
    {
      "id": "<uuid>",
      "title_draft": "...",
      "niche_category": "...",
      "hook_type": "HIGH_HOOK | STANDARD",
      "tone_variant": "horror | heroik | misteri | romansa_tragis",
      "summary": "...",
      "potential_score": "TINGGI | SEDANG | RENDAH",
      "conflict_versions": true/false
    }
  ]
}
```

**[HUMAN_GATE — Opsional]:** Jika `potential_score == TINGGI` untuk ≥3 ide → notif Telegram. Timeout 2 jam → auto-approve TINGGI, skip RENDAH.

**OUTPUT:** `idea_backlog` di DB → emit `phase.ideation.complete` → trigger FASE 2

---

## FASE 2 — Production Pipeline Agent
**Agent:** `production-agent` (via 1ai-hub → **1ai-content**)  
**Trigger:** `phase.ideation.complete`  
**Queue:** `yt_folklore:queue:production`  
**Concurrency:** Max 2 video diproduksi paralel

### Sub-pipeline Produksi

```
idea_backlog
  │
  ├─► [2A] Script Writer Agent (1ai-content)
  │     INPUT: idea.summary + tone_variant + channel_tier (→ target durasi)
  │     → Hook 5-10 detik pertama: lontarkan misteri/pertanyaan/fakta mengejutkan
  │     → Body: curiosity loop — tiap jawaban buka pertanyaan baru
  │     → Twist/cliffhanger sebelum 70% durasi
  │     → Resolusi di akhir (boleh sisakan ambiguitas untuk engagement komentar)
  │     → CTA end card: subscribe + notif + tanya pendapat
  │     → OUTPUT: script.md (dengan timestamp marker per segmen untuk sync narasi)
  │
  ├─► [2B] Voice Synthesis Agent (1ai-content → voice_synthesis_module)
  │     INPUT: script.md + tone_variant
  │     → Convert script ke audio narasi AI — natural storytelling, bukan robot
  │     → Tone sesuai tone_variant (lambat/bisikan untuk horror, tegas untuk heroik, dst)
  │     → OUTPUT: narration.mp3 + narration_timestamps.json (timestamp per kalimat)
  │
  ├─► [2C] Visual Assembly Agent (1ai-content)
  │     Sub-task 2C-1: AI Video Generation (menit pertama)
  │       INPUT: script segmen pertama + tone_variant
  │       → Generate 60 detik video AI (text-to-video) — scene paling dramatis
  │       → OUTPUT: opening_segment.mp4
  │     Sub-task 2C-2: Slideshow Assembly (sisa durasi)
  │       INPUT: script.md + narration_timestamps.json
  │       → Generate ilustrasi AI per adegan (boleh reuse/looping untuk segmen panjang)
  │       → Sync pergantian slide ke timestamp narasi
  │       → Transisi: fade atau cut, konsisten
  │       → OUTPUT: slideshow_segment.mp4
  │     Sub-task 2C-3: Final Assembly
  │       → Concat: opening_segment.mp4 + slideshow_segment.mp4
  │       → Merge dengan narration.mp3
  │       → Add background music (ambient, volume rendah, sesuai tone)
  │       → OUTPUT: final_video.mp4
  │
  ├─► [2D] Thumbnail Generator (1ai-content → thumbnail_gen_module)
  │     INPUT: story_title + tone_variant + primary_entity
  │     → Generate clickbait thumbnail (lihat THUMBNAIL SPEC di atas)
  │     → OUTPUT: thumbnail.png
  │
  └─► [2E] SEO Optimizer Agent (1ai-content → 1ai-social)
        INPUT: idea + script.md + channel_tier
        → Finalisasi judul: entitas spesifik + trigger emosi/rasa ingin tahu
        → Generate 5 kandidat judul → skor CTR estimate → pilih yang tertinggi
        → Deskripsi: nama tokoh/daerah/keyword spesifik dari cerita
        → Tags: 15–20 (campuran broad + long-tail)
        → OUTPUT: seo_package.json
```

### Script Formula Spec
```yaml
script_structure:
  target_duration_by_tier:
    tier_1: 15   # menit
    tier_2: 30   # menit
    tier_3: 60   # menit

  hook:
    duration_seconds: [5, 10]
    type: "mystery_question | shocking_fact | unresolved_mystery | controversial_claim"
    rule: "WAJIB lontarkan satu pertanyaan/pernyataan yang memaksa orang lanjut nonton"

  body:
    structure: "curiosity_loop"
    rule: "Setiap jawaban membuka pertanyaan baru — jangan resolve terlalu cepat"
    twist_at: "70%_duration"

  resolution:
    position: "last_20%"
    rule: "Beri jawaban/penjelasan, boleh sisakan ambiguitas untuk engagement komentar"

  cta:
    position: "end_card"
    content: "Subscribe + notif + pertanyaan ke komentar (dorong engagement)"

  timestamp_markers:
    rule: "Wajib ada marker [MM:SS] setiap pergantian adegan/segmen untuk sync visual"
```

**[HUMAN_GATE]:** Setelah semua aset siap → kirim preview ke Telegram: thumbnail + judul + 3 kalimat pertama hook. Operator punya 30 menit approve/reject/edit sebelum auto-approve.

**OUTPUT:** `final_video_package` (video.mp4 + thumbnail.png + seo_package.json) → emit `phase.production.complete` → FASE 3

---

## FASE 3 — Auto-Publisher Agent
**Agent:** `publisher-agent` (YouTube Data API v3)  
**Trigger:** `phase.production.complete`  
**Queue:** `yt_folklore:queue:publish`

### Jadwal Upload (Country-Aware Timezone)
```yaml
publish_schedule:
  # Timezone & slot diambil dari country_channel_map per channel
  # Agent publisher fetch timezone dari DB sebelum schedule upload

  timezone: "<dari country_channel_map.publish_timezone>"
  daily_slots: "<dari country_channel_map.publish_slots>"
  priority: "consistency_over_volume"
  max_per_day: 2

  # Default per timezone region jika tidak ada override:
  timezone_defaults:
    "America/New_York":   ["20:00", "07:00"]   # US East prime time
    "America/Los_Angeles": ["20:00", "07:00"]  # US West
    "Europe/London":      ["20:00", "07:00"]   # UK
    "Asia/Jakarta":       ["20:00", "05:00"]   # Indonesia
    "Asia/Tokyo":         ["20:00", "07:00"]   # Japan/Korea
    "Australia/Sydney":   ["20:00", "07:00"]   # Australia
```

### Publisher Agent Task
```
1. Ambil video package dari queue (FIFO per priority score)
2. Upload ke YouTube via API:
   - title, description, tags dari seo_package.json
   - thumbnail dari thumbnail.png
   - scheduled_for: slot berikutnya yang kosong
   - privacy: "private" → auto-publish saat scheduled time
3. Setelah upload sukses:
   - Simpan video_id ke DB published_videos
   - Set monitoring_start = scheduled_publish_time
   - Emit: phase.publish.complete { video_id, channel_id, publish_time }
4. Gagal upload → retry 3x exponential backoff → notif Telegram jika tetap gagal
```

**Schema:**
```sql
CREATE TABLE published_videos (
  video_id          TEXT PRIMARY KEY,
  channel_id        TEXT REFERENCES channel_registry(channel_id),
  idea_id           TEXT,
  title             TEXT,
  duration_minutes  INTEGER,
  tier              TEXT,
  published_at      TIMESTAMPTZ,
  monitoring_start  TIMESTAMPTZ,
  status            TEXT DEFAULT 'monitoring',
  -- monitoring | breakout | growing | dead | deleted | transferred
  breakout_cluster  TEXT,
  triage_decision   TEXT,    -- populated di FASE 4B
  triage_at         TIMESTAMPTZ
);
```

---

## FASE 4 — Performance Monitor Agent
**Agent:** `monitor-agent`  
**Trigger:** Cron setiap jam — cek semua video `status = 'monitoring'`  
**Check windows:** jam ke-24, ke-48, dan hari ke-10

```python
def classify_video(video_id: str, check_at: str) -> str:
    stats = fetch_analytics(video_id, check_at)
    avg_last_10 = get_channel_avg_views(channel_id, last_n=10)

    # Breakout detection
    is_breakout = (
        stats["views"] > avg_last_10 * 5
        or stats["clickThroughRate"] > 0.08
        or stats["averageViewPercentage"] > 0.50
    )

    if is_breakout:
        notify_telegram(f"🔥 BREAKOUT: {video_id} | Views: {stats['views']} | CTR: {stats['ctr']:.1%}")
        update_video_status(video_id, "breakout")
        emit_event("phase.breakout.detected", { "video_id": video_id, "stats": stats })
        return "breakout"

    # Dead video triage — cek di hari ke-10
    if check_at == "10d":
        emit_event("phase.triage.trigger", {
            "video_id": video_id,
            "stats": stats,
            "channel_avg": avg_last_10
        })
        return "triage"

    if check_at == "48h":
        if stats["views"] < avg_last_10 * 0.5:
            update_video_status(video_id, "underperforming")
        else:
            update_video_status(video_id, "growing")

    log_video_metrics(video_id, check_at, stats)
    return "normal"
```

**Check schedule:**
```yaml
monitoring_schedule:
  - check_at: "24h"
    action: "early_signal_detection"
  - check_at: "48h"
    action: "breakout_or_normal_classification"
  - check_at: "10d"
    action: "triage_trigger"   # → FASE 4B
```

---

## FASE 4B — Video Triage Agent (DELETE / KEEP / TRANSFER)
**Agent:** `triage-agent`  
**Trigger:** `phase.triage.trigger` (hari ke-10 setelah publish)  
**Logic:** Dua keputusan: delete video yang mati, dan siapkan transfer channel yang "lolos"

### Triage Decision Tree

```python
def triage_video(video_id: str, stats_10d: dict, channel_avg: float) -> str:
    views_10d = stats_10d["views"]
    ctr = stats_10d["clickThroughRate"]
    avg_view_pct = stats_10d["averageViewPercentage"]

    # DEAD: tidak ada trafik yang meaningful dalam 10 hari
    is_dead = (
        views_10d < 100                      # absolut rendah
        and ctr < 0.02                       # CTR sangat rendah
        and avg_view_pct < 0.20              # orang langsung skip
    )

    # GOOD: trafik baik — kandidat untuk transfer ke master channel
    is_good = (
        views_10d > channel_avg * 2
        or ctr > 0.05
        or avg_view_pct > 0.40
    )

    if is_dead:
        # Hapus video — jangan biarkan video mati drag down channel score
        schedule_delete(video_id, delay_hours=1)
        notify_telegram(f"🗑️ TRIAGE DELETE: {video_id} | Views 10d: {views_10d} | CTR: {ctr:.1%}")
        update_video_status(video_id, "deleted")
        return "DELETE"

    elif is_good:
        # Tandai sebagai kandidat channel transfer
        update_video_status(video_id, "transfer_candidate")
        check_channel_transfer_readiness(video_id)
        notify_telegram(f"✅ TRIAGE GOOD: {video_id} | Kandidat transfer ke master channel")
        return "TRANSFER_CANDIDATE"

    else:
        # Normal — pertahankan, lanjut monitoring mingguan
        update_video_status(video_id, "growing")
        return "KEEP"
```

### Channel Transfer Logic

```yaml
channel_transfer:
  rationale: >
    Channel yang isinya penuh video dengan trafik baik → transfer ke "master channel"
    yang kita kelola sebagai konsolidasi aset berperforma tinggi.
    Channel sumber menjadi clean slate untuk eksperimen channel baru.

  trigger_condition:
    - channel memiliki ≥ 5 video dengan status "transfer_candidate" ATAU
    - channel_traffic_score tinggi secara keseluruhan (avg CTR > 5% pada 10 video terakhir)

  process:
    step_1: "Audit semua video di channel — pisahkan GOOD vs DEAD"
    step_2: "Delete semua video DEAD dari channel sumber"
    step_3: "[HUMAN_GATE] Notifikasi ke operator via Telegram — konfirmasi transfer"
    step_4: "Transfer channel ownership ke Google Account master yang kita kelola"
             # via YouTube Studio → Settings → Channel → Transfer channel
    step_5: "Update channel_registry: set master_channel_id, update traffic_status = 'transferred'"
    step_6: "Buka channel sumber (Gmail baru) untuk batch berikutnya"

  master_channel:
    description: >
      1 channel utama yang menjadi konsolidasi semua video berperforma tinggi dari
      semua channel satelit. Channel ini tidak diproduksi secara rutin — hanya menerima
      transfer video terbaik. Tujuan: channel dengan watch-time & subscriber tinggi untuk
      memaksimalkan monetisasi AdSense.
    managed_by: "human_operator"    # transfer channel adalah aksi sensitif
    db_flag: "is_master_channel = TRUE"
```

**Schema tambahan:**
```sql
ALTER TABLE channel_registry ADD COLUMN is_master_channel BOOLEAN DEFAULT FALSE;
ALTER TABLE channel_registry ADD COLUMN traffic_score FLOAT;

CREATE TABLE channel_triage_log (
  id            SERIAL PRIMARY KEY,
  video_id      TEXT REFERENCES published_videos(video_id),
  channel_id    TEXT,
  decision      TEXT,   -- DELETE | KEEP | TRANSFER_CANDIDATE
  views_10d     INTEGER,
  ctr_10d       FLOAT,
  avg_view_pct  FLOAT,
  decided_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

## FASE 5 — Breakout Analysis & Cluster Generation Agent
**Agent:** `breakout-analyst-agent` (via 1ai-hub)  
**Trigger:** `phase.breakout.detected`

### Analisis Elemen Breakout

```
SYSTEM:
Kamu adalah Breakout Analysis Agent. Satu video channel terdeteksi BREAKOUT.
Tugasmu: bedah elemen spesifik yang berkontribusi, lalu generate action plan konten turunan.

INPUT:
- video_metadata: { title, description, tags, thumbnail_spec, tone_variant, duration_tier }
- video_analytics: { views, ctr, avg_view_pct, traffic_source_breakdown }
- channel_history: [ last 20 published videos dengan metrics ]

ANALISIS (confidence score 0.0–1.0 per dimensi):
1. Topik/Daerah/Tokoh — entitas spesifik yang dominan?
2. Jenis Cerita — horror | heroik | romansa_tragis | misteri_belum_terpecahkan | kontroversi
3. Judul Pattern — panjang, struktur, trigger word
4. Thumbnail Style — elemen visual dominan
5. Traffic Source — Search (SEO) vs Suggested (algo) vs Shorts
6. Hook Type — pertanyaan / fakta mengejutkan / klaim kontroversial
7. Tone Variant — apakah tone_variant tertentu perform lebih baik?
8. Duration Signal — apakah durasi tier berkontribusi ke AVD yang tinggi?

OUTPUT FORMAT (JSON):
{
  "breakout_video_id": "...",
  "cluster": {
    "primary_element": "...",
    "secondary_elements": [...],
    "story_type": "...",
    "tone_variant": "...",
    "traffic_driver": "search | suggested | shorts",
    "best_duration_tier": "tier_1 | tier_2 | tier_3",
    "recommended_angle_variations": [
      { "angle": "...", "hook_type": "...", "tone_variant": "...", "title_draft": "..." }
      // 5 variasi
    ],
    "related_old_videos_to_reoptimize": ["video_id_1", "video_id_2"],
    "revisit_schedule_weeks": 6
  }
}
```

### Action Plan
```python
def execute_breakout_plan(cluster: dict):
    # 1. Masukkan angle variations ke ideation queue dengan PRIORITY=HIGH
    for angle in cluster["recommended_angle_variations"]:
        push_to_queue("yt_folklore:queue:ideation", {
            "idea": angle,
            "priority": "HIGH",
            "breakout_bias": cluster
        })

    # 2. Buat playlist tematik
    create_or_update_playlist(
        title=f"Cerita {cluster['primary_element']} — Koleksi Lengkap",
        video_ids=get_related_video_ids(cluster)
    )

    # 3. Re-optimasi video lama yang temanya mirip
    for old_vid in cluster["related_old_videos_to_reoptimize"]:
        push_to_queue("yt_folklore:queue:reoptimize", {
            "video_id": old_vid,
            "breakout_context": cluster
        })

    # 4. Schedule revisit
    schedule_task(
        task="ideation_with_breakout_bias",
        run_at=now() + weeks(cluster["revisit_schedule_weeks"]),
        payload={ "breakout_cluster": cluster }
    )

    # 5. Upgrade channel tier jika belum
    auto_upgrade_channel_tier(cluster)

    # 6. Update channel context
    update_channel_breakout_context(cluster)
    emit_event("phase.optimize.complete", { "cluster": cluster })
```

---

## FASE 5B — Re-Optimizer Agent
**Agent:** `reoptimize-agent` (1ai-content + 1ai-social)  
**Trigger:** Item di `yt_folklore:queue:reoptimize`

```
SYSTEM:
Kamu adalah Video Re-Optimizer. Update judul dan thumbnail video lama agar align
dengan momentum breakout video terbaru.

INPUT:
- old_video: { video_id, current_title, current_thumbnail_spec, current_metrics }
- breakout_context: { cluster, primary_element, title_pattern, tone_variant }

TUGAS:
1. Generate 3 kandidat judul baru — akurat tapi lebih aligned dengan pattern breakout
2. Generate thumbnail spec baru (via 1ai-content thumbnail_gen_module)
3. Update deskripsi dengan entitas tambahan dari cluster
4. JANGAN ubah konten video itu sendiri

OUTPUT: update_package → publish via YouTube API (title + thumbnail + description update)
```

---

## FASE 6 — Scaling Loop & Multi-Channel Manager
**Agent:** `scale-manager-agent`  
**Trigger:** `phase.optimize.complete` + weekly cron `0 9 * * 1`

```yaml
loop_rules:
  content_ratio:
    proven_theme: 0.70
    random_experiment: 0.30

  backlog_minimum: 5        # jika < 5, trigger ideation langsung
  production_queue_max: 8   # relevancy decay — jangan numpuk terlalu banyak

  channel_tier_auto_upgrade:
    to_tier_2: "avg_views_last_5 > 500 AND channel_age_days >= 30"
    to_tier_3: "breakout_detected == true AND avg_views_last_5 > 2000"

  weekly_review:
    - Rekap metrics semua video 7 hari terakhir
    - Update niche_pool weight berdasarkan performa
    - Cek semua video hari ke-10 yang pending triage
    - Evaluasi channel transfer candidates
    - Kirim laporan Telegram: views, CTR avg, revenue estimate, video terbaik, triage summary

multi_channel:
  strategy: "satellite → master consolidation"
  constraint:
    - Setiap satellite channel beda niche/identitas
    - Tidak boleh re-upload konten channel lain
    - Master channel hanya menerima transfer — tidak diproduksi rutin
  new_satellite_trigger:
    - Ada Gmail baru siap
    - Ada niche baru teridentifikasi dengan potensi tinggi
    - Satellite lama sudah sukses transfer ke master
```

---

## AGENT REGISTRY (1ai-hub Routing)

```yaml
agents:
  cpm-research-agent:
    routes_to: 1ai-social
    model: claude-sonnet-4-6
    temperature: 0.4
    tools: [web_search, trend_analysis]
    schedule: "0 8 1 * *"
    output_schema: cpm_research_report.json
    human_gate_on: new_channel_recommendation

  ideation-agent:
    routes_to: 1ai-content
    model: claude-sonnet-4-6
    temperature: 0.9
    context_injection: [past_titles, breakout_cluster, channel_tier]

  production-agent:
    routes_to: 1ai-content
    sub_modules:
      script_writer:
        model: claude-sonnet-4-6
        temperature: 0.85
      voice_synthesis:
        module: 1ai-content.voice_synthesis_module
        style: natural_storytelling
      video_gen:
        module: 1ai-content.video_gen_module    # text-to-video, menit pertama
        duration_seconds: 60
      slideshow_assembler:
        module: 1ai-content.slideshow_assembler
        sync_to: narration_timestamps
      thumbnail_gen:
        module: 1ai-content.thumbnail_gen_module
        style: clickbait
      seo_optimizer:
        routes_to: 1ai-social
        model: claude-haiku-4-5
        temperature: 0.3

  breakout-analyst-agent:
    routes_to: 1ai-hub
    model: claude-sonnet-4-6
    temperature: 0.5

  monitor-agent:
    type: cron_agent
    schedule: "0 * * * *"
    tools: [youtube_analytics_api]
    check_windows: [24h, 48h, 10d]

  triage-agent:
    type: event_driven
    trigger: phase.triage.trigger
    tools: [youtube_data_api_v3]
    human_gate_on: TRANSFER_CANDIDATE

  publisher-agent:
    type: tool_use_agent
    tools: [youtube_data_api_v3]
    retry_policy: { max: 3, backoff: exponential }

  reoptimize-agent:
    routes_to: 1ai-content, 1ai-social
    model: claude-haiku-4-5
    temperature: 0.4
    tools: [youtube_data_api_v3]

  scale-manager-agent:
    type: orchestrator
    schedule: "0 9 * * 1"
    reports_to: telegram_bot_master
```

---

## TELEGRAM NOTIFICATION SPEC (@berkahkarya-saas-bot)

```yaml
notifications:
  cpm_research_complete:
    trigger: phase.cpm_research.complete
    message: |
      🌍 CPM RESEARCH UPDATE
      Date: {research_date}
      Top CPM Countries: {top_3_cpm_countries}
      New Opportunities Found: {opportunity_count}
      
      🏆 Top 3 Peluang:
      1. {opp_1_country} | CPM ${opp_1_cpm} | Niche: {opp_1_niche} | Kompetisi: {opp_1_competition}
      2. {opp_2_country} | CPM ${opp_2_cpm} | Niche: {opp_2_niche}
      3. {opp_3_country} | CPM ${opp_3_cpm} | Niche: {opp_3_niche}
      
      📌 Rekomendasi Channel Baru: {new_channel_recommendations}
      [BUKA CHANNEL BARU] [SKIP BULAN INI] [LIHAT DETAIL]

  breakout_alert:
    trigger: phase.breakout.detected
    message: |
      🔥 BREAKOUT DETECTED
      Channel: {channel_id} | Tier: {current_tier}
      Video: {title}
      Views 48h: {views} (avg channel: {channel_avg})
      CTR: {ctr}% | AVD: {avg_view_pct}%
      Traffic: {top_traffic_source}
      → Cluster analysis running...

  triage_delete:
    trigger: triage.decision == DELETE
    message: |
      🗑️ VIDEO DIHAPUS (10-hari dead)
      Channel: {channel_id}
      Video: {title}
      Views 10d: {views} | CTR: {ctr}%
      → Slot dibersihkan, channel lebih bersih

  triage_transfer_candidate:
    trigger: triage.decision == TRANSFER_CANDIDATE
    message: |
      ✅ VIDEO BAGUS — KANDIDAT TRANSFER
      Channel: {channel_id}
      Video: {title}
      Views 10d: {views} | CTR: {ctr}% | AVD: {avg_view_pct}%
      [APPROVE TRANSFER] [KEEP DI SINI] [SKIP]

  channel_transfer_ready:
    trigger: channel_transfer_readiness_met
    message: |
      📦 CHANNEL SIAP TRANSFER KE MASTER
      Channel: {channel_id}
      Video bagus: {good_video_count} | Video dihapus: {deleted_count}
      Estimasi watch-hours: {total_watch_hours}h
      → Konfirmasi manual diperlukan untuk transfer ownership
      [CONFIRM TRANSFER] [TUNDA]

  production_preview:
    trigger: pre_publish_gate
    message: |
      📹 VIDEO SIAP PUBLISH — PREVIEW
      Judul: {title}
      Tone: {tone_variant} | Durasi: {duration_minutes} menit | Tier: {tier}
      Hook: {first_3_sentences}
      Schedule: {publish_time}
      [APPROVE] [REJECT] [EDIT JUDUL]
    timeout_auto_approve: 1800

  weekly_report:
    trigger: cron_weekly
    message: |
      📊 WEEKLY REPORT
      Channel: {channel_id} | Tier: {current_tier}
      Period: {date_range}
      Total Views: {total_views}
      Best Video: {top_video_title} ({top_views} views)
      Avg CTR: {avg_ctr}% | New Subs: {new_subs}
      Triage Summary: {deleted_count} dihapus, {transfer_count} kandidat transfer
      Revenue Est: Rp {revenue_estimate}
      Active Cluster: {active_cluster}

  tier_upgrade:
    trigger: channel_tier_upgraded
    message: |
      ⬆️ CHANNEL UPGRADE TIER
      Channel: {channel_id}
      {old_tier} → {new_tier}
      Target durasi video sekarang: {new_duration} menit

  error_alert:
    trigger: agent_error
    message: |
      ⚠️ AGENT ERROR
      Agent: {agent_name} | Phase: {phase}
      Error: {error_msg}
      Retry: {retry_count}/3
```

---

## DATABASE SCHEMA LENGKAP

```sql
-- Channel Registry
CREATE TABLE channel_registry (
  channel_id          TEXT PRIMARY KEY,
  gmail_account       TEXT,
  adsense_pub_id      TEXT,
  niche               TEXT DEFAULT 'folklore_id',
  yt_oauth_token      TEXT,
  tier                TEXT DEFAULT 'tier_1_cold_start',
  total_published     INTEGER DEFAULT 0,
  channel_age_days    INTEGER DEFAULT 0,
  traffic_status      TEXT DEFAULT 'unproven',
  is_master_channel   BOOLEAN DEFAULT FALSE,
  master_channel_id   TEXT,
  traffic_score       FLOAT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  setup_complete      BOOLEAN DEFAULT FALSE
);

-- Idea Backlog
CREATE TABLE idea_backlog (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id        TEXT REFERENCES channel_registry(channel_id),
  batch_id          UUID,
  title_draft       TEXT,
  niche_category    TEXT,
  hook_type         TEXT,
  tone_variant      TEXT,
  summary           TEXT,
  potential_score   TEXT,
  conflict_versions BOOLEAN,
  breakout_bias     JSONB,
  priority          TEXT DEFAULT 'NORMAL',
  status            TEXT DEFAULT 'pending',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Published Videos
CREATE TABLE published_videos (
  video_id          TEXT PRIMARY KEY,
  channel_id        TEXT REFERENCES channel_registry(channel_id),
  idea_id           TEXT,
  title             TEXT,
  duration_minutes  INTEGER,
  tier              TEXT,
  tone_variant      TEXT,
  published_at      TIMESTAMPTZ,
  monitoring_start  TIMESTAMPTZ,
  status            TEXT DEFAULT 'monitoring',
  breakout_cluster  TEXT,
  triage_decision   TEXT,
  triage_at         TIMESTAMPTZ
);

-- Video Metrics Log
CREATE TABLE video_metrics_log (
  id            SERIAL PRIMARY KEY,
  video_id      TEXT REFERENCES published_videos(video_id),
  check_at      TEXT,
  views         INTEGER,
  ctr           FLOAT,
  avg_view_pct  FLOAT,
  avd_seconds   INTEGER,
  traffic_src   JSONB,
  recorded_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Channel Triage Log
CREATE TABLE channel_triage_log (
  id            SERIAL PRIMARY KEY,
  video_id      TEXT REFERENCES published_videos(video_id),
  channel_id    TEXT,
  decision      TEXT,
  views_10d     INTEGER,
  ctr_10d       FLOAT,
  avg_view_pct  FLOAT,
  decided_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Breakout Clusters
CREATE TABLE breakout_clusters (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id            TEXT,
  trigger_video_id      TEXT REFERENCES published_videos(video_id),
  primary_element       TEXT,
  secondary_elements    JSONB,
  story_type            TEXT,
  tone_variant          TEXT,
  traffic_driver        TEXT,
  best_duration_tier    TEXT,
  active                BOOLEAN DEFAULT TRUE,
  revisit_scheduled_at  TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Channel Playlists
CREATE TABLE channel_playlists (
  playlist_id   TEXT PRIMARY KEY,
  channel_id    TEXT,
  title         TEXT,
  cluster_id    UUID REFERENCES breakout_clusters(id),
  video_ids     TEXT[],
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Agent Task Log
CREATE TABLE agent_task_log (
  id          SERIAL PRIMARY KEY,
  agent_name  TEXT,
  phase       TEXT,
  input_ref   TEXT,
  output_ref  TEXT,
  status      TEXT,
  error_msg   TEXT,
  started_at  TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
```

---

## SPEC MESIN — YAML LENGKAP

```yaml
workflow: youtube_folklore_id
version: "3.0"
ecosystem: 1ai-ecosystem

infrastructure:
  event_bus: redis_pubsub
  event_channel: "yt_folklore:events"
  queue_prefix: "yt_folklore:queue"
  state_db: postgresql
  scheduler: celery_beat
  timezone: "Asia/Jakarta"
  notification_channel: telegram
  telegram_bot: "@berkahkarya-saas-bot"

strategy:
  mode: multi_country_high_cpm
  primary_targets: [USA, UK, Canada, Australia, Norway, Germany]
  secondary_targets: [France, Ireland, Japan, South Korea, Brazil]
  baseline: [Indonesia, Malaysia, Philippines]
  cpm_research_interval_days: 30

content_modules:
  all_generation: 1ai-content   # script, voice, video, slideshow, thumbnail, SEO assist
  seo_distribution: 1ai-social
  revenue_tracking: 1ai-ads

video_format:
  tier_1: { duration_minutes: 15, condition: "total_published < 10 OR age_days < 30" }
  tier_2: { duration_minutes: 30, condition: "avg_views_last_5 > 500 AND age_days >= 30" }
  tier_3: { duration_minutes: 60, condition: "breakout_detected AND avg_views_last_5 > 2000" }

video_structure:
  opening_segment:
    duration_seconds: 60
    type: AI_GENERATED_VIDEO     # text-to-video, scene paling dramatis
    module: 1ai-content.video_gen_module
  main_body:
    type: NARRATED_SLIDESHOW     # AI ilustrasi looping, sync ke narasi
    module: 1ai-content.slideshow_assembler
  narration:
    type: AI_TTS
    style: natural_storytelling
    module: 1ai-content.voice_synthesis_module
  thumbnail:
    type: CLICKBAIT_GENERATED
    module: 1ai-content.thumbnail_gen_module

phases:
  - id: setup
    type: manual_one_time
    human_required: true
    completion_event: "channel.ready"

  - id: cpm_research
    type: recurring_cron
    agent: cpm-research-agent
    routes_to: 1ai-social
    schedule: "0 8 1 * *"    # tanggal 1 tiap bulan, 08:00 WIB
    trigger_events: ["channel.ready"]
    queue: "yt_folklore:queue:cpm_research"
    tools: [web_search, trend_analysis]
    output: [cpm_research_log, country_channel_map_updates]
    human_gate: { trigger: new_channel_recommendation, timeout_hours: 24 }
    completion_event: "phase.cpm_research.complete"

  - id: ideation
    type: recurring
    agent: ideation-agent
    trigger_events: ["channel.ready", "phase.cpm_research.complete", "phase.optimize.complete", "phase.monitor.normal"]
    queue: "yt_folklore:queue:ideation"
    human_gate: { condition: "high_potential >= 3", timeout_minutes: 120 }
    completion_event: "phase.ideation.complete"

  - id: production
    type: pipeline
    agent: production-agent
    routes_to: 1ai-content
    trigger_events: ["phase.ideation.complete"]
    queue: "yt_folklore:queue:production"
    concurrency: 2
    sub_pipeline: [script_writer, voice_synthesis, video_gen, slideshow_assembler, thumbnail_gen, seo_optimizer]
    human_gate: { trigger: pre_publish, timeout_minutes: 30 }
    completion_event: "phase.production.complete"

  - id: publish
    type: scheduled
    agent: publisher-agent
    trigger_events: ["phase.production.complete"]
    queue: "yt_folklore:queue:publish"
    schedule:
      timezone: "Asia/Jakarta"
      slots: ["20:00", "05:00"]
      max_per_day: 2
    completion_event: "phase.publish.complete"

  - id: monitor
    type: cron
    agent: monitor-agent
    schedule: "0 * * * *"
    check_windows: ["24h", "48h", "10d"]
    breakout_condition:
      any_of:
        - "views_48h > channel_avg_last_10 * 5"
        - "ctr > 0.08"
        - "avg_view_pct > 0.50"
    on_breakout: emit "phase.breakout.detected"
    on_10d_check: emit "phase.triage.trigger"
    on_normal_48h: emit "phase.monitor.normal"

  - id: triage
    type: event_driven
    agent: triage-agent
    trigger_events: ["phase.triage.trigger"]
    queue: "yt_folklore:queue:triage"
    decisions:
      DELETE: { condition: "views < 100 AND ctr < 0.02 AND avg_view_pct < 0.20", action: auto_delete }
      TRANSFER_CANDIDATE: { condition: "views > avg*2 OR ctr > 0.05 OR avg_view_pct > 0.40", action: flag_and_notify }
      KEEP: { default: true, action: continue_monitoring_weekly }
    channel_transfer:
      trigger: "good_videos >= 5 OR channel_avg_ctr > 0.05"
      human_gate: true   # transfer channel = aksi sensitif, wajib konfirmasi

  - id: optimize
    type: analysis_and_action
    agent: breakout-analyst-agent
    trigger_events: ["phase.breakout.detected"]
    queue: "yt_folklore:queue:optimize"
    analyze: [topic_entity, story_type, tone_variant, title_pattern, thumbnail_style, traffic_source, duration_tier]
    actions:
      - generate_variations: { count: 5, queue: ideation, priority: HIGH }
      - create_playlist
      - reoptimize_related: { queue: reoptimize }
      - schedule_revisit: { weeks: 6 }
      - auto_upgrade_tier
    completion_event: "phase.optimize.complete"

  - id: reoptimize
    type: task_queue
    agent: reoptimize-agent
    queue: "yt_folklore:queue:reoptimize"
    routes_to: [1ai-content, 1ai-social]
    actions: [update_title, regenerate_thumbnail, update_description]

  - id: scale
    type: orchestrator
    agent: scale-manager-agent
    schedule: "0 9 * * 1"
    loop_back_to: ideation
    content_ratio: { proven_theme: 0.7, random_experiment: 0.3 }
    weekly_report: telegram
    channel_strategy: satellite_to_master_consolidation

human_gates:
  - id: gate_ideation_review
    condition: "high_potential_ideas >= 3"
    timeout_minutes: 120
    default_on_timeout: auto_approve_high_skip_low

  - id: gate_pre_publish
    trigger: every_video
    timeout_minutes: 30
    default_on_timeout: auto_approve
    actions: [approve, reject, edit_title]

  - id: gate_channel_transfer
    trigger: channel_transfer_readiness_met
    timeout_minutes: null    # tidak ada auto-approve — transfer adalah aksi permanen
    actions: [confirm_transfer, tunda]

error_handling:
  retry_policy: { max: 3, backoff: exponential, base_seconds: 60 }
  on_max_retry: notify_telegram_error_alert
  dead_letter_queue: "yt_folklore:queue:dlq"
```

---

## CATATAN PENTING

**Kebijakan YouTube & AdSense:**
- AdSense: 1 nama penerima pembayaran = 1 akun AdSense, boleh multi-channel.
- YouTube menilai setiap channel individual — multi-channel bukan celah re-upload.
- YouTube Data API v3: quota 10.000 units/hari default. Upload video = 1.600 units. Request quota increase jika scale ke banyak channel.
- Channel transfer ownership via YouTube Studio → Settings → Channel — ini proses manual, tidak bisa di-API-kan.

**Multi-Country Strategy Notes:**
- Channel per negara = entity terpisah, bukan 1 channel multi-bahasa. YouTube algo lebih suka channel yang konsisten satu bahasa/audience.
- Untuk Tier S (USA/UK/AU): konten dalam bahasa Inggris = reach lebih luas + CPM jauh lebih tinggi.
- Voice synthesis di `1ai-content` harus support multi-language TTS — pastikan model yang dipakai support accent sesuai (British English vs American English, misalnya).
- CPM seasonality: Q4 (Oktober–Desember) adalah peak CPM global — rencanakan konten volume lebih tinggi di periode ini.
- Jangan buka semua negara sekaligus — prioritas dari research score tertinggi dulu.

**1ai-content Module Dependencies:**
- `video_gen_module` — butuh text-to-video model (Wan, Kling, atau self-hosted). Hanya 60 detik per video → cost terkontrol.
- `voice_synthesis_module` — TTS dengan tone control. Target: natural storytelling, bukan robot.
- `slideshow_assembler` — image gen + video compositor. Gambar boleh looping — tidak perlu generate baru tiap detik.
- `thumbnail_gen_module` — image gen dengan clickbait composition rule. Fully automated, tidak perlu human designer.

**Triage Strategy:**
- Delete agresif video mati di hari ke-10 — channel yang bersih performanya lebih baik di algo YouTube daripada channel yang penuh video dead.
- Master channel bukan untuk produksi rutin — dia adalah "trophy cabinet" video terbaik dari semua satellite channel.
