# WORKFLOW: YouTube Multi-Niche Multi-Country — High-CPM Automated Pipeline
**Version:** 4.0 — Niche-Agnostic Full Automation
**Tujuan:** Channel YouTube income-stream dari niche apa pun (folklore, music, history, mystery, dll), dijalankan sepenuhnya oleh AI Agent pipeline dalam 1ai-ecosystem. Niche ditentukan otomatis via research agent. Target diperluas ke negara-negara dengan CPM tinggi. Intervensi manusia diminimalkan ke gate eksplisit saja.
**Architecture:** Event-driven agent pipeline. Setiap fase emit event → agent subscriber eksekusi → output masuk ke queue fase berikutnya. Human-in-the-loop hanya di gate yang ditandai `[HUMAN_GATE]`.

---

## ECOSYSTEM INTEGRATION MAP

```
1ai-hub (Brain Layer / Orchestrator)
  ├── 1ai-content       → script writing, narasi AI, voice synthesis, video assembly, thumbnail generation
  ├── 1ai-social        → riset keyword, SEO, distribusi, cross-post, engagement monitoring, CPM & niche research
  ├── 1ai-ads           → AdSense revenue tracking, ROI per video, CPM tracking per country
  └── Telegram Bot      → notifikasi, human gate approval, manual override
       (@berkahkarya-saas-bot / master orchestrator)
```

> ⚠️ `1ai-joki-engine` dan `1ai-reach` sudah di-merge ke `1ai-social`. Semua content generation pipeline ada di `1ai-content`. SEO & distribusi ada di `1ai-social`.

**Event Bus:** Redis pub/sub (channel: `yt_niche:events`)
**State Store:** PostgreSQL (schema: `yt_workflow`)
**Queue:** Redis Streams (`yt_niche:queue:<phase>`)
**Scheduler:** Celery Beat (timezone: Asia/Jakarta)

---

## NICHE VERTICAL SYSTEM

Workflow ini **niche-agnostic** — bisa dipakai untuk niche apa pun. Niche vertical menentukan:
- Jenis konten yang di-produce (narrated story, music compilation, educational, dll)
- Format video (narrated slideshow, music visualizer, mixed, dll)
- Target audience & bahasa
- Tone variant yang tersedia
- Strategy monetisasi

### Supported Niche Verticals (contoh — bisa ditambah)

```yaml
niche_verticals:
  folklore_history:
    name: "Folklore & Sejarah"
    content_type: "narrated_story"
    production_format: "narrated_slideshow"
    description: "Cerita rakyat, legenda, misteri sejarah, kontroversi kerajaan"
    tone_variants: [horror, heroik, misteri, romansa_tragis]
    language_default: "local_language"
    example_channels: ["Dokumenter Nusantara", "Scary Mysteries", "Mythology & Fiction Explained"]

  music:
    name: "Music & Lagu"
    content_type: "music_compilation"
    production_format: "music_visualizer"
    description: "Compilation lagu, cover, lofi, ambient, genre-specific mix"
    tone_variants: [chill, energetic, romantic, melancholic]
    language_default: "universal"  # musik = lintas bahasa
    example_channels: ["Lofi Girl", "Ambient Worlds", "Chillhop Music"]

  true_crime:
    name: "True Crime & Misteri"
    content_type: "narrated_story"
    production_format: "narrated_slideshow"
    description: "Kasus nyata, investigasi, cold cases, criminal psychology"
    tone_variants: [suspense, investigative, documentary, dramatic]
    language_default: "local_language"

  science_nature:
    name: "Sains & Alam"
    content_type: "narrated_story"
    production_format: "narrated_slideshow"
    description: "Fenomena alam, penemuan ilmiah, space, ocean mysteries"
    tone_variants: [wonder, educational, dramatic, mystery]
    language_default: "local_language"

  educational:
    name: "Edukatif & Explainer"
    content_type: "narrated_story"
    production_format: "narrated_slideshow"
    description: "Topik edukatif yang dijelaskan dengan storytelling menarik"
    tone_variants: [informative, engaging, dramatic, simplified]
    language_default: "local_language"
```

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

## VIDEO PRODUCTION SPEC — STRUKTUR KONTEN (NICHE-AGNOSTIC)

Format video di-branch berdasarkan `production_format` dari niche vertical.

### Format A: NARRATED_SLIDESHOW (folklore, true_crime, science, educational)

```yaml
narrated_slideshow:
  segment_1_opening:
    duration_minutes: 1
    type: "AI_GENERATED_VIDEO"
    description: >
      Menit pertama wajib pakai footage/visual yang di-generate AI (text-to-video model).
      Scene yang paling ikonik atau dramatis dari cerita. Fungsi: hook visual kuat.
    content_rule: "Tampilkan scene paling dramatis — bukan intro channel, langsung cerita"
    tool: "1ai-content → video_gen_module (text-to-video)"

  segment_2_main_body:
    duration: "remaining_duration_after_minute_1"
    type: "NARRATED_SLIDESHOW"
    description: >
      Sisanya slideshow — gambar/ilustrasi yang looping atau berganti sesuai narasi.
    visual_rules:
      - Gambar relevan dengan adegan/tokoh yang sedang dinarasikan
      - Looping gambar diperbolehkan untuk segmen yang sama
      - Transisi: fade atau cut — jangan pakai efek berlebihan
      - Ilustrasi boleh AI-generated (konsisten style per video)
    tool: "1ai-content → slideshow_assembler"

  narration:
    type: "AI_VOICE_TTS"
    style: "cerita mengalir — natural storytelling, bukan robot"
    tone_variants: "<dari niche_vertical.tone_variants>"
    tool: "1ai-content → voice_synthesis_module"
    sync: "auto-sync narasi ke slide transitions"
```

### Format B: MUSIC_VISUALIZER (music, lofi, ambient, compilation)

```yaml
music_visualizer:
  description: >
    Video musik = audio track utama + visual yang mendampingi.
    Bisa berupa visualizer (waveform/animation), ambient video, atau slideshow tematik.

  production_pipeline:
    step_1_audio:
      type: "MUSIC_SOURCE"
      description: >
        Sumber audio: AI-generated music, royalty-free library, atau cover/remix.
        Durasi = target durasi tier (15/30/60 menit).
      options:
        ai_generated:
          tool: "1ai-content → music_gen_module"  # Suno, Udio, atau self-hosted
          prompt_template: "Generate {genre} music, mood: {mood}, duration: {duration_minutes}min"
        royalty_free:
          tool: "1ai-content → music_library_module"
          sources: [Epidemic Sound, Artlist, YouTube Audio Library]
        cover_remix:
          tool: "1ai-content → voice_synthesis_module"
          note: "Hati-hati copyright — pastikan lagu public domain atau lisensi valid"

    step_2_visual:
      type: "AMBIENT_VISUAL"
      description: >
        Visual yang mendampingi musik — bukan slideshow naratif.
      options:
        ai_visualizer:
          tool: "1ai-content → video_gen_module"
          description: "Generate visual loop/animation yang cocok dengan mood musik"
        ambient_slideshow:
          tool: "1ai-content → slideshow_assembler"
          description: "Slideshow gambar ambient (landscape, cityscape, abstract) yang looping"
          visual_rules:
            - Gambar harus konsisten mood dengan musik
            - Looping halus — crossfade antar gambar
            - Tidak perlu perubahan cepat — musik adalah fokus utama
        static_image:
          description: "1 gambar statis + waveform/visualizer overlay (paling murah)"
          tool: "1ai-content → visualizer_overlay_module"

    step_3_assembly:
      type: "FINAL_MERGE"
      description: "Merge audio + visual → final video"
      tool: "1ai-content → video_assembler"
      output: "final_video.mp4"

  music_metadata:
    description: >
      Music video butuh metadata yang berbeda dari story video:
    seo_focus:
      - Genre spesifik: "lofi hip hop", "ambient study music", "jazz instrumental"
      - Mood: "relaxing", "focus", "sleep", "workout"
      - Duration: "1 hour", "3 hours", "8 hours"
      - Use case: "for studying", "for sleeping", "background music"
    thumbnail_style: "minimalist — genre/mood indicator, bukan clickbait wajah"
    title_formula: "[GENRE] [MOOD] [DURATION] — [SUBTITLE]"
    example_titles:
      - "Lofi Hip Hop Radio — Beats to Relax/Study To"
      - "Dark Ambient Music — 1 Hour of Haunting Atmosphere"
      - "Classical Piano for Deep Focus — 3 Hour Playlist"
```

