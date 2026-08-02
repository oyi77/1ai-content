---
scope: config
depends_on: []
status: complete
---

> Last updated: 2026-08-02 — onboarding: template baru + cakupan file lengkap + temuan secret

# AGENTS.md — config

## Tujuan Folder Ini

Konfigurasi referensi (YAML) untuk fitur, AI provider, database, dan pembayaran. File ini **tidak dimuat langsung saat runtime** — runtime memakai modul TypeScript di `src/config/` [FILE TIDAK TERLAMPIR — inferensi]; `config/` adalah sumber dokumentasi/default. `monitoring/` punya `AGENTS.md` sendiri — baca di sana untuk scope monitoring.

## Ekspor / Interface Utama

| File | Isi |
|---|---|
| `ai.yml` | Providers: geminigen (priority 1, `https://api.geminigen.ai/v1`, `api_key: "${GEMINIGEN_API_KEY}"`, model veo-3/imagen-4/gemini-tts-v2/gemini-pro-vision, rate 60rpm/1000rph, cost tracking), kling (p2), runway (p3) — semua API key env placeholder; circuit_breaker; tier limits video (free 15s/3 scenes/1 job → agency 120s/12 scenes/20 jobs); script template hook→problem→solution→CTA; voice_cloning 0.5 credits; multi_angle 13 varian |
| `database.yml` | Dev: postgres localhost:5432 `openclaw_dev`, redis localhost:6379 keyPrefix `openclaw:dev:`; staging/prod pakai `${STAGING_*}`/`${PROD_*}`; prod redis cluster 3 node; backup `0 2 * * *` retensi 30 hari S3 `openclaw-backups` ap-southeast-1 AES-256 |
| `features.yml` | Flag global/per-tier/per-region. Aktif: core_video_generation, core_image_upload (free 3 file 5MB → agency 20/50MB), topup, subscription, multi_gateway (midtrans+tripay), referral, affiliate_tier2, affiliate_dashboard, affiliate_withdrawal (min 50000), multi_platform, multi_angle, voice_cloning, no_watermark, priority_queue, free_revision, auto_detect_niche, brand_kit, white_label. Nonaktif/rollout 0%: competitor_analysis, trending_audio, best_time_posting, team_workspace, client_review, direct_publish, analytics_sync, ecommerce_connect, ab_testing, template_marketplace, api_access, experimental |
| `payment.yml` | Midtrans (`${MIDTRANS_*}` env, snap_mode, channel qris/bank_transfer/echannel/gopay/shopeepay/credit_card, webhook `/webhooks/midtrans`); Tripay (`${TRIPAY_*}`); settings (timeout 30m, fraud max 5 tx/jam & 5jt/hari, manual review 1jt); packages starter 50rb/5+1 kredit, growth 150rb/15+3, scale 500rb/60+15, enterprise 1.5jt/200+60; subscriptions lite 99rb/20, pro 199rb/50, agency 499rb/150; referral tier1 10% tier2 5%, min withdrawal 50k/100k; gamification |
| `monitoring/prometheus.yml` | Scrape 15s; job `openclaw-bot` di `bot:3000` `/metrics` 10s, node-exporter:9100, postgres-exporter:9187, redis-exporter:9121 |
| `monitoring/README.md` | Panduan Grafana: port 3002 |
| `monitoring/grafana/` | Subfolder dgn `AGENTS.md` sendiri (dashboards/, datasources/) — lihat `config/monitoring/AGENTS.md` |
| `tiktok_cookies.txt` | **Sensitif** — session cookie TikTok; JANGAN dibaca/di-commit. |

## Dependensi Internal

- File YAML saling rujuk untuk kebutuhan (features ↔ payment ↔ ai), tapi tidak ada load order — semua referensi pasif.
- Konsumen: `src/config/` (runtime) [FILE TIDAK TERLAMPIR — inferensi], `scripts/` (verify_mlm_pricing.py baca nilai komisi/harga), `prisma/` (seed/`../config/database.yml` arah deploy).

## Issue Spesifik

- **[Low] `monitoring/README.md:28`**: default login Grafana `admin/admin` terdokumentasi. Ini dokumentasi default, bukan config hidup — tetap perlu rotasi/review sebelum dipakai produksi.
- **[Medium] [INFERENSI] Inkonsistensi komisi referral**: `payment.yml` tier1=10%/tier2=5% vs `scripts/verify_mlm_pricing.py` 15%/5%/2% (baris 67-69). Perlu verifikasi manual mana yang benar (lihat juga `verify_mlm_pricing.py` yang menyebut Duitku aktif padahal payment.yml memakai midtrans+tripay).
- Semua kredensial di file ini berupa placeholder env (`${...}`) — aman ✓. Satu-satunya file berisi material sensitif adalah `tiktok_cookies.txt` (jangan dibaca; pastikan masuk `.gitignore`).

## Rekomendasi Perbaikan Scoped

- Sinkronkan nilai komisi antara `payment.yml` dan `verify_mlm_pricing.py` (tentukan satu sumber kebenaran).
- `tiktok_cookies.txt`: pertahankan di `.gitignore`, batasi akses file, pertimbangkan rotasi cookie periodik.
- Konfirmasi runtime benar-benar memakai `src/config/` dan bukan file YAML ini (trace import di `src/config/` saat onboarding berikutnya).
