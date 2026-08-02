---
scope: scripts
depends_on: [../prisma, ../config]
status: complete
---

> Last updated: 2026-08-02 — onboarding: template baru + cakupan file lengkap + temuan secret

# AGENTS.md — scripts

## Tujuan Folder Ini

Script DevOps & operasional: setup lingkungan, deploy, backup, health-check, laporan harian, dan pipeline konten TikTok/IG. `daily-report.ts` dijalankan via `tsx`; script bash/Node/Python berdiri sendiri — pastikan executable (`chmod +x`).

## Ekspor / Interface Utama

| File | Fungsi / Interface |
|---|---|
| `setup.sh` | Setup env: `.env` dari `.env.example` (baris 119-129), pre-commit hook lint+typecheck (baris 176-195), butuh Node 20+ |
| `deploy.sh` | Deploy: wajib branch `main` + working dir clean (baris 233-243), docker build/tag/push ke `DOCKER_REGISTRY`, `kubectl set image`, `git tag -a v$VERSION` + push (baris 249-251) |
| `backup.sh` | `pg_dump` (PGPASSWORD, DB_NAME=openclaw, DB_USER=postgres), redis BGSAVE, upload S3 bucket `openclaw-backups` (ap-southeast-1, retensi 30 hari); args `postgres\|redis\|all\|cleanup`; verifikasi `gunzip -t` |
| `health-check.sh` | Disk/mem threshold 80%, cek proses node/postgres/redis-server, port **3000**/5432/6379, HTTP `/health /health/db /health/queue`; eksternal hanya jika `CHECK_EXTERNAL` (GEMINIGEN_API_URL, ping Midtrans). **[KETINGGALAN]** `health-check.sh:21` default `API_URL=http://localhost:3000` + `:220` `check_port "localhost" "3000" "Bot API"` → bot produksi sekarang :3002 (PM2) — script belum diedit (bukan jalur produksi; lihat Issue Spesifik) |
| `restart-all.sh` | `pm2 restart content-factory-api` lalu `vilonacontentbot`, fallback `ecosystem.config.js --only`, verifikasi `pm2 jlist`, `pm2 save` |
| `check-deps.sh` | Cek venv (`uv python find`/python3), modul httpx/fastapi/uvicorn, yt-dlp; chromadb/feedparser/playwright hanya jika `../1ai-hub` ada |
| `daily-report.ts` | Laporan harian; jalankan via `tsx` |
| `content_pipeline.py` | Pipeline konten: download via yt-dlp (cookies vivaldi/chrome/chromium); `--watch --batch --profile`; batch sleep 10-30s |
| `video_processor.py` | ffmpeg drawtext: hook top, product+price bottom-left, CTA pulsing bottom-center, hashtags bottom-right; PLATFORM_CONFIGS tiktok 9:16 1080x1920 max180s, instagram_reel 9:16 90s, instagram_feed 4:5 1080x1350 60s, x_twitter 16:9 1280x720 140s, facebook_reel 9:16 90s, youtube_shorts 9:16 60s; output `data/videos`, temp `data/temp` |
| `publish_orchestrator.py` | Publikasi antrian: menyiapkan publish queue JSON; IG/TT **mati** (lihat Issue) |
| `ig_fb_poster.py` | Poster IG/FB; pool link afiliasi (baris 30-46) |
| `price_utils.py` | `parse_price` ('42,0RB'→42000), `match_product` keyword ID, bonus gajah +3 / kids +2 |
| `tiktok_downloader.py` | `get_video_ids_fast` regex `/video/(\d+)`, fallback yt-dlp, download via `api.tikwm.com` (hdplay→play), output `data/downloads/tiktok_{profile}` |
| `verify_mlm_pricing.py` | Verifikasi harga paket & komisi; butuh akses DB (lihat Issue) |
| `migrate-ebook-sqlite-to-pg.py` | Migrasi `data/ebook/projects.db` + `data/ebook_generator.db` via psycopg2; safety gate env `USE_EBOOK_SQLITE=true`; PK `project_id` (project_metadata/integration_logs) else `id`; `ON CONFLICT DO NOTHING` |
| `systemd/1ai-content-bot.service` | **[DISABLED 2026-08-02]** unit lama bot TS :3000 (`npx tsx src/index.ts`, User=openclaw, EnvironmentFile=.env, MemoryMax=1G, CPUQuota=80%, Restart=always, After=redis+postgresql) — bot produksi pindah ke PM2 `1ai-content` :3002; file unit masih ada di /etc/systemd/system tapi tidak aktif, JANGAN di-re-enable |
| `systemd/openclaw-saas-bot.service` | Project lain: `/home/openclaw/projects/berkahkarya-saas-bot` [FILE TIDAK TERLAMPIR — inferensi] |