---

## THUMBNAIL SPEC — NICHE-ADAPTIVE

```yaml
thumbnail:
  generated_by: "1ai-content → thumbnail_gen_module"

  style_by_niche:
    folklore_history:
      style: "clickbait — maksimalkan CTR, bukan estetika"
      composition_rules:
        - Wajah ekspresif (shock / takut / marah / sedih) sebagai elemen utama
          — boleh wajah tokoh AI-generated, bukan foto asli orang nyata
        - Teks overlay: MAX 5 kata, ukuran besar, readable di mobile
        - Warna: kontras ekstrem — merah/kuning di atas gelap
        - Background: gelap dramatis
      text_formula: "[TRIGGER_WORD] [ENTITAS]"
      triggers: ["RAHASIA", "TERSEMBUNYI", "SEBENARNYA", "TERNYATA"]

    music:
      style: "minimalist — genre/mood indicator"
      composition_rules:
        - Visual aesthetic yang represent genre (anime lofi girl, neon city, nature landscape)
        - Teks: genre name atau mood word, font besar, readable
        - Warna: sesuai mood genre (pastel untuk lofi, neon untuk synthwave, earthy untuk acoustic)
        - Background: visual yang langsung communicate genre
      text_formula: "[GENRE] — [MOOD/DURATION]"
      example: "Lofi Beats — Chill & Relax"

    true_crime:
      style: "dark dramatic — suspense"
      composition_rules:
        - Silhouette atau shadow figure
        - Red accent (police tape, blood drop, evidence marker)
        - Teks: nama kasus atau "UNSOLVED" / "COLD CASE"
        - Background: dark, desaturated

    science_nature:
      style: "wonder & awe"
      composition_rules:
        - Stunning nature/space visual
        - Teks: nama fenomena atau pertanyaan
        - Warna: biru/hijau untuk alam, hitam/ungu untuk space

  generation_prompt_template: |
    Generate thumbnail YouTube untuk niche {niche_vertical}: {story_title}
    Tone: {tone_variant}
    Style: {thumbnail_style}
    Elemen utama: {primary_element}
    Teks: "{thumbnail_text}"
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
| 0.5 | Input channel credentials ke `channel_registry` DB — YouTube API OAuth token, channel ID, niche vertical | ✅ Agent mulai kerja setelah ini |

**Schema DB:**
```sql
CREATE TABLE channel_registry (
  channel_id          TEXT PRIMARY KEY,
  gmail_account       TEXT,
  adsense_pub_id      TEXT,
  niche_vertical      TEXT NOT NULL,        -- folklore_history | music | true_crime | science_nature | educational | custom
  niche_name          TEXT,                 -- display name, e.g. "American Folklore", "Lofi Music"
  production_format   TEXT NOT NULL,        -- narrated_slideshow | music_visualizer
  target_country      TEXT,
  target_language     TEXT,
  cpm_tier            TEXT DEFAULT 'tier_D',
  yt_oauth_token      TEXT,                 -- encrypted
  tier                TEXT DEFAULT 'tier_1_cold_start',
  total_published     INTEGER DEFAULT 0,
  channel_age_days    INTEGER DEFAULT 0,
  traffic_status      TEXT DEFAULT 'unproven',
  -- unproven | growing | established | quarantine | transferred | deleted
  is_master_channel   BOOLEAN DEFAULT FALSE,
  master_channel_id   TEXT,
  traffic_score       FLOAT,
  quarantine_started  TIMESTAMPTZ,          -- diisi saat masuk quarantine
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  setup_complete      BOOLEAN DEFAULT FALSE
);
```

**OUTPUT:** `setup_complete = TRUE` → emit `channel.ready` → FASE 0B (Niche + CPM Research) dan FASE 1 mulai paralel.

---

## FASE 0B — Auto Research: Niche Discovery + High-CPM Country Targeting
**Agent:** `niche-cpm-research-agent` (via 1ai-hub → 1ai-social)
**Type:** `recurring` — jalan ulang setiap 30 hari
**Trigger:** `channel.ready` | cron `0 8 1 * *` (tanggal 1 tiap bulan)
**Queue:** `yt_niche:queue:niche_cpm_research`

### Tujuan

Riset gabungan: **niche apa yang perlu dikerjakan** + **negara mana yang CPM-nya tinggi**.
Bukan cuma riset CPM per negara — tapi juga identifikasi niche vertical yang underserved dan profitable di setiap negara target.

### Agent Instructions — Niche + CPM Research
```
SYSTEM:
Kamu adalah Niche & CPM Research Agent untuk strategi multi-country multi-niche YouTube channel.
Tugas: riset DAN rekomendasi:
1. Niche vertical apa yang paling potensial untuk channel baru
2. Negara mana yang CPM-nya tinggi untuk niche tersebut
3. Sub-niche spesifik yang belum jenuh di negara-negara target
4. Bahasa & konten yang direkomendasikan
5. Kompetitor yang ada dan gap yang bisa dimanfaatkan

TOOLS yang digunakan:
- Web search: CPM data terbaru YouTube per country (SocialBlade, Influencer Marketing Hub, Reddit)
- Niche trend analysis: cari "underserved niche" + "growing niche" per kategori
- Competitor gap analysis: cek channel besar vs channel kecil yang growing
- YouTube trending: analisis video trending per country untuk identifikasi niche yang lagi naik
- Google Trends: search interest per topic per country

INPUT:
- current_date: <untuk seasonality>
- existing_channels: <list channel yang sudah ada, niche_vertical, target_country, performance>
- supported_niche_verticals: <dari config niche_verticals>
- cpm_tiers_seed: <baseline CPM per negara>

TUGAS:
1. Update CPM estimate per negara (data 30 hari ke belakang)
2. Untuk setiap niche vertical yang didukung, identifikasi:
   a. Negara target terbaik (CPM tinggi + demand ada + kompetisi rendah)
   b. 5-10 sub-niche spesifik yang BELUM jenuh
   c. Estimasi search volume per sub-niche
   d. Bahasa yang direkomendasikan (English vs lokal)
   e. Top 5 kompetitor (nama channel + subscriber + avg views)
   f. Gap analysis: topik/rp yang belum banyak dikover
3. Cross-niche analysis: kombinasi niche yang bisa overlap
   (contoh: "dark history music" = music + true_crime; "mythology ambient" = music + folklore)
4. Generate rekomendasi:
   a. Channel baru apa yang paling worth dibuka sekarang
      (kombinasi: niche + negara + CPM + kompetisi + demand)
   b. Niche vertical baru yang bisa ditambahkan ke config
   c. Niche yang sudah jenuh → deprioritize

OUTPUT FORMAT (JSON):
{
  "research_date": "<iso8601>",
  "cpm_snapshot": {
    "USA": { "cpm_usd": 18.5, "trend": "stable", "season_note": "Q4 peak expected" },
    "UK": { "cpm_usd": 12.3, "trend": "rising" }
  },
  "niche_analysis": [
    {
      "niche_vertical": "music",
      "sub_niches": [
        {
          "name": "Dark Ambient / Horror Atmosphere",
          "target_countries": ["USA", "UK", "Germany"],
          "language": "English",
          "search_volume": "HIGH",
          "competition_level": "LOW",
          "top_competitors": [
            {"channel": "Channel A", "subs": 50000, "avg_views": 15000},
            {"channel": "Channel B", "subs": 12000, "avg_views": 8000}
          ],
          "gap": "Belum ada channel spesifik dark ambient untuk sleep/focus",
          "recommended_content": "1-3 hour dark ambient mixes with cinematic visuals",
          "priority_score": 8.7
        }
      ]
    }
  ],
  "cross_niche_opportunities": [
    {
      "combination": ["music", "folklore_history"],
      "name": "Mythology Ambient Music",
      "description": "Ambient music berdasarkan mitologi — Norse, Greek, Indonesian",
      "target_countries": ["USA", "UK"],
      "language": "English",
      "priority_score": 7.5
    }
  ],
  "new_channel_recommendations": [
    {
      "niche_vertical": "music",
      "sub_niche": "Lofi Hip Hop / Study Beats",
      "target_country": "USA",
      "target_language": "English",
      "production_format": "music_visualizer",
      "estimated_cpm": 12.5,
      "competition_level": "MEDIUM",
      "priority": "OPEN_NOW",
      "rationale": "CPM tinggi, evergreen demand, produksi relatif murah"
    }
  ],
  "existing_channel_updates": {
    "channel_id_xyz": {
      "add_sub_niches": ["dark ambient sleep music"],
      "deprioritize_sub_niches": ["generic lofi"],
      "niche_vertical_change": null
    }
  },
  "new_niche_vertical_suggestions": [
    {
      "name": "asmr_nature",
      "description": "ASMR nature sounds — rain, forest, ocean waves",
      "production_format": "music_visualizer",
      "estimated_global_cpm": 8.0,
      "rationale": "Evergreen, low production cost, high watch time"
    }
  ]
}
```

**[HUMAN_GATE]:** Setelah research selesai → kirim summary ke Telegram:
- Top 3 niche × country peluang
- Top 3 sub-niche per niche vertical
- Rekomendasi channel baru
Operator konfirmasi mana yang dibuka. Timeout 24 jam → tidak ada aksi otomatis.

**OUTPUT:** `niche_cpm_research_report` di DB → update `channel_strategy` per country & niche → emit `phase.niche_cpm_research.complete`

### Schema DB
```sql
CREATE TABLE niche_cpm_research_log (
  id                   SERIAL PRIMARY KEY,
  research_date        TIMESTAMPTZ DEFAULT NOW(),
  raw_report           JSONB,
  cpm_snapshot         JSONB,
  niche_analysis       JSONB,
  cross_niche          JSONB,
  recommendations      JSONB,
  applied_to           TEXT[]    -- channel_ids yang ter-update
);

