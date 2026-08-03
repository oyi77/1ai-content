---
scope: root
tech_stack: [Node.js, TypeScript, Python, Prisma]
last_reviewed_commit: bac10d88791d79fd8cadf2840fa2defc4343587a
status: complete
---
# AGENTS.md — 1ai-content

## MANDATORY PROCESS (8 Steps — No Skipping)

Every task follows this sequence. No exceptions.

1. **AUDIT** — Read existing code. Understand current state.
2. **THINK** — Understand WHY. Intent vs literal.
3. **BRAINSTORM** — ≥3 approaches. Score options.
4. **PLAN** — Decompose. Risks. Rollback plan.
5. **EXECUTE** — Build. TDD when possible.
6. **TEST** — Run all tests. Break it first.
7. **VERIFY** — Prove with literal output.
8. **REVIEW** — Read your own diff before committing.

Full details: `~/.1ai/core/PROCESS.md` (auto-injected by hooks)

## This repo
Automasi konten & faktory video berbasis Telegram bot (openclaw-bot v3.0.0): bot menerima perintah/unggahan dari pengguna lewat Telegram webhook, meng-generate konten (video 9-tier fallback, gambar, audio/TTS, ebook), lalu mendistribusikan ke platform sosial (PostBridge, CloakBrowser/CloakAdapter, publish TikTok/IG/FB). Frontend SaaS: SATU React SPA `admin-ui` — 3 namespace: Landing `/`, Admin `/admin/*`, Customer `/app/*` (customer-ui & landing-ui digabung, keduanya dihapus). Backend: SATU runtime Python media-api di port 8767 (`services/api.py`) — generator ebook sudah DI-ABSORB ke sini (`services/ebook/` tetap ada sebagai library internal, port 8765 mati). Dua runtime aktif: bot TS + media-api Python (lihat Arsitektur Singkat).
Stack: Node.js / TypeScript / Prisma (backend bot) + Python / FastAPI (media-api :8767 — termasuk ebook absorbed) + React / Vite (frontend: admin-ui)
Domain: pipeline konten AI end-to-end — ideation → generation → quality check → scheduling → distribution → analytics (alur lengkap di `WORKFLOW.md`)

## Rules — thin loader, no submodule
Rules are NOT vendored into this repo. This repo does NOT need a rules submodule.
`AGENTS.md` is only the repo-local loader: domain, commands, conventions, and pointers to `~/.1ai`.

Engineering rules are enforced by machine-level loaders when `setup-dev.sh` has been run:
- Claude Code: SessionStart hook injects `~/.1ai/core/RULES.md`
- OpenCode: plugin injects `~/.1ai/core/RULES.md`
- OMP: wrapper appends `~/.1ai/core/RULES.md` to launch sessions

Primary rules file:
```bash
cat ~/.1ai/core/RULES.md
```

Pre-ship gate:
```bash
cat ~/.1ai/core/GATE.md
```

If `~/.1ai` or auto-load is missing, run:
```bash
bash ~/.1ai/scripts/setup-dev.sh
```

Do NOT add the rules repo as a git submodule. Update rules centrally, then run/sync the thin `AGENTS.md` template.

## Hard rules
1. Read code before writing code.
2. No completion claim without literal receipt.
3. Compile/test/use like a real user before claiming work is ready.
4. Task must match this repo domain.
5. Run GATE.md before commit/PR.

- Konvensi repo: alias path `@/*` → `./src/*` (`tsconfig.json` paths; jest memetakan `@/` → `src`); unit test = jest `**/*.test.ts` (`package.json` testMatch), E2E bot = pytest di `tests/e2e/bot`; file Python di `services/` diuji via pytest (`services/pytest.ini`).
- Jangan baca/menulis secret: `.env`, `config/tiktok_cookies.txt`, `*.pem`, `*.key`.

## Commands
- Dev:   `npm run dev` (`tsx watch src/index.ts`)
- Test:  `npm run test` (jest, ts-jest)
- Test E2E: `npm run test:e2e` (jest `jest.e2e.config.js`) | `npm run test:e2e:playwright` | pytest di `tests/e2e/bot`
- Build: `npm run build` (`tsc -p tsconfig.build.json`) — memproduksi `dist/` (build pipeline sudah diperbaiki, lihat Prioritas Improvement)
- Lint:  `npm run lint` (eslint `src/ --ext .ts`)
- Render iklan Remotion: `npm run render:ad` (`cd services/remotion-ads && node --import tsx src/render.ts`)
- DB: `npx prisma migrate dev` / `npx prisma db seed` (lihat `prisma/AGENTS.md`)