## Dependensi Internal

- `content_pipeline.py` → `video_processor.py --batch` → `publish_orchestrator.py` (proses berantai).
- `daily-report.ts` memakai PrismaClient (sumber data `../prisma/schema.prisma`).
- Script memakai env dari `../config/` (ai.yml, payment.yml, database.yml) — referensi YAML, bukan runtime.
- Secret di luar repo (jangan dibaca): `ig_fb_poster.py:17` → `~/.openclaw/workspace/data/ig_fb_linked.json` (token FB); `publish_orchestrator.py:126` → `~/.openclaw/workspace/data/fb_page_tokens.json`; `publish_orchestrator.py:86` → `~/.openclaw/workspace/scripts/x_poster.py` [FILE TIDAK TERLAMPIR — inferensi].

## Issue Spesifik

- **[High] Secret hardcoded — `test-ecosystem-integration.sh:21`**: `API_KEY="berkahkarya-ecosystem-2026-secure-key"` → redacted `berk***REDACTED***ure-key`. Dipakai HMAC SHA256 `X-Signature` (baris 51, format `1ai-content:${timestamp}:${data}`); komentar baris 20: "should match ECOSYSTEM_API_KEY in .env". Trace lintas service: `/api/ecosystem/status` (1ai-content :3000), `/api/content/publish` (1ai-social :8200), `/api/affiliate/generate-link` + `/api/affiliate/conversion` (1ai-affiliate :3001), `/webhook/conversion-update` (1ai-content). Label: **hipotesis, perlu verifikasi manual** — script test, bukan jalur produksi.
- **[Medium] Stub mati — `publish_orchestrator.py:175-190`**: `publish_to_instagram` & `publish_to_tiktok` selalu `return False`, TODO "PostBridge token expired" → publish IG/TT nonaktif di jalur umum.
- **[Medium] Konfigurasi keras — `daily-report.ts:13`**: `ADMIN_CHAT_ID = "6077091585"`.
- **[Medium] `verify_mlm_pricing.py:30`**: `run_sql` pakai `sudo -u postgres psql -d berkahkarya` (butuh sudo), `DB="berkahkarya"` (baris 41); komisi 15%/5%/2% hardcode (baris 67-69) diklaim "from packages.ts" [FILE TIDAK TERLAMPIR — inferensi]; baris 276 "Payment gateways: Duitku enabled". **[INFERENSI]** komisi ini tidak cocok dengan `config/payment.yml` (tier1=10%/tier2=5%) → kemungkinan inkonsistensi.
- **[Low] Placeholder — `ig_fb_poster.py:41-45`**: `tokopedia.link/abc1/abc2/abc3` di AFFILIATE_POOLS (baris 30-46; 8 link Shopee asli `s.shopee.co.id/...` ikut di pool).
- **[Low] `video_processor.py:71`**: `os.system("sudo apt-get install -y fonts-dejavu-core")` — sudo saat runtime.
- **[Low] Port ketinggalan — `health-check.sh:21,220`**: default `API_URL=http://localhost:3000` & `check_port "localhost" "3000" "Bot API"` merujuk port 3000; bot produksi kini :3002 (PM2 `1ai-content`). Script tidak dipakai di jalur produksi (PM2/systemd yang handle restart) — usulan perbaikan di bawah.

## Rekomendasi Perbaikan Scoped

- **API key test-ecosystem-integration.sh** (TIDAK diterapkan — hanya usulan):
  ```bash
  # Before (baris 21)
  API_KEY="berkahkarya-ecosystem-2026-secure-key"
  # After
  : "${ECOSYSTEM_API_KEY:?set ECOSYSTEM_API_KEY di .env}"
  API_KEY="$ECOSYSTEM_API_KEY"
  ```
- `ADMIN_CHAT_ID` → baca dari env (mis. `process.env.ADMIN_CHAT_ID ?? fallback`).
- Hapus link placeholder `tokopedia.link/abcX` dari AFFILIATE_POOLS.
- Isi stub publish atau tandai eksplisit disabled di dokumentasi/exit code.
- Komisi hardcode di `verify_mlm_pricing.py` → baca dari PricingConfig (Prisma) atau `config/payment.yml`; konfirmasi nilai mana yang benar.
- Port `health-check.sh` → :3002 (TIDAK diterapkan — hanya usulan):
  ```bash
  # Before (baris 21)
  API_URL="${API_URL:-http://localhost:3000}"
  # After
  API_URL="${API_URL:-http://localhost:3002}"
  # dan baris 220: check_port "localhost" "3002" "Bot API"
  ```