CREATE TABLE country_channel_map (
  id               SERIAL PRIMARY KEY,
  channel_id       TEXT REFERENCES channel_registry(channel_id),
  target_country   TEXT,
  target_language  TEXT,
  cpm_tier         TEXT,
  niche_vertical   TEXT,              -- niche vertical untuk channel ini
  sub_niche_focus  TEXT,              -- sub-niche spesifik
  niche_pool       JSONB,             -- topic pool spesifik channel ini
  publish_timezone TEXT,
  publish_slots    TEXT[],
  last_cpm_update  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

---

## FASE 1 — Content Ideation Agent
**Agent:** `ideation-agent` (via 1ai-hub → 1ai-content)
**Trigger:** `channel.ready` | `phase.niche_cpm_research.complete` | `phase.optimize.complete` | `phase.monitor.normal` | `phase.quarantine.active`
**Queue:** `yt_niche:queue:ideation`
**Bias input (opsional):** `breakout_cluster` dari FASE 5 | `niche_cpm_research_report` dari FASE 0B

### Niche Pool (Channel-Aware — dari `country_channel_map.niche_pool`)

Setiap channel punya niche_pool sendiri berdasarkan niche_vertical + target country dari FASE 0B.

```yaml
niche_pool_examples:
  # Folklore channel — Indonesia
  channel_ID_folklore:
    niche_vertical: "folklore_history"
    pool:
      - legenda_cerita_rakyat_daerah
      - misteri_kontroversi_kerajaan
      - tokoh_sejarah_kontroversial
      - urban_legend_modern_indonesia

  # Folklore channel — USA
  channel_USA_folklore:
    niche_vertical: "folklore_history"
    pool:
      - american_folklore_appalachia
      - native_american_legends
      - colonial_america_mysteries
      - cryptid_folklore_origins

  # Music channel — USA (Lofi)
  channel_USA_lofi:
    niche_vertical: "music"
    sub_niche: "lofi_hip_hop"
    pool:
      - lofi_study_beats_1hr
      - lofi_rain_ambient
      - lofi_night_jazz
      - lofi_anime_aesthetic
      - lofi_coffee_shop_ambience

  # Music channel — USA (Dark Ambient)
  channel_USA_dark_ambient:
    niche_vertical: "music"
    sub_niche: "dark_ambient"
    pool:
      - dark_ambient_horror_atmosphere
      - dark_ambient_sleep_forest_rain
      - dark_ambient_dungeon_synth
      - dark_ambient_space_void
      - dark_ambient_mythology_norse

  # Music channel — Global (Compilation)
  channel_GLOBAL_music_mix:
    niche_vertical: "music"
    sub_niche: "genre_compilation"
    pool:
      - jazz_instrumental_compilation
      - classical_piano_relaxation
      - synthwave_retrowave_mix
      - acoustic_guitar_calm
      - bossa_nova_cafe_mix

  # True Crime — USA
  channel_USA_truecrime:
    niche_vertical: "true_crime"
    pool:
      - unsolved_cold_cases_american
      - serial_killer_psychology
      - missing_persons_mystery
      - forensic_science_breakthroughs

# Runtime: agent fetch dari DB country_channel_map.niche_pool berdasarkan channel_id
```

### Agent Instructions
```
SYSTEM:
Kamu adalah Content Ideation Agent untuk channel YouTube multi-niche multi-country.
Tugas: generate batch ide konten yang tinggi potensi viral, standalone, dan belum pernah diupload.

PENTING:
- Setiap channel punya niche_vertical, target_country, target_language, dan production_format sendiri
- Konten HARUS sesuai niche_vertical channel
- Format ide HARUS match production_format (narrated_slideshow vs music_visualizer)

INPUT:
- channel_id: <id channel>
- niche_vertical: <dari channel_registry>
- production_format: <narrated_slideshow | music_visualizer>
- target_country: <dari country_channel_map>
- target_language: <dari country_channel_map>
- sub_niche_focus: <dari country_channel_map>
- niche_pool: <dari country_channel_map.niche_pool>
- past_titles: <list judul video yang sudah upload>
- breakout_cluster: <optional>
- channel_tier: <tier_1 | tier_2 | tier_3>
- content_ratio: { proven_theme: 0.7, random_experiment: 0.3 }

TUGAS UNTUK NARRATED_SLIDESHOW (folklore, true_crime, science, educational):
1. Generate 15 ide topik per batch
   - 70% proven theme / breakout_cluster
   - 30% eksperimen dari niche_pool lain
2. Untuk setiap ide:
   a. Cek konflik versi cerita → tandai HIGH_HOOK
   b. Working title dengan entitas spesifik
   c. 2-3 kalimat ringkasan + angle hook utama
   d. Rekomendasi tone_variant dari niche_vertical.tone_variants
   e. Skor potensi: RENDAH / SEDANG / TINGGI

TUGAS UNTUK MUSIC_VISUALIZER (music, lofi, ambient):
1. Generate 10 ide per batch (music = lebih sedikit ide, lebih sering upload)
2. Untuk setiap ide:
   a. Genre + mood + durasi target
   b. Deskripsi visual style yang cocok
   c. Apakah AI-generated music atau royalty-free
   d. Title formula: "[GENRE] [MOOD] [DURATION] — [SUBTITLE]"
   e. Target use case: study, sleep, relax, workout, focus
   f. Skor potensi berdasarkan trending genre + search volume
3. Music channel cenderung upload lebih sering (1x/hari bahkan saat normal)
   → generate batch lebih besar, ide bisa lebih templatis

JANGAN generate ide yang:
- Judulnya >80% mirip dengan past_titles
- Topiknya sudah dicover di 5 video terakhir
- Tidak ada sumber referensi yang bisa dicari (untuk narrated)

OUTPUT FORMAT (JSON):
{
  "batch_id": "<uuid>",
  "generated_at": "<iso8601>",
  "niche_vertical": "<niche>",
  "production_format": "<format>",
  "channel_tier": "<tier>",
  "ideas": [
    {
      "id": "<uuid>",
      "title_draft": "...",
      "niche_category": "...",
      "sub_niche": "...",
      "hook_type": "HIGH_HOOK | STANDARD",        # untuk narrated
      "tone_variant": "...",
      "summary": "...",                             # untuk narrated
      "genre": "...",                               # untuk music
      "mood": "...",                                # untuk music
      "visual_style": "...",                        # untuk music
      "use_case": "...",                            # untuk music
      "duration_minutes": 15,                       # target durasi
      "potential_score": "TINGGI | SEDANG | RENDAH",
      "conflict_versions": false
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
**Queue:** `yt_niche:queue:production`
**Concurrency:** Max 2 video diproduksi paralel

> ⚠️ Production sub-pipeline **branch** berdasarkan `production_format` dari channel. Pipeline A untuk narrated_slideshow, Pipeline B untuk music_visualizer.

### Pipeline A: NARRATED_SLIDESHOW (folklore, true_crime, science, educational)

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
  │     → OUTPUT: script.md (dengan timestamp marker per segmen)
  │
  ├─► [2B] Voice Synthesis Agent (1ai-content → voice_synthesis_module)
  │     INPUT: script.md + tone_variant
  │     → Convert script ke audio narasi AI — natural storytelling
  │     → Tone sesuai tone_variant
  │     → OUTPUT: narration.mp3 + narration_timestamps.json
  │
  ├─► [2C] Visual Assembly Agent (1ai-content)
  │     Sub-task 2C-1: AI Video Generation (menit pertama)
  │       INPUT: script segmen pertama + tone_variant
  │       → Generate 60 detik AI video — scene paling dramatis
  │       → OUTPUT: opening_segment.mp4
  │     Sub-task 2C-2: Slideshow Assembly (sisa durasi)
  │       INPUT: script.md + narration_timestamps.json
  │       → Generate ilustrasi AI per adegan (boleh reuse/looping)
  │       → Sync ke timestamp narasi
  │       → OUTPUT: slideshow_segment.mp4
  │     Sub-task 2C-3: Final Assembly
  │       → Concat: opening + slideshow
  │       → Merge dengan narration.mp3
  │       → Add background music (ambient, volume rendah, sesuai tone)
  │       → OUTPUT: final_video.mp4
  │
  ├─► [2D] Thumbnail Generator (1ai-content → thumbnail_gen_module)
  │     INPUT: story_title + tone_variant + primary_entity + niche_vertical
  │     → Generate thumbnail sesuai niche style (clickbait / minimalist / dark)
  │     → OUTPUT: thumbnail.png
  │
  └─► [2E] SEO Optimizer Agent (1ai-content → 1ai-social)
        INPUT: idea + script.md + channel_tier + niche_vertical
        → Finalisasi judul: entitas spesifik + trigger emosi
        → Generate 5 kandidat judul → skor CTR estimate → pilih tertinggi
        → Deskripsi: nama tokoh/daerah/keyword spesifik
        → Tags: 15-20 (campuran broad + long-tail)
        → OUTPUT: seo_package.json
```

### Pipeline B: MUSIC_VISUALIZER (music, lofi, ambient, compilation)

```
idea_backlog
  │
  ├─► [2B-1] Music Source Agent (1ai-content)
  │     INPUT: idea.genre + idea.mood + idea.duration_minutes
  │     → Opsi A: Generate music via AI (Suno/Udio/self-hosted)
  │       - Prompt: genre + mood + tempo + instrument preference
  │       - Generate loop-friendly tracks (bisa di-loop tanpa jeda)
  │     → Opsi B: Source dari royalty-free library
  │       - Search by genre/mood/duration
  │       - Verify license compatibility
  │     → Opsi C: Compile multiple tracks jadi satu mix
  │       - Crossfade antar track, gapless playback
  │     → OUTPUT: audio_track.mp3 (durasi = target tier)
  │
  ├─► [2B-2] Visual Generator Agent (1ai-content)
  │     INPUT: idea.visual_style + idea.genre + audio_track duration
  │     → Opsi A: AI Visualizer
  │       - Generate visual loop/animation yang cocok dengan mood
  │       - 60-120 detik loop yang seamless
  │     → Opsi B: Ambient Slideshow
  │       - Generate 5-10 gambar ambient (landscape, cityscape, abstract)
  │       - Slow crossfade, loop halus
  │     → Opsi C: Static Image + Waveform
  │       - 1 gambar aesthetic + waveform/visualizer overlay
  │       - Paling murah, cocok untuk compilations
  │     → OUTPUT: visual_loop.mp4
  │
  ├─► [2B-3] Assembly Agent (1ai-content → video_assembler)
  │     INPUT: audio_track.mp3 + visual_loop.mp4
  │     → Loop visual sampai match durasi audio
  │     → Merge audio + visual
  │     → OUTPUT: final_video.mp4
  │
  ├─► [2B-4] Thumbnail Generator (1ai-content → thumbnail_gen_module)
  │     INPUT: idea.genre + idea.mood + niche_vertical="music"
  │     → Generate minimalist thumbnail (genre/mood indicator)
  │     → OUTPUT: thumbnail.png
  │
  └─► [2B-5] SEO Optimizer Agent (1ai-content → 1ai-social)
        INPUT: idea + niche_vertical="music"
        → Title formula: "[GENRE] [MOOD] [DURATION] — [SUBTITLE]"
        → Deskripsi: genre tags, use case keywords, timestamps (jika multi-track)
        → Tags: 20-30 (genre + mood + use case + duration keywords)
        → OUTPUT: seo_package.json
```

### Script Formula Spec (untuk Pipeline A — Narrated)
```yaml
script_structure:
  target_duration_by_tier:
    tier_1: 15   # menit
    tier_2: 30   # menit
    tier_3: 60   # menit

  hook:
    duration_seconds: [5, 10]
    type: "mystery_question | shocking_fact | unresolved_mystery | controversial_claim"
    rule: "WAJIB lontarkan pertanyaan/pernyataan yang memaksa orang lanjut nonton"

  body:
    structure: "curiosity_loop"
    rule: "Setiap jawaban membuka pertanyaan baru — jangan resolve terlalu cepat"
    twist_at: "70%_duration"

  resolution:
    position: "last_20%"
    rule: "Beri jawaban/penjelasan, boleh sisakan ambiguitas untuk engagement komentar"

  cta:
    position: "end_card"
    content: "Subscribe + notif + pertanyaan ke komentar"

  timestamp_markers:
    rule: "Wajib ada marker [MM:SS] setiap pergantian adegan/segmen untuk sync visual"
```

**[HUMAN_GATE]:** Setelah semua aset siap → kirim preview ke Telegram: thumbnail + judul + 3 kalimat pertama hook (narrated) atau genre+mood+duration (music). Operator punya 30 menit approve/reject/edit sebelum auto-approve.

**OUTPUT:** `final_video_package` (video.mp4 + thumbnail.png + seo_package.json) → emit `phase.production.complete` → FASE 3

---

## FASE 3 — Auto-Publisher Agent
**Agent:** `publisher-agent` (YouTube Data API v3)
**Trigger:** `phase.production.complete`
**Queue:** `yt_niche:queue:publish`

### Jadwal Upload (Country-Aware Timezone)
```yaml
publish_schedule:
  timezone: "<dari country_channel_map.publish_timezone>"
  daily_slots: "<dari country_channel_map.publish_slots>"
  priority: "consistency_over_volume"
  max_per_day: 2

  # Default per timezone region:
  timezone_defaults:
    "America/New_York":    ["15:00", "07:00"]   # 3 PM WIB = 3 AM ET (early morning US) → malam WIB
                                              # Tapi untuk target US: upload jam 15:00 WIB = 03:00 ET
                                              # YouTube processing + indexing = siap saat US prime time
    "America/Los_Angeles": ["15:00", "07:00"]   # 3 PM WIB = midnight PT
    "Europe/London":       ["20:00", "07:00"]   # UK prime time
    "Asia/Jakarta":        ["20:00", "05:00"]   # Indonesia prime time
    "Asia/Tokyo":          ["20:00", "07:00"]   # Japan/Korea
    "Australia/Sydney":    ["20:00", "07:00"]   # Australia

  # US target override: upload jam 15:00 WIB
  # Alasan: 15:00 WIB = 02:00-03:00 AM US Eastern
  # YouTube butuh ~1-2 jam processing → video siap saat US morning (6-8 AM)
  # = video masik fresh di feed saat prime viewing hours US
  us_target_upload_time_wib: "15:00"

  # Music channel: bisa upload lebih sering (1x/hari saat normal, 1x/hari saat quarantine)
  music_channel_schedule:
    normal: 1        # video per hari
    quarantine: 1    # video per hari (sama — music channel = high volume)
```

### Publisher Agent Task
```
1. Ambil video package dari queue (FIFO per priority score)
2. Cek channel status:
   - Jika quarantine: cek apakah sudah upload hari ini → jika sudah, skip ke slot besok
   - Jika normal: cek max_per_day limit
3. Upload ke YouTube via API:
   - title, description, tags dari seo_package.json
   - thumbnail dari thumbnail.png
   - scheduled_for: slot berikutnya yang kosong
   - privacy: "private" → auto-publish saat scheduled time
4. Setelah upload sukses:
   - Simpan video_id ke DB published_videos
   - Set monitoring_start = scheduled_publish_time
   - Emit: phase.publish.complete { video_id, channel_id, publish_time }
5. Gagal upload → retry 3x exponential backoff → notif Telegram
```

**Schema:**
```sql
CREATE TABLE published_videos (
  video_id          TEXT PRIMARY KEY,
  channel_id        TEXT REFERENCES channel_registry(channel_id),
  idea_id           TEXT,
  niche_vertical    TEXT,
  production_format TEXT,
  title             TEXT,
  duration_minutes  INTEGER,
  tier              TEXT,
  published_at      TIMESTAMPTZ,
  monitoring_start  TIMESTAMPTZ,
  status            TEXT DEFAULT 'monitoring',
  -- monitoring | breakout | growing | dead | deleted | transferred | quarantine_upload
  breakout_cluster  TEXT,
  triage_decision   TEXT,
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

    # DEAD: tidak ada trafik meaningful dalam 10 hari
    is_dead = (
        views_10d < 100
        and ctr < 0.02
        and avg_view_pct < 0.20
    )

    # GOOD: trafik baik — kandidat transfer ke master channel
    is_good = (
        views_10d > channel_avg * 2
        or ctr > 0.05
        or avg_view_pct > 0.40
    )

    if is_dead:
        schedule_delete(video_id, delay_hours=1)
        notify_telegram(f"🗑️ TRIAGE DELETE: {video_id} | Views 10d: {views_10d}")
        update_video_status(video_id, "deleted")
        return "DELETE"

    elif is_good:
        update_video_status(video_id, "transfer_candidate")
        check_channel_transfer_readiness(video_id)
        notify_telegram(f"✅ TRIAGE GOOD: {video_id} | Kandidat transfer")
        return "TRANSFER_CANDIDATE"

    else:
        update_video_status(video_id, "growing")
        return "KEEP"
```

### Channel Transfer Logic

```yaml
channel_transfer:
  rationale: >
    Channel yang isinya penuh video berperforma baik → transfer ke "master channel".
    Channel sumber menjadi clean slate untuk eksperimen baru.

  trigger_condition:
    - channel memiliki ≥ 5 video dengan status "transfer_candidate" ATAU
    - channel_traffic_score tinggi (avg CTR > 5% pada 10 video terakhir)

  process:
    step_1: "Audit semua video — pisahkan GOOD vs DEAD"
    step_2: "Delete semua video DEAD"
    step_3: "[HUMAN_GATE] Notifikasi Telegram — konfirmasi transfer"
    step_4: "Transfer channel ownership ke Google Account master"
    step_5: "Update channel_registry: master_channel_id, traffic_status = 'transferred'"
    step_6: "Buka channel sumber untuk batch berikutnya"

  master_channel:
    description: >
      1 channel utama = konsolidasi video terbaik dari semua satellite.
      Tidak diproduksi rutin — hanya menerima transfer.
    managed_by: "human_operator"
    db_flag: "is_master_channel = TRUE"
```

**Schema tambahan:**
```sql
ALTER TABLE channel_registry ADD COLUMN IF NOT EXISTS is_master_channel BOOLEAN DEFAULT FALSE;
ALTER TABLE channel_registry ADD COLUMN IF NOT EXISTS traffic_score FLOAT;

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
Kamu adalah Breakout Analysis Agent. Video channel terdeteksi BREAKOUT.
Tugasmu: bedah elemen spesifik, lalu generate action plan konten turunan.

INPUT:
- video_metadata: { title, description, tags, thumbnail_spec, tone_variant, duration_tier, niche_vertical, production_format }
- video_analytics: { views, ctr, avg_view_pct, traffic_source_breakdown }
- channel_history: [ last 20 published videos dengan metrics ]

ANALISIS (confidence score 0.0–1.0):
1. Topik/Genre/Mood — elemen spesifik yang dominan?
2. Jenis Konten — sesuai niche_vertical
3. Judul Pattern — panjang, struktur, trigger word
4. Thumbnail Style — elemen visual dominan
5. Traffic Source — Search (SEO) vs Suggested (algo) vs Shorts
6. Hook Type — untuk narrated: pertanyaan/fakta; untuk music: genre/mood
7. Tone/Genre Variant — apakah variant tertentu perform lebih baik?
8. Duration Signal — apakah durasi tier berkontribusi ke AVD tinggi?

OUTPUT FORMAT (JSON):
{
  "breakout_video_id": "...",
  "niche_vertical": "...",
  "production_format": "...",
  "cluster": {
    "primary_element": "...",
    "secondary_elements": [...],
    "story_type": "...",           # untuk narrated
    "genre_mood": "...",           # untuk music
    "tone_variant": "...",
    "traffic_driver": "search | suggested | shorts",
    "best_duration_tier": "tier_1 | tier_2 | tier_3",
    "recommended_angle_variations": [
      { "angle": "...", "hook_type": "...", "tone_variant": "...", "title_draft": "..." }
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
        push_to_queue("yt_niche:queue:ideation", {
            "idea": angle,
            "priority": "HIGH",
            "breakout_bias": cluster
        })

    # 2. Buat playlist tematik
    create_or_update_playlist(
        title=f"{cluster['primary_element']} — Koleksi Lengkap",
        video_ids=get_related_video_ids(cluster)
    )

    # 3. Re-optimasi video lama yang temanya mirip
    for old_vid in cluster["related_old_videos_to_reoptimize"]:
        push_to_queue("yt_niche:queue:reoptimize", {
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
**Trigger:** Item di `yt_niche:queue:reoptimize`

```
SYSTEM:
Kamu adalah Video Re-Optimizer. Update judul dan thumbnail video lama agar align
dengan momentum breakout video terbaru.

INPUT:
- old_video: { video_id, current_title, current_thumbnail_spec, current_metrics, niche_vertical }
- breakout_context: { cluster, primary_element, title_pattern, tone_variant }

TUGAS:
1. Generate 3 kandidat judul baru — aligned dengan pattern breakout
2. Generate thumbnail spec baru (sesuai niche_vertical style)
3. Update deskripsi dengan entitas tambahan dari cluster
4. JANGAN ubah konten video itu sendiri

OUTPUT: update_package → publish via YouTube API
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

  backlog_minimum: 5
  production_queue_max: 8

  channel_tier_auto_upgrade:
    to_tier_2: "avg_views_last_5 > 500 AND channel_age_days >= 30"
    to_tier_3: "breakout_detected == true AND avg_views_last_5 > 2000"

  # Upload frequency by niche
  upload_frequency:
    narrated_slideshow:
      normal: "1 video / 2-3 hari"      # produksi lebih lama
      quarantine: "1 video / hari"       # minimal untuk jaga channel aktif
    music_visualizer:
      normal: "1 video / hari"           # produksi lebih cepat, music channel = high volume
      quarantine: "1 video / hari"       # sama — music channel konsisten

  weekly_review:
    - Rekap metrics semua video 7 hari terakhir
    - Update niche_pool weight berdasarkan performa
    - Cek video hari ke-10 yang pending triage
    - Evaluasi channel transfer candidates
    - Cek channel quarantine eligibility (7-month check + traffic drop)
    - Kirim laporan Telegram

multi_channel:
  strategy: "satellite → master consolidation"
  constraint:
    - Setiap satellite channel beda niche_vertical / identitas
    - Tidak boleh re-upload konten channel lain
    - Master channel hanya menerima transfer
  new_satellite_trigger:
    - Ada Gmail baru siap
    - Ada niche baru dari FASE 0B research dengan potensi tinggi
    - Satellite lama sudah sukses transfer ke master
```

---

## FASE 7 — Channel Quarantine Agent ⚠️ NEW
**Agent:** `quarantine-agent`
**Trigger:** Scheduled check (weekly cron `0 10 * * 1`) + `phase.traffic_drop.detected`
**Queue:** `yt_niche:queue:quarantine`

### Tujuan

Channel YouTube **kehilangan traffic secara natural setelah ~7 bulan** operasi. Ini bukan penalty YouTube — ini pattern algoritma YouTube yang mengurangi rekomendasi ke channel yang mulai stagnan.

**Strategi quarantine:**
1. **Reduce upload frequency** ke 1 video/hari (dari normal yang mungkin 2-3/hari)
2. **Tetap upload konsisten** — jangan berhenti total, channel harus tetap aktif
3. **Focus on quality** — prioritaskan konten proven, kurangi eksperimen
4. **Monitor traffic** — jika traffic recovery, keluar dari quarantine
5. **Jika tidak recovery** dalam 2-3 bulan → evaluasi channel transfer atau restart

### Quarantine Detection

```python
def check_quarantine_eligibility(channel_id: str) -> dict:
    channel = get_channel(channel_id)
    channel_age_days = channel["channel_age_days"]
    traffic_status = channel["traffic_status"]

    # Skip jika sudah quarantine atau transferred/deleted
    if traffic_status in ["quarantine", "transferred", "deleted"]:
        return {"eligible": False, "reason": f"already {traffic_status}"}

    # SCHEDULED CHECK: channel sudah ~7 bulan (200-230 hari)
    is_age_trigger = 200 <= channel_age_days <= 230

    # TRAFFIC DROP CHECK: traffic turun signifikan
    recent_views = get_avg_views_last_n(channel_id, days=14)
    previous_views = get_avg_views_last_n(channel_id, days=30, offset=14)
    traffic_drop_pct = (previous_views - recent_views) / previous_views if previous_views > 0 else 0

    is_traffic_drop = traffic_drop_pct > 0.40  # >40% drop

    # Kombinasi: scheduled trigger + traffic drop sebagai konfirmasi
    if is_age_trigger and is_traffic_drop:
        return {
            "eligible": True,
            "trigger": "scheduled + traffic_drop",
            "confidence": "HIGH",
            "channel_age_days": channel_age_days,
            "traffic_drop_pct": traffic_drop_pct
        }
    elif is_age_trigger:
        return {
            "eligible": True,
            "trigger": "scheduled_only",
            "confidence": "MEDIUM",
            "channel_age_days": channel_age_days,
            "traffic_drop_pct": traffic_drop_pct,
            "note": "Age trigger aktif tapi traffic belum drop signifikan — monitor 2 minggu lagi"
        }
    elif is_traffic_drop and channel_age_days > 150:
        return {
            "eligible": True,
            "trigger": "traffic_drop_early",
            "confidence": "MEDIUM",
            "channel_age_days": channel_age_days,
            "traffic_drop_pct": traffic_drop_pct,
            "note": "Traffic drop detected sebelum 7 bulan — early quarantine"
        }
    else:
        return {"eligible": False, "reason": "not triggered"}
```

### Quarantine Mode Rules

```yaml
quarantine_rules:
  upload_frequency:
    narrated_slideshow: "1 video per hari"    # turun dari normal 1/2-3 hari → actually NAIK
                                              # tujuan: jaga channel aktif dengan upload konsisten
    music_visualizer: "1 video per hari"      # tetap sama

  content_strategy:
    proven_theme_ratio: 0.90                  # 90% proven, 10% eksperimen (dari normal 70/30)
    reuse_breakout_clusters: true             # revisit cluster yang pernah perform
    avoid_new_niche_experiment: true          # jangan buka niche baru saat quarantine

  monitoring:
    check_interval: "weekly"                  # cek traffic weekly, bukan hourly
    recovery_threshold: "avg_views_last_14d > avg_views_pre_quarantine * 0.8"
    exit_after_months: 3                      # jika tidak recovery dalam 3 bulan → evaluasi

  upload_time:
    note: "Tetap konsisten di slot waktu yang sama — jangan ganti upload time saat quarantine"
    us_target: "15:00 WIB"                    # tetap sama
    id_target: "20:00 WIB"                    # tetap sama

  notifications:
    on_enter: |
      🔒 CHANNEL MASUK QUARANTINE
      Channel: {channel_id} | Niche: {niche_vertical}
      Umur: {channel_age_days} hari
      Traffic Drop: {traffic_drop_pct}%
      Trigger: {trigger_type}
      → Upload 1/hari, focus proven content
      → Monitoring weekly, recovery threshold: {recovery_threshold}
    on_exit: |
      ✅ CHANNEL KELUAR QUARANTINE
      Channel: {channel_id}
      Traffic recovered: {recovery_pct}%
      → Kembali ke mode normal
    on_failed_recovery: |
      ⚠️ QUARANTINE — RECOVERY GAGAL
      Channel: {channel_id}
      Sudah {quarantine_months} bulan dalam quarantine, traffic belum recovery
      → Evaluasi: transfer channel / restart / niche pivot
      [TRANSFER TO MASTER] [CHANGE NICHE] [DELETE CHANNEL]
```

### Quarantine Lifecycle

```python
def quarantine_lifecycle(channel_id: str):
    eligibility = check_quarantine_eligibility(channel_id)

    if not eligibility["eligible"]:
        return

    # ENTER QUARANTINE
    update_channel(channel_id, {
        "traffic_status": "quarantine",
        "quarantine_started": now(),
        "content_ratio": {"proven_theme": 0.90, "random_experiment": 0.10}
    })
    notify_telegram(quarantine_enter_message(channel_id, eligibility))

    # WEEKLY MONITORING LOOP
    while True:
        sleep(weeks(1))
        channel = get_channel(channel_id)
        quarantine_months = (now() - channel["quarantine_started"]).days / 30

        # Check recovery
        recent_views = get_avg_views_last_n(channel_id, days=14)
        pre_quarantine_views = get_avg_views_pre_quarantine(channel_id)
        recovery_pct = recent_views / pre_quarantine_views if pre_quarantine_views > 0 else 0

        if recovery_pct > 0.80:
            # RECOVERY SUCCESS
            update_channel(channel_id, {"traffic_status": "growing", "quarantine_started": None})
            notify_telegram(quarantine_exit_message(channel_id, recovery_pct))
            emit_event("phase.quarantine.exit", {"channel_id": channel_id})
            return "RECOVERED"

        if quarantine_months >= 3:
            # RECOVERY FAILED — 3 bulan dalam quarantine
            notify_telegram(quarantine_failed_message(channel_id, quarantine_months))
            emit_event("phase.quarantine.failed", {"channel_id": channel_id})
            # [HUMAN_GATE] — operator decide: transfer / niche pivot / delete
            return "FAILED_RECOVERY"

        # CONTINUE QUARANTINE
        log_quarantine_weekly(channel_id, recovery_pct, recent_views)
```

### Schema DB
```sql
CREATE TABLE quarantine_log (
  id                  SERIAL PRIMARY KEY,
  channel_id          TEXT REFERENCES channel_registry(channel_id),
  action              TEXT,        -- ENTER | WEEKLY_CHECK | EXIT | FAILED
  trigger_type        TEXT,        -- scheduled | traffic_drop | scheduled+traffic_drop
  channel_age_days    INTEGER,
  traffic_drop_pct    FLOAT,
  recovery_pct        FLOAT,
  quarantine_months   FLOAT,
  details             JSONB,
  recorded_at         TIMESTAMPTZ DEFAULT NOW()
);
```

---

## AGENT REGISTRY (1ai-hub Routing)

```yaml
agents:
  niche-cpm-research-agent:
    routes_to: 1ai-social
    model: claude-sonnet-4-6
    temperature: 0.4
    tools: [web_search, trend_analysis, google_trends]
    schedule: "0 8 1 * *"
    output_schema: niche_cpm_research_report.json
    human_gate_on: new_channel_recommendation

  ideation-agent:
    routes_to: 1ai-content
    model: claude-sonnet-4-6
    temperature: 0.9
    context_injection: [past_titles, breakout_cluster, channel_tier, niche_vertical, production_format]

  production-agent:
    routes_to: 1ai-content
    branch_by: production_format
    sub_modules:
      # Pipeline A: narrated_slideshow
      script_writer:
        model: claude-sonnet-4-6
        temperature: 0.85
        when: "production_format == narrated_slideshow"
      voice_synthesis:
        module: 1ai-content.voice_synthesis_module
        style: natural_storytelling
        when: "production_format == narrated_slideshow"
      video_gen:
        module: 1ai-content.video_gen_module
        duration_seconds: 60
        when: "production_format == narrated_slideshow"
      slideshow_assembler:
        module: 1ai-content.slideshow_assembler
        sync_to: narration_timestamps
        when: "production_format == narrated_slideshow"

      # Pipeline B: music_visualizer
      music_source:
        module: 1ai-content.music_gen_module
        sources: [suno, udio, royalty_free_library]
        when: "production_format == music_visualizer"
      visual_generator:
        module: 1ai-content.video_gen_module
        mode: ambient_visualizer
        when: "production_format == music_visualizer"
      music_assembler:
        module: 1ai-content.video_assembler
        mode: audio_visual_merge
        when: "production_format == music_visualizer"

      # Shared
      thumbnail_gen:
        module: 1ai-content.thumbnail_gen_module
        style_by_niche: true
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
    quarantine_aware: true    # cek upload limit saat quarantine

  reoptimize-agent:
    routes_to: 1ai-content, 1ai-social
    model: claude-haiku-4-5
    temperature: 0.4
    tools: [youtube_data_api_v3]

  scale-manager-agent:
    type: orchestrator
    schedule: "0 9 * * 1"
    reports_to: telegram_bot_master
    quarantine_check: true    # weekly quarantine eligibility check

  quarantine-agent:
    type: lifecycle_agent
    schedule: "0 10 * * 1"   # weekly Senin jam 10 WIB
    trigger_events: [phase.traffic_drop.detected]
    tools: [youtube_analytics_api, channel_registry_db]
    human_gate_on: quarantine_failed_recovery
```

---

## TELEGRAM NOTIFICATION SPEC (@berkahkarya-saas-bot)

```yaml
notifications:
  niche_cpm_research_complete:
    trigger: phase.niche_cpm_research.complete
    message: |
      🌍 NICHE & CPM RESEARCH UPDATE
      Date: {research_date}
      Top CPM Countries: {top_3_cpm_countries}
      Niches Analyzed: {niche_count}
      New Opportunities: {opportunity_count}

      🏆 Top 3 Peluang:
      1. {opp_1_niche} × {opp_1_country} | CPM ${opp_1_cpm} | Kompetisi: {opp_1_competition}
      2. {opp_2_niche} × {opp_2_country} | CPM ${opp_2_cpm}
      3. {opp_3_niche} × {opp_3_country} | CPM ${opp_3_cpm}

      📌 Rekomendasi Channel Baru: {new_channel_count}
      [BUKA CHANNEL BARU] [SKIP BULAN INI] [LIHAT DETAIL]

  breakout_alert:
    trigger: phase.breakout.detected
    message: |
      🔥 BREAKOUT DETECTED
      Channel: {channel_id} | Niche: {niche_vertical} | Tier: {current_tier}
      Video: {title}
      Views 48h: {views} (avg channel: {channel_avg})
      CTR: {ctr}% | AVD: {avg_view_pct}%
      Traffic: {top_traffic_source}
      → Cluster analysis running...

  triage_delete:
    trigger: triage.decision == DELETE
    message: |
      🗑️ VIDEO DIHAPUS (10-hari dead)
      Channel: {channel_id} | Niche: {niche_vertical}
      Video: {title}
      Views 10d: {views} | CTR: {ctr}%

  triage_transfer_candidate:
    trigger: triage.decision == TRANSFER_CANDIDATE
    message: |
      ✅ VIDEO BAGUS — KANDIDAT TRANSFER
      Channel: {channel_id} | Niche: {niche_vertical}
      Video: {title}
      Views 10d: {views} | CTR: {ctr}% | AVD: {avg_view_pct}%
      [APPROVE TRANSFER] [KEEP DI SINI] [SKIP]

  channel_transfer_ready:
    trigger: channel_transfer_readiness_met
    message: |
      📦 CHANNEL SIAP TRANSFER KE MASTER
      Channel: {channel_id} | Niche: {niche_vertical}
      Video bagus: {good_video_count} | Video dihapus: {deleted_count}
      [CONFIRM TRANSFER] [TUNDA]

  production_preview:
    trigger: pre_publish_gate
    message: |
      📹 VIDEO SIAP PUBLISH — PREVIEW
      Judul: {title}
      Niche: {niche_vertical} | Format: {production_format}
      Tone: {tone_variant} | Durasi: {duration_minutes} menit | Tier: {tier}
      Schedule: {publish_time}
      [APPROVE] [REJECT] [EDIT JUDUL]
    timeout_auto_approve: 1800

  quarantine_enter:
    trigger: channel_quarantine_enter
    message: |
      🔒 CHANNEL MASUK QUARANTINE
      Channel: {channel_id} | Niche: {niche_vertical}
      Umur: {channel_age_days} hari
      Traffic Drop: {traffic_drop_pct}%
      Trigger: {trigger_type}
      → Upload 1/hari, focus proven content
      → Monitoring weekly

  quarantine_exit:
    trigger: channel_quarantine_exit
    message: |
      ✅ CHANNEL KELUAR QUARANTINE
      Channel: {channel_id}
      Traffic recovered: {recovery_pct}%
      → Kembali ke mode normal

  quarantine_failed:
    trigger: quarantine_recovery_failed
    message: |
      ⚠️ QUARANTINE — RECOVERY GAGAL
      Channel: {channel_id}
      Sudah {quarantine_months} bulan, traffic belum recovery
      [TRANSFER TO MASTER] [CHANGE NICHE] [DELETE CHANNEL]

  weekly_report:
    trigger: cron_weekly
    message: |
      📊 WEEKLY REPORT
      Channel: {channel_id} | Niche: {niche_vertical} | Tier: {current_tier}
      Status: {traffic_status}
      Period: {date_range}
      Total Views: {total_views}
      Best Video: {top_video_title} ({top_views} views)
      Avg CTR: {avg_ctr}% | New Subs: {new_subs}
      Triage: {deleted_count} deleted, {transfer_count} transfer candidates
      Revenue Est: Rp {revenue_estimate}
      Active Cluster: {active_cluster}

  tier_upgrade:
    trigger: channel_tier_upgraded
    message: |
      ⬆️ CHANNEL UPGRADE TIER
      Channel: {channel_id} | Niche: {niche_vertical}
      {old_tier} → {new_tier}
      Target durasi: {new_duration} menit

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
  niche_vertical      TEXT NOT NULL,
  niche_name          TEXT,
  production_format   TEXT NOT NULL,
  target_country      TEXT,
  target_language     TEXT,
  cpm_tier            TEXT DEFAULT 'tier_D',
  yt_oauth_token      TEXT,
  tier                TEXT DEFAULT 'tier_1_cold_start',
  total_published     INTEGER DEFAULT 0,
  channel_age_days    INTEGER DEFAULT 0,
  traffic_status      TEXT DEFAULT 'unproven',
  is_master_channel   BOOLEAN DEFAULT FALSE,
  master_channel_id   TEXT,
  traffic_score       FLOAT,
  quarantine_started  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  setup_complete      BOOLEAN DEFAULT FALSE
);