## Tech Stack
- **Runtime**: Node 20 (target ES2022, `module: NodeNext` — `tsconfig.json`), Python (services/), Docker `node:20-alpine` (`Dockerfile`).
- **Framework**: Telegraf (Telegram bot), Fastify 5 (HTTP), BullMQ (antrian Redis), Prisma 5 + PostgreSQL, Winston (log), Zod (validasi env — `src/config/env.ts`), @sentry/node.
- **AI pipeline**: `@1ai/ai-pipeline` & `@1ai/platform-adapters` — dependensi `file:../1ai/packages/...` (di luar repo! pastikan path tersedia).
- **Provider video 9-tier fallback** (lihat `.env.example`): BytePlus, xAI, LaoZhang, Evolink, Hypereal, SiliconFlow, Fal.ai, Kling, Together, PiAPI, D-ID + Remotion; image: GeminiGen, NVIDIA, Replicate, Fal.ai, HuggingFace; prompt AI: OpenAI, Anthropic, Gemini.
- **Payment**: unified `1ai-payment` (localhost:3100) + legacy Midtrans / TriPay / Duitku / NOWPayments / Telegram Stars (`src/services/payment*.ts`).
- **Frontend**: SATU React SPA di `admin-ui/` — React ^19.2.7 + react-router-dom ^7.18.1 + Vite ^8.1.1 + TailwindCSS ^4.3.3, base `/` tanpa basename; route 3 namespace di `admin-ui/src/main.tsx` (`/`→Landing, `/admin/*`→AdminApp, `/app/*`→CustomerApp); di-serve backend :3002 (prod PM2; dev default PORT=3000) — static `/admin/` (index.ts:328-335), `/assets/` (index.ts:346-359), SPA fallback notFoundHandler (index.ts:373-393 — hanya /app/*; /admin/* ditangani catch-all src/routes/admin.ts:414-423); `customer-ui/` & `landing-ui/` dihapus (source di-git-mv ke `admin-ui/src/{app,landing}`).

## Arsitektur Singkat
Alur utama: Telegram webhook → `src/index.ts` → handlers/routes (`src/handlers/`, `src/routes/`) → services TS (`src/services/`) → antrian BullMQ/Redis → DB PostgreSQL (Prisma) → distribusi (PostBridge, CloakAdapter, publish TikTok/IG/FB) → analytics.

- **Bot TS (prod :3002, PM2 `1ai-content`)**: `src/index.ts` — runtime produksi SATU instance di :3002 via PM2 (`ecosystem.config.js`, fork ×1, NODE_ENV=production, log `logs/pm2/`); `npm run dev` (`tsx watch`) untuk lokal dev pakai PORT default 3000. Admin dashboard & API di `src/routes/admin.ts` + `src/routes/admin/` (auth: Basic/cookie/token vs `ADMIN_PASSWORD` — `src/routes/admin/auth.ts:37,48,54`).
- **Python media-api (port 8767)**: `services/api.py` + entry `services/run_api.py` — DI-MANAGE SYSTEMD `1ai-content.service` (`/etc/systemd/system/1ai-content.service`, `Type=simple`, `User=openclaw`, `WorkingDirectory=.../services`, `ExecStart=.../python3 run_api.py`, `Restart=always`, log `/var/log/1ai-content.log`, enabled). JANGAN tambah manajer duplikat (PM2/docker-compose) untuk port ini. Endpoint `/health`, `/audio/*`, `/text/*`, `/image/*`, `/video/*`, `/download/*`, `/research/*`, `/trending/*`, `/analyze/*`, `/cloak/*`, `/autopilot/*`, `/calendar/*`, `/ab-test/*`, `/text/ebook` (per `smoke_test.py`); sub-service Python di `services/{music,tts,looping,analysis,clipper,carousel,comic_gen,movie_gen,repurpose,remetadata,storyboard,download,pinterest,research,trends,engagement,autopilot,ab_testing,bookshelf,brand,content_calendar,faceless,projects,media,data,db,cloak_adapter,remotion,remotion-ads}/`.
- **Ebook**: DI-ABSORB ke media-api :8767 (endpoint `/text/ebook` via `EbookContentGenerator` di `api.py:104`); port 8765 mati, `services/ebook/` tetap ada sebagai library internal (pipeline, export, db, cover — lihat `services/ebook/AGENTS.md`).
- **Infra**: PostgreSQL 15 + Redis 7 + Bull dashboard + Prometheus/Grafana (profile `monitoring`) — `docker-compose.yml`; SATU bot TS :3002 di-manage PM2 `1ai-content` (`ecosystem.config.js`, fork ×1, log `logs/pm2/`), auto-restart saat reboot via systemd `pm2-openclaw.service` (enabled, ExecStart=`pm2 resurrect`). Unit systemd `1ai-content-bot.service` (port 3000 lama) SUDAH DINONAKTIFKAN 2026-08-02 (`systemctl disable --now`; status disabled/inactive) — jangan di-re-enable; port 3000 KOSONG. JANGAN menambah manajer ketiga untuk bot TS.

## Sub-Direktori
Direktori dengan `AGENTS.md` sendiri (link hanya untuk file yang terverifikasi ada):

- `src/` — `src/AGENTS.md`, `src/routes/`, `src/flows/`, `src/services/`, `src/workers/`, `src/handlers/` (+`messages/`, `callbacks/`), `src/menus/`, `src/middleware/`, `src/utils/`, `src/types/`, `src/views/` (+`web/`, `admin/`), `src/config/`, `src/commands/` (+`admin/`), `src/tools/vidbee/`
- `services/` — `services/AGENTS.md`; sub-layanan: `ab_testing/`, `analysis/`, `autopilot/`, `bookshelf/`, `brand/`, `carousel/`, `clipper/`, `cloak_adapter/`, `comic_gen/`, `content_calendar/`, `data/`, `db/`, `download/`, `ebook/` (+`pipeline/`, `export/`, `db/`, `cover/`), `engagement/`, `faceless/`, `looping/`, `media/`, `movie_gen/`, `music/`, `pinterest/`, `projects/`, `remetadata/`, `remotion/`, `remotion-ads/`, `repurpose/`, `research/`, `routers/`, `storyboard/`, `trends/`, `tts/` (catatan: `money-printer-turbo/` kosong — lihat `services/AGENTS.md`)
- `services/tests/` — `services/tests/AGENTS.md`, `services/tests/ebook/` (+`test_app/`, `test_cover/`, `test_db/`, `test_export/`, `test_i18n/`, `test_integrations/`, `test_mcp/`, `test_models/`, `test_pipeline/`+`comics/`, `test_research/`, `test_utils/`, `integration/`)
- `tests/` — `tests/AGENTS.md`, `tests/unit/` (+`services/`, `routes/`, `config/`, `commands/`, `commands/admin/`), `tests/e2e/` (+`playwright/`, `bot/`)
- `prisma/` — `prisma/AGENTS.md` (schema, migrations, seed)
- `config/` — `config/AGENTS.md`, `config/monitoring/` (+`grafana/`) — catatan: `llms.txt` sudah dikoreksi menyebut `config/monitoring/AGENTS.md` (bukan `monitoring/AGENTS.md`)
- `scripts/` — `scripts/AGENTS.md`
- `.github/` — `[SKIPPED — workflow CI singkat: .github/workflows/ci.yml]`
- `admin-ui/` (+`src/`, `src/pages/`, `src/pages/tools/`, `src/app/`, `src/landing/`) — satu-satunya frontend; `docs/`, `public/` — masing-masing punya `AGENTS.md` sendiri
- Sisa folder tanpa AGENTS.md (data/, tmp/, dst.) — lihat README.md & `docs/AGENTS.md`.

## Global Constraints
Variabel env wajib & opsional didefinisikan di `.env.example` (292 baris; jangan baca `.env` asli). Kategori:

- **Bot & web**: `BOT_TOKEN`, `BOT_USERNAME`, `WEBHOOK_URL`, `WEB_APP_URL`, `PORT` (default 3000).
- **DB/cache**: `DATABASE_URL` (PostgreSQL/Prisma), `REDIS_URL` (BullMQ).
- **AI providers**: key per-provider (9-tier video, image, prompt AI — daftar di `.env.example`), `REMOTION_ENABLED`, `FFMPEG_PATH`.
- **Circuit breaker & fallback**: `CIRCUIT_BREAKER_THRESHOLD=3`, `MAX_PROVIDER_RETRY=2`, `FALLBACK_CHAIN_MAX=8` (+ setting per-provider).
- **Queue**: `BULLMQ_CONCURRENCY=5`, `VIDEO_QUEUE_NAME`, `IMAGE_QUEUE_NAME`.
- **Payment**: `1AI_PAYMENT_URL/API_KEY/WEBHOOK_SECRET` (unified, localhost:3100) + legacy `MIDTRANS_*`, `TRIPAY_*`, `DUITKU_*`, `NOWPAYMENTS_API_KEY`, Telegram Stars.
- **Distribusi**: `POSTBRIDGE_*` (enable/key/webhook/baseURL/platforms), CloakAdapter, TikTok cookies (`config/tiktok_cookies.txt`).
- **Ebook**: `EBOOK_API_URL=http://localhost:8767` (alias DEPRECATED dari `CONTENT_FACTORY_URL` — sama-sama media-api :8767), `EBOOK_API_KEY`.
- **Ecosystem**: `ECOSYSTEM_API_KEY`, `SOCIAL_SERVICE_URL` (127.0.0.1:8200), `AFFILIATE_SERVICE_URL` (127.0.0.1:3001), `TRACKING_URL`.
- **Lainnya**: feature flags `ENABLE_*`, pixel tracking (Facebook/GA4/TikTok), `LOG_LEVEL`/`LOG_FILE`, provider 2026 (`VEO_*`, `KLING_*`), ElevenLabs.

## Prioritas Improvement (Top 5)
1. **HIGH — Build pipeline rusak, Docker prod dijamin gagal — SUDAH DIPERBAIKI.** `npm run build` (`package.json` script = `tsc -p tsconfig.build.json`) mewarisi `"noEmit": true` dari `tsconfig.json:18` lewat `extends`, jadi `dist/` tidak pernah diemisi; `Dockerfile:64` `COPY --from=builder /app/dist ./dist` + `Dockerfile:84` `CMD node dist/index.js` → image produksi mati. Fix yang diterapkan: `tsconfig.build.json:6` kini menambahkan `"noEmit": false` (base tetap `noEmit: true` untuk typecheck murni). Verifikasi: `npm run build` exit 0 dan `dist/index.js` teremisi.
2. **HIGH — docker-compose: mount & build context menunjuk path yang tidak ada — SUDAH DIPERBAIKI (sebagian).** `docker-compose.yml:115` build context dikoreksi `./services/ebook`, `:147` mount `./config/monitoring/prometheus.yml`, `:173-174` `./config/monitoring/grafana/...` (profile monitoring). Verifikasi: `docker compose config -q` valid. **Sisa blocker**: `services/ebook/` TIDAK punya Dockerfile (Glob `services/ebook/**/Dockerfile*` → no match) — service ebook tetap tidak buildable; `init.sql` (`:61` mount) sudah RESOLVED 2026-08-02 — lihat #7 (mount lama tidak ada di compose versi saat ini, hanya volume `postgres-data`).
3. **MEDIUM — Default admin password lemah (`admin123`) — RESOLVED / NON-ISSUE (2026-08-02).** Hipotesis "default matches .env: admin123" terbukti SALAH: `grep -c "^ADMIN_PASSWORD=admin123$" .env` = 0 — `.env` berisi password lain (nilai tidak didokumentasikan; secret). Implementasi kode memang tidak hardcode default: `ADMIN_PASSWORD` wajib via zod (`src/config/env.ts:19`) dan dibandingkan dengan `timingSafeCompare` (`src/routes/admin/auth.ts:37,48,54`). Literal `admin123` yang tersisa di repo adalah: (a) fallback mati di helper `resolveAdminPassword()` (`tests/e2e/playwright/rbac-security.spec.ts:33` — helper membaca `.env` dulu via baris 22-32; fallback hanya dipakai jika `.env` tak terbaca), dan (b) komentar doc usang `playwright.config.prod.ts:7` (sudah dinetralkan). Tidak ada rotasi yang perlu dilakukan; test/docs credential tidak diubah (test PASS dengan env asli).
4. **MEDIUM — ecosystem.config.js non-portable — SUDAH DIPERBAIKI.** Path absolut mesin-specific (`/home/linuxbrew/.linuxbrew/bin/tsx`, `/home/openclaw/.pm2/logs/`) diganti relatif: `script: "./node_modules/.bin/tsx"`, `cwd: __dirname`, log `path.join(__dirname, "logs", "pm2", ...)` (`ecosystem.config.js:6,8,19-20`). Verifikasi: `node --check` OK.
5. **MEDIUM — WORKFLOW.md merujuk file yang tidak ada — SUDAH DIPERBAIKI.** Referensi `services/suno/client.py` dan `services/cloakbrowser/__init__.py` dihapus; kini konsisten `services/cloak_adapter/__init__.py` (`WORKFLOW.md:396,659`). Referensi `/suno <prompt>` dipertahankan karena itu command Telegram (bukan path file).

6. **HIGH — Konsolidasi frontend 3 SPA → 1 bundle React admin-ui — KODE DONE, RUNTIME PROD BELUM TERVERIFIKASI.** customer-ui/ & landing-ui/ dihapus, source digabung ke admin-ui/src/{app,landing}; main.tsx lazy 3 app (`/`, `/admin/*`, `/app/*`); vite base "/"; backend serve admin-ui/dist + SPA fallback notFoundHandler (src/index.ts:373-393). **CATATAN VERIFIKASI 2026-08-02**: `cd admin-ui && npm run build` exit 0 (7 asset, dist/ teremisi) dan `/admin/` 200 via server jalan (static serve baca disk per-request). **TAPI** server :3000/:3002 di-start ~2026-07-31 16:46 WIB TANPA `--watch` → menjalankan snapshot PRA-konsolidasi (referensi `customer-ui/dist` & `landing-ui/dist` yang sudah dihapus); akibatnya `/app` → 302 → `/app/` → **404** `{"error":"Not Found"}`. `src/index.ts` modified (mtime 2026-08-02 09:00 WIB) dan SEMUA perubahan konsolidasi masih UNCOMMITTED (HEAD `bac10d8` masih pakai customer-ui). **Blocker**: restart server (PM2 :3002 + :3000) → re-smoke `/app/*` → e2e login browser → commit. Jangan verifikasi runtime prod sebelum restart. **PASCA-FIX 2026-08-02 (testing+review+fixing agent)**: regresi CSS landing ditutup — `import "./index.css"` di `admin-ui/src/landing/App.tsx:1` (grep `hero-gradient`: terdefinisi di `admin-ui/dist/assets/App-BLVI5avz.css` = 2 match (class + media query), dipakai `App-D4fBirZS.js:1`); fallback `/admin/` dihapus dari isSpaRoute (`src/index.ts:377-380` — dead code vs catch-all `admin.ts:414-423`); landing `/` dibaca per-request (`src/routes/web/pages.ts:25-31`); verifikasi: jest 1435 passed (84 suites), build root + admin-ui exit 0, smoke :3111 `/` `/app/` `/admin/` 200. **QA FINAL 2026-08-02 (testing+review+fixing agent)**: 3 LOW terakhir di-fix — `maxAge: 0` (`src/index.ts:334`), regex `SPA_STATIC_EXT` (`src/index.ts:377`), brand `admin-ui/index.html:7` → "1AI Content — AI Content Factory" + lang="id" + meta SEO lengkap (description, og:type/title/description/image `/public/hero-tiktok-showcase.png`, twitter:card, theme-color `#0a0a1a`, canonical `https://content.aitradepulse.com/` — meta diambil dari landing-ui lama yang dihapus); 2 flake e2e di-fix (count()→toBeVisible di web-landing.spec.ts, race waitForResponse → pola wait-sebelum-click di customer-spa.spec.ts). **PROD TERVERIFIKASI**: smoke :3002 (PM2 1ai-content) & :3000 lolos (`/` 200, `/app` 302→`/app/`, `/app/` max-age=0, `/app/foo.bar` 200 html, `/app/nope.js` 404, `/admin/` 200, `/health` 200), pm2 logs bersih; playwright **149/149 PASS**; jest 1435 PASS (84 suites); build root + admin-ui exit 0. **COMMITTED**: `f2c66e5` (154 file, konsolidasi + QA). Sisa manual user: push remote, verifikasi login browser dengan kredensial asli, ganti `ADMIN_PASSWORD` bila masih `admin123`.
7. **MEDIUM — Service ebook dihapus dari docker-compose (Fase 1 konsolidasi).** services/ebook/config.py:65-68 port dikomentari; services/api.py enforce_ebook_api_key opsional; `docker compose config -q` OK, pytest subset 510 passed. Sisa: mount `init.sql` (docker-compose.yml:61) sudah dicek dan RESOLVED 2026-08-02 — grep `init\.sql` di docker-compose.yml → **no match** (mount lama sudah dihapus; service postgres hanya mount volume `postgres-data`, docker-compose.yml:59-60), `docker compose config -q` valid.

8. **HIGH — Surface API Python konsolidasi rusak: 3 kontrak 404 + route admin 404 — SUDAH DIPERBAIKI.** Remediasi service layer (commit a2b6c6c) memindahkan handler ke router domain ber-prefix baru (`/audio/*`, dst), memutus kontrak yang masih dipanggil frontend/bot. Fix:
   (a) `services/routers/compat.py` (baru) — 10 endpoint legacy re-expose (`/tts/*`, `/music/*`, `/suno/*`, `/captions/*`), delegasi ke engine sama dengan `audio.py`; registrasi `services/api.py:85,107`. Verifikasi TestClient: voices 200, synthesize 422 (body kosong — validasi pydantic OK), suno/bgm 200, suno/lofi 200, captions/styles 200, captions/presets 200, captions/generate 422.
   (b) `services/routers/content.py` (baru) — 12 endpoint content-pipeline legacy (`/carousel/*`, `/loop/*`, `/repurpose`, `/regenerate`, `/remeta`, `/storyboard/*`, `/content/render-ad`); carousel pakai `CarouselAssembler()` langsung (JANGAN ganti ke `get_carousel()` — `CarouselGenerator` tidak punya `.create`); registrasi `services/api.py:86,108`. Verifikasi TestClient: styles 200, templates 200 (+?niche=beauty 200), template nonexistent 200 `{"error":"Template not found"}`, 422 body kosong (create/loop/storyboard/remeta/repurpose/regenerate/render-ad), 404 file loop & storyboard.
   (c) Route TS 404 `/api/admin/playground/models` — FIXED `src/routes/admin/playground.ts:30-38`; auth sudah ada via catch-all `admin.ts:113` (`url.startsWith("/api/admin/")`); runtime probe 200 + shape OK (models `[]` = omniroute `listModels()` timeout 10s → lingkungan, bukan bug route).
   (d) `admin-ui/src/app/pages/Referral.tsx` link referral → `https://t.me/vilona_content_bot?start=` (username bot baru).
   (e) 500 ab-test/calendar BUKAN bug prod — traceback `DATABASE_URL environment variable is required before using the database engine` hanya muncul di test env tanpa DB; router bersih.

9. **MEDIUM — Manajer ganda media-api :8767 (PM2 + systemd) — SUDAH DIPERBAIKI.** Sesi lalu sempat menambah app `media-api` di PM2/`ecosystem.config.js` karena mengira :8767 orphan; ternyata :8767 DI-MANAGE systemd `1ai-content.service` (env `/proc/<pid>/environ` berisi `INVOCATION_ID`/`SYSTEMD_EXEC_PID`, unit `Type=simple`+`Restart=always`+enabled). Akibatnya PM2 media-api crash-loop (28 restarts). Fix: `pm2 delete media-api` + `pm2 save`, blok media-api dihapus dari `ecosystem.config.js` (kini hanya app `1ai-content` :3002). **Pelajaran**: semua service Python 1ai di mesin ini systemd (`1ai-career`, `1ai-social`, `1ai-payment`, `1ai-content`; ada `1ai-ecosystem.target`) — jangan deploy manajer ketiga; verifikasi supervisor dengan `systemctl status`/`/proc/<pid>/environ` sebelum menambah PM2.

Tambahan (Low): doc drift — `llms.txt` sudah dikoreksi (catatan + link aktual, `llms.txt:42,50`); `README.md` sudah diberi catatan koreksi (`README.md:218` catatan `k8s/` belum ada, `:99` arahkan ke `services/ebook/AGENTS.md`) meski masih ada penyebutan "sibling `ebook/` directory" (`:83,92`) yang agak menyesatkan — bisa dirapikan lagi. **Brand drift — SUDAH DIKOREKSI (2026-08-02 Batch 7)**: `.env.example:2` header kini `# 1AI CONTENT FACTORY - PRODUCTION CONFIG` (dulu "BERKAHKARYA AI VIDEO STUDIO"); `src/config/bot_name.txt` → "1AI Content"; i18n `id/en/ru/zh.json:496` → "1AI Content"; `src/menus/unified-dashboard.ts:250` & `src/services/vilona-animation.service.ts` (replace_all `_Vilona`→`_1AI Content`, :17,:23,:28,:91:93) — brand frontend konsisten. Nama package `openclaw-bot` v3.0.0 DIBIARKAN (internal, bukan brand publik). coverageThreshold jest sangat rendah (branches 15 / lines 25) — sengaja dibiarkan; creds dev hardcoded di compose (`GF_SECURITY_ADMIN_PASSWORD=admin` `docker-compose.yml:171`, `POSTGRES_PASSWORD=postgres` `docker-compose.yml:57`) — sengaja dibiarkan (dev-only, bukan secret asli).

Catatan Batch 5-7 (frontend & tooling): `admin-ui` — ErrorBoundary di `main.tsx` (Sentry fallback), tombol logout admin (`src/components/Layout.tsx`, `src/components/Sidebar.tsx`, `src/app/layout/Layout.tsx`), meta og:image → `/public/hero-tiktok-showcase.png` (`admin-ui/index.html`), `admin-ui/public/robots.txt` baru. `public/manifest.json` DIHAPUS 2026-08-02 (orphan — route `src/routes/web/pages.ts:157-158` jadi sumber PWA manifest yang sekarang menunjuk `/public/icon-192.png` & `/public/icon-512.png`; sebelumnya `.manifest.json` icon path `/icon-192.png`/`/icon-512.png` menunjuk root yang tidak diserve → 404). `.dockerignore` baru ditambahkan. `services/routers/{audio,compat,content,image,upload,video}.py` — fix minor jenis (validasi/typo) selaras `services/run_api.py` (mis. flatten args) tanpa mengubah kontrak endpoint.

## Excluded Paths
Berikut TIDAK boleh di-scan/diindeks sebagai source (vendored / generated / sensitif):
- `node_modules/`, `vendor/`, `.venv/`, `.venv-tiktok/`, `__pycache__/`
- `dist/`, `build/`, `coverage/`, `test-results/`
- `logs/`, `tmp/`, `data/` (aset statis: ebook, remotion, videos)
- `.git/`, `.github/` (sudah diringkas di atas)
- `.env`, `.env.local`, `config/tiktok_cookies.txt`, `*.pem`, `*.key` (secret — jangan dibaca/ditulis)

## Dependency Map
```mermaid
flowchart LR
  TG[Telegram] -->|webhook| BOT[src/index.ts — Telegraf/Fastify :3002 (PM2 1ai-content)]
  BOT --> SVC[src/services/*.ts]
  SVC --> P[(PostgreSQL — Prisma)]
  SVC --> R[(Redis — BullMQ)]
  SVC --> PY[services/api.py — media-api Python :8767 (systemd 1ai-content.service)]
  PY --> MEDIA[music/ tts/ looping/ analysis/ clipper/ ebook ...]
  SVC --> PB[PostBridge / CloakAdapter]
  PB --> SOC[TikTok/IG/FB/YT]
  UI[admin-ui — React SPA 3-in-1: Landing + Admin + Customer] --> BOT
```

## Dokumentasi File Root
- `README.md` — pengantar repo; banyak referensi doc yang tidak ada (lihat Prioritas Improvement — tambahan Low).
- `package.json` — manifest bot `openclaw-bot` v3.0.0; scripts dev/test/build/lint/test:e2e/render:ad (lihat Commands).
- `tsconfig.json` — target ES2022, `module/moduleResolution: NodeNext`, `noEmit: true` (baris 18), paths `@/*`→`src/*`.
- `tsconfig.build.json` — extends base, `rootDir: src`, `outDir: ./dist`; kini menambahkan `"noEmit": false` (sudah diperbaiki — lihat Prioritas #1).
- `Dockerfile` — multi-stage node:20-alpine, user non-root, HEALTHCHECK `/health`; CMD `node dist/index.js` bergantung dist (temuan #1).
- `docker-compose.yml` — bot/postgres/redis/bull-dashboard + prometheus/grafana (service ebook DIHAPUS — konsolidasi) (profile monitoring); build context & mount path sudah dikoreksi (sudah diperbaiki sebagian — lihat Prioritas #2).
- `ecosystem.config.js` — PM2, `tsx src/index.ts` (via `./node_modules/.bin/tsx`), port 3002 host; path absolut diganti relatif ke `__dirname` (sudah diperbaiki — lihat Prioritas #4).
- `jest.e2e.config.js` — E2E jest: roots `tests/e2e`, timeout 60s, coverage `coverage/e2e`, threshold 50%.
- `playwright.config.ts` — baseURL localhost:3002, webServer `tsx src/index.ts`, port 3002.
- `playwright.config.prod.ts` — baseURL `https://content.aitradepulse.com`, tanpa webServer; komentar default `admin123` sudah dinetralkan (temuan Medium #3 — resolved, lihat Prioritas #3).
- `.eslintrc.js` — eslint untuk `src/ --ext .ts`.
- `WORKFLOW.md` (mode 600) — manual operasional "1AI-CONTENT FACTORY": workflow create/edit/distribute/analyze, 25+ Telegram commands, 43+ CloakBrowser profiles, 9-tier video fallback; referensi stale `services/suno/` & `services/cloakbrowser/` sudah dikoreksi (sudah diperbaiki — lihat Prioritas #5).
- `llms.txt` — daftar doc untuk LLM; link stale sudah diberi catatan koreksi (lihat Prioritas tambahan — Low).
- `smoke_test.py` — smoke test API Python port 8767: endpoint `/health`, `/audio/*`, `/text/*`, `/image/*`, `/video/*`, `/download/*`, `/research/*`, `/trending/*`, `/analyze/*`, `/cloak/*`, `/autopilot/*`, `/calendar/*`, `/ab-test/*` + 13 negative test endpoint legacy (harus 404).
- `verify_curl.sh` & `verify_findings.py` — verifikasi ad hoc kontrak field API 8767 (caption, video/ad, autopilot/create, cloak/batch-post, autopilot/run).
- `CLAUDE.md` — pointer: "You MUST read AGENTS.md root".
- Lainnya: `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `.env.example`, `.gitignore`, `.cursorrules`, `jest.e2e.config.js`, `tsconfig.*`.

> Last updated: 2026-08-02 (Batch 7) — KOREKSI ikon manifest: `src/routes/web/pages.ts:157-158` icon path `/icon-192.png`/`/icon-512.png` → `/public/icon-192.png`/`/public/icon-512.png` (fix 404 root; typecheck PASS); `.env.example:2` header → `# 1AI CONTENT FACTORY - PRODUCTION CONFIG`; `public/manifest.json` DIHAPUS (orphan — route pages.ts jadi satu-satunya sumber PWA manifest); `src/public/hero-tiktok-showcase.png` DIHAPUS (duplikat byte-identik `public/hero-tiktok-showcase.png`); `public/AGENTS.md` ditulis ulang penuh + `src/public/AGENTS.md` disinkron (hero dihapus dari tabel, favicon → pages.ts:101-107, hero-comparison ditandai orphan [INFERENSI]).
> Last updated: 2026-08-02 — DAILY REPORT DIHAPUS: worker `src/workers/daily-report.worker.ts` + script `scripts/daily-report.ts` (chat 6077091585 tak reachable → 400 `chat not found`; registrasi dibersihkan dari `src/index.ts` & `src/workers/index.ts`; docs disinkronkan); E2E ISOLASI: playwright pindah :3002 → :3111 + DB test `1ai_content_test` (`playwright.config.ts` webServer.env `prisma db push` + `NODE_ENV=test`; `admin-crud.spec.ts` BASE jadi relatif) — e2e TIDAK lagi menembak PM2 prod :3002. Sebelumnya: DUPLIKASI BOT TS RESOLVED: produksi = :3002 (PM2 1ai-content, NODE_ENV=production, webhook content.aitradepulse.com, nginx app_content.conf → :3002); :3000 KOSONG — systemd 1ai-content-bot.service di-disable + orphan paseo/tsx :3000 di-kill; auto-restart via pm2-openclaw.service (enabled); 1ai-hub disinkronkan (distribution.py:216 health 3000→3002, org.py:142 & _config.py:37 rename 1ai-saas-bot→1ai-content bot); temuan non-port lama: daily-report chat not found (6077091585) + e2e playwright mencemari DB prod via :3002 — keduanya RESOLVED di update ini. Backend = :3002 + :8767 (systemd, untouchable).
> Sebelumnya: 2026-08-02 — PROD BROWSER LOGIN VERIFIED: `tmp/prod-login-verify.ts` 9/9 PASS — landing `/` 200, `/admin/login` 200 + form, POST login password asli → `{"success":true}`, redirect `/admin/dashboard`, cookie `admin_token` httpOnly+secure, dashboard 200 (bodyLen 1670), `/admin/` 200, `/app/` 200, `/app/login` email field visible; password tidak pernah dicetak (dibaca programatik dari `.env`, 1x login sukses, 0 percobaan salah). #3 RESOLVED (non-issue): `.env` TIDAK berisi `admin123` (grep count 0) — hipotesis default password lemah terbukti salah; literal `admin123` di repo = fallback mati di test helper (`rbac-security.spec.ts:33`) + komentar doc usang yang sudah dinetralkan (`playwright.config.prod.ts:7`); tidak ada rotasi password yang perlu dilakukan. QA final sesi (RUNTIME TERVERIFIKASI — resolve all): restart PM2 :3002 + :3000 dengan source terkini; smoke `/health` `/` `/app/` `/app/foo.bar` `/admin/` 200 + `/app/nope.js` 404 (SPA static OK); playwright re-run **149/149 PASS (12.6s)** di :3002 dengan source terkini; init.sql RESOLVED (#7) — grep no-match di compose, postgres hanya mount `postgres-data` (:59-60), `docker compose config -q` valid; log startup bersih (webhook `https://content.aitradepulse.com/webhook/telegram` ter-set, seeder OK, SPA assets registered). QA final sesi: +content.py/+compat.py (12+10 endpoint py legacy, lihat #8a-8b), playground/models & Referral.tsx fixed (lihat #8c-8d), brand drift `berkahkarya_saas_bot`→`vilona_content_bot` 22 occurrence/14 file src/ 0 tersisa; verifikasi: jest 1435/1435, typecheck PASS, admin-ui build exit 0, pytest 26 passed, TestClient content/compat pass, probe playground 200, telethon QA done; playwright 149/149 dijalankan SEBELUM perubahan terakhir (validitas source terkini menunggu restart PM2 oleh user). Rekap sebelumnya — konsolidasi 1 backend + 1 frontend: customer-ui/ & landing-ui/ dihapus (source digabung ke admin-ui/src/{app,landing}), vite base "/", 3 namespace di main.tsx, static serve + SPA fallback src/index.ts (328-383), ebook dihapus dari docker-compose; docs (01/02/04/06), src/AGENTS.md, tests comment disinkronkan. Rekap sebelumnya — codebase onboarding swarm, fase verifikasi: Sub-Direktori dikoreksi — `services/` kini menunjuk `services/AGENTS.md` + 31 sub-layanan, ditambah baris `services/tests/` (`services/tests/AGENTS.md` baru), baris "tanpa AGENTS.md" diperbarui (admin-ui/customer-ui/landing-ui/docs/public sudah punya AGENTS.md masing-masing), dan lokasi messages/callbacks dikoreksi ke `src/handlers/` (bukan `src/routes/` — folder `src/routes/messages` tidak ada). Catatan sesi pertama: template root (frontmatter, Tech Stack, Arsitektur, Sub-Direktori, Global Constraints, Prioritas Improvement, Excluded Paths, Dependency Map, Dokumentasi File Root) + isi placeholder This repo/Hard rules; section MANDATORY PROCESS & Rules dipertahankan verbatim. Update terakhir — fase eksekusi: semua fix kode diterapkan (tsconfig.build.json `noEmit: false`, docker-compose path, ecosystem.config.js relatif, WORKFLOW.md referensi, `services/db/models.py` DATABASE_URL, `services/autopilot/tiktok_publisher.py`, mock fs jest web.test.ts, redaksi secret test → env var) dan didokumentasikan di Prioritas Improvement (#1-#5) + Dokumen File Root; verifikasi literal: jest 1435 passed (84 suites), pytest 526 passed, `npm run build` exit 0 dengan `dist/` teremisi, `docker compose config -q` valid. Update terakhir sesi ini — fase QA multi-agent: testing (jest 1435 PASS, build x2 PASS, smoke :3111) + review (HIGH regresi CSS landing ditemukan) + fixing (5 fix diterapkan: import CSS landing, isSpaRoute /app-only, landing read per-request, komentar admin.ts, warning index.ts — lihat Prioritas #6); AGENTS.md (root, src, admin-ui, admin-ui/src/landing) disinkronkan. Update penutup — fase QA final: 3 LOW + regresi SEO meta landing + 2 flake e2e di-fix (lihat Prioritas #6), PROD :3000/:3002 terverifikasi (smoke curl + pm2 logs bersih), playwright 149/149 PASS, commit `f2c66e5` (154 file). Update — arsitektur runtime final (1 backend TS + 1 backend Python): penemuan bahwa :8767 DI-MANAGE systemd `1ai-content.service` (bukan orphan); PM2 media-api duplikat dihapus (`pm2 delete media-api` + `pm2 save`, blok dihapus dari ecosystem.config.js — hanya app 1ai-content :3002 tersisa, lihat Prioritas #9); ebook DI-ABSORB ke media-api :8767 (port 8765 mati, `services/ebook/` library internal); `.env.example` + `src/config/env.ts` dikonsolidasi `EBOOK_API_URL=8767` (alias DEPRECATED dari `CONTENT_FACTORY_URL`); CI trigger + `master`; verifikasi: health :8767 OK, systemd active, ecosystem syntax OK, ci.yml YAML OK.

> Last updated: 2026-08-03 — AUDIT SWEEP (fix phase): url-validator SSRF diperbaiki (`src/utils/url-validator.ts` — normalizeHostname strip []/decode ::ffff:, BLOCKED vs IP patterns pakai rawHostname; `src/routes/web/content.ts:22,85,150,181,219` `validateUrlWithDns`); pricing fall-through `src/config/pricing.ts` (>120s → `getCustomDurationCreditCost`); command injection diperbaiki (content-pipeline, audio-vo); ebook key leak + IDOR ownership check; subscription expiry select; prisma migration ordering; `.gitmodules` kini 3 submodule (money-printer-turbo DROP, content-bot DIHAPUS — `src/AGENTS.md` disinkron); Dockerfile `prisma generate`; ci.yml Trivy `exit-code: "1"`; `config/payment.yml` webhook path `/webhook/{midtrans,tripay}`; `services/trends/scanner.py` `scan_all` alias; remetadata `normalize_color_shift`; faceless audio-existence guards; movie_gen double-narration FIXED; comic_gen `panel_gen.py` OMNIROUTE_URL; `scripts/prisma-reconcile.sh` DOC-ONLY (belum dijalankan, butuh review manusia sebelum run); tiktok_cookies scrub = MANUAL user step (filter-branch, belum dijalankan).