-- Niche & CPM Research Log
CREATE TABLE niche_cpm_research_log (
  id                   SERIAL PRIMARY KEY,
  research_date        TIMESTAMPTZ DEFAULT NOW(),
  raw_report           JSONB,
  cpm_snapshot         JSONB,
  niche_analysis       JSONB,
  cross_niche          JSONB,
  recommendations      JSONB,
  applied_to           TEXT[]
);

-- Country Channel Map
CREATE TABLE country_channel_map (
  id               SERIAL PRIMARY KEY,
  channel_id       TEXT REFERENCES channel_registry(channel_id),
  target_country   TEXT,
  target_language  TEXT,
  cpm_tier         TEXT,
  niche_vertical   TEXT,
  sub_niche_focus  TEXT,
  niche_pool       JSONB,
  publish_timezone TEXT,
  publish_slots    TEXT[],
  last_cpm_update  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Idea Backlog
CREATE TABLE idea_backlog (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id        TEXT REFERENCES channel_registry(channel_id),
  niche_vertical    TEXT,
  production_format TEXT,
  batch_id          UUID,
  title_draft       TEXT,
  niche_category    TEXT,
  sub_niche         TEXT,
  hook_type         TEXT,
  tone_variant      TEXT,
  summary           TEXT,
  genre             TEXT,          -- untuk music
  mood              TEXT,          -- untuk music
  visual_style      TEXT,          -- untuk music
  use_case          TEXT,          -- untuk music
  duration_minutes  INTEGER,
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
  niche_vertical    TEXT,
  production_format TEXT,
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
  niche_vertical        TEXT,
  trigger_video_id      TEXT REFERENCES published_videos(video_id),
  primary_element       TEXT,
  secondary_elements    JSONB,
  story_type            TEXT,
  genre_mood            TEXT,          -- untuk music
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

-- Quarantine Log
CREATE TABLE quarantine_log (
  id                  SERIAL PRIMARY KEY,
  channel_id          TEXT REFERENCES channel_registry(channel_id),
  action              TEXT,
  trigger_type        TEXT,
  channel_age_days    INTEGER,
  traffic_drop_pct    FLOAT,
  recovery_pct        FLOAT,
  quarantine_months   FLOAT,
  details             JSONB,
  recorded_at         TIMESTAMPTZ DEFAULT NOW()
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
workflow: youtube_multi_niche
version: "4.0"
ecosystem: 1ai-ecosystem
niche_mode: agnostic  # niche ditentukan oleh research agent, bukan hardcoded

infrastructure:
  event_bus: redis_pubsub
  event_channel: "yt_niche:events"
  queue_prefix: "yt_niche:queue"
  state_db: postgresql
  scheduler: celery_beat
  timezone: "Asia/Jakarta"
  notification_channel: telegram
  telegram_bot: "@berkahkarya-saas-bot"

strategy:
  mode: multi_niche_multi_country_high_cpm
  primary_targets: [USA, UK, Canada, Australia, Norway, Germany]
  secondary_targets: [France, Ireland, Japan, South Korea, Brazil]
  baseline: [Indonesia, Malaysia, Philippines]
  niche_research_interval_days: 30
  cpm_research_interval_days: 30
  quarantine_trigger_age_days: 210   # ~7 bulan
  quarantine_recovery_months: 3

content_modules:
  all_generation: 1ai-content
  seo_distribution: 1ai-social
  revenue_tracking: 1ai-ads

niche_verticals_config:
  supported:
    - folklore_history
    - music
    - true_crime
    - science_nature
    - educational
  extensible: true  # bisa ditambah via FASE 0B research recommendations

production_formats:
  narrated_slideshow:
    description: "Narasi AI + slideshow ilustrasi + opening AI video"
    modules: [script_writer, voice_synthesis, video_gen, slideshow_assembler]
    thumbnail_style: niche_adaptive
  music_visualizer:
    description: "Audio track + visual loop/ambient slideshow"
    modules: [music_source, visual_generator, music_assembler]
    thumbnail_style: minimalist

video_format:
  tier_1: { duration_minutes: 15, condition: "total_published < 10 OR age_days < 30" }
  tier_2: { duration_minutes: 30, condition: "avg_views_last_5 > 500 AND age_days >= 30" }
  tier_3: { duration_minutes: 60, condition: "breakout_detected AND avg_views_last_5 > 2000" }

upload_schedule:
  us_target_wib: "15:00"   # 3 PM WIB = US early morning → fresh di feed saat prime time
  id_target_wib: "20:00"
  global_default_wib: "20:00"
  quarantine_frequency: "1/hari"   # semua niche saat quarantine

phases:
  - id: setup
    type: manual_one_time
    human_required: true
    completion_event: "channel.ready"

  - id: niche_cpm_research
    type: recurring_cron
    agent: niche-cpm-research-agent
    routes_to: 1ai-social
    schedule: "0 8 1 * *"
    trigger_events: ["channel.ready"]
    queue: "yt_niche:queue:niche_cpm_research"
    tools: [web_search, trend_analysis, google_trends]
    output: [niche_cpm_research_log, country_channel_map_updates]
    human_gate: { trigger: new_channel_recommendation, timeout_hours: 24 }
    completion_event: "phase.niche_cpm_research.complete"

  - id: ideation
    type: recurring
    agent: ideation-agent
    trigger_events: ["channel.ready", "phase.niche_cpm_research.complete", "phase.optimize.complete", "phase.monitor.normal", "phase.quarantine.active"]
    queue: "yt_niche:queue:ideation"
    branch_by: production_format
    human_gate: { condition: "high_potential >= 3", timeout_minutes: 120 }
    completion_event: "phase.ideation.complete"

  - id: production
    type: pipeline
    agent: production-agent
    routes_to: 1ai-content
    trigger_events: ["phase.ideation.complete"]
    queue: "yt_niche:queue:production"
    concurrency: 2
    branch_by: production_format
    pipeline_a: [script_writer, voice_synthesis, video_gen, slideshow_assembler, thumbnail_gen, seo_optimizer]
    pipeline_b: [music_source, visual_generator, music_assembler, thumbnail_gen, seo_optimizer]
    human_gate: { trigger: pre_publish, timeout_minutes: 30 }
    completion_event: "phase.production.complete"

  - id: publish
    type: scheduled
    agent: publisher-agent
    trigger_events: ["phase.production.complete"]
    queue: "yt_niche:queue:publish"
    quarantine_aware: true
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
    queue: "yt_niche:queue:triage"
    decisions:
      DELETE: { condition: "views < 100 AND ctr < 0.02 AND avg_view_pct < 0.20", action: auto_delete }
      TRANSFER_CANDIDATE: { condition: "views > avg*2 OR ctr > 0.05 OR avg_view_pct > 0.40", action: flag_and_notify }
      KEEP: { default: true, action: continue_monitoring_weekly }
    channel_transfer:
      trigger: "good_videos >= 5 OR channel_avg_ctr > 0.05"
      human_gate: true

  - id: optimize
    type: analysis_and_action
    agent: breakout-analyst-agent
    trigger_events: ["phase.breakout.detected"]
    queue: "yt_niche:queue:optimize"
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
    queue: "yt_niche:queue:reoptimize"
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

  - id: quarantine
    type: lifecycle
    agent: quarantine-agent
    schedule: "0 10 * * 1"
    trigger_events: ["phase.traffic_drop.detected"]
    detection:
      scheduled_age_days: [200, 230]
      traffic_drop_threshold: 0.40
      min_age_for_early_trigger: 150
    rules:
      upload_frequency: "1 per hari"
      content_ratio: { proven_theme: 0.90, random_experiment: 0.10 }
      monitoring: weekly
      recovery_threshold: 0.80
      exit_after_months: 3
    on_enter: emit "phase.quarantine.active"
    on_exit: emit "phase.quarantine.exit"
    on_failed: emit "phase.quarantine.failed"
    human_gate: quarantine_failed_recovery

human_gates:
  - id: gate_niche_research
    condition: "new_channel_recommendations present"
    timeout_hours: 24
    default_on_timeout: no_action

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
    timeout_minutes: null
    actions: [confirm_transfer, tunda]

  - id: gate_quarantine_failed
    trigger: quarantine_recovery_failed
    timeout_minutes: null
    actions: [transfer_to_master, change_niche, delete_channel]

error_handling:
  retry_policy: { max: 3, backoff: exponential, base_seconds: 60 }
  on_max_retry: notify_telegram_error_alert
  dead_letter_queue: "yt_niche:queue:dlq"
```

---

## CATATAN PENTING

**Kebijakan YouTube & AdSense:**
- AdSense: 1 nama penerima pembayaran = 1 akun AdSense, boleh multi-channel.
- YouTube menilai setiap channel individual — multi-channel bukan celah re-upload.
- YouTube Data API v3: quota 10.000 units/hari. Upload = 1.600 units. Request quota increase untuk scale.
- Channel transfer ownership via YouTube Studio → manual, tidak bisa di-API-kan.

**Multi-Niche Strategy:**
- Channel per niche × negara = entity terpisah.
- Niche vertical menentukan production_format, yang menentukan pipeline mana yang dipakai.
- Cross-niche opportunity (contoh: "mythology ambient" = music + folklore) bisa dibuka sebagai niche vertical baru.
- Niche yang jenuh di-research oleh FASE 0B → deprioritize atau pivot.

**Music Channel Specifics:**
- Music channel = high volume upload (1/hari bahkan normal).
- Durasi video musik cenderung panjang (1-8 jam untuk radio/compilation).
- CPM musik bervariasi: lofi $3-8, classical $5-12, genre-specific $4-10.
- Copyright sangat kritis: pastikan AI-generated atau royalty-free.
- Thumbnail musik = minimalist, bukan clickbait.

**Quarantine Strategy (7-month rule):**
- Channel YouTube natural kehilangan rekomendasi setelah ~7 bulan.
- Quarantine BUKAN penalty — ini strategi jaga channel tetap aktif.
- Upload 1/hari = channel tetap fresh di mata algo.
- Focus proven content saat quarantine — jangan eksperimen.
- Recovery = traffic kembali ke 80% level pre-quarantine.
- Gagal recovery dalam 3 bulan → evaluasi: transfer / pivot / delete.
- Upload time TIDAK berubah saat quarantine — konsistensi kunci.

**1ai-content Module Dependencies:**
- `video_gen_module` — text-to-video (Wan, Kling, self-hosted). 60 detik/video.
- `voice_synthesis_module` — TTS dengan tone control. Multi-language support.
- `slideshow_assembler` — image gen + video compositor.
- `thumbnail_gen_module` — image gen dengan niche-adaptive style rules.
- `music_gen_module` — AI music generation (Suno/Udio/self-hosted).
- `video_assembler` — audio + visual merge, looping, crossfade.
- `visualizer_overlay_module` — waveform/visualizer overlay untuk static image.
"{"content