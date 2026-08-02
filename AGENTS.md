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
Automasi konten & faktory video berbasis Telegram bot (openclaw-bot v3.0.0): bot menerima perintah/unggahan dari pengguna lewat Telegram webhook, meng-generate konten (video 9-tier fallback, gambar, audio/TTS, ebook), lalu mendistribusikan ke platform sosial (PostBridge, CloakBrowser/CloakAdapter, publish TikTok/IG/FB). Frontend SaaS: SATU React SPA `admin-ui` — 3 namespace: Landing `/`, Admin `/admin/*`, Customer `/app/*` (customer-ui & landing-ui digabung, keduanya dihapus). Python services terpisah melayani API media di port 8767 (`services/api.py`) dan layanan ebook di port 8765 (`services/ebook`).
Stack: Node.js / TypeScript / Prisma (backend bot) + Python / FastAPI (services media & ebook) + React / Vite (frontend: admin-ui)
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
- **Frontend**: SATU React SPA di `admin-ui/` — React ^19.2.7 + react-router-dom ^7.18.1 + Vite ^8.1.1 + TailwindCSS ^4.3.3, base `/` tanpa basename; route 3 namespace di `admin-ui/src/main.tsx` (`/`→Landing, `/admin/*`→AdminApp, `/app/*`→CustomerApp); di-serve backend :3000 — static `/admin/` (index.ts:328-335), `/assets/` (index.ts:346-359), SPA fallback notFoundHandler (index.ts:373-393 — hanya /app/*; /admin/* ditangani catch-all src/routes/admin.ts:414-423); `customer-ui/` & `landing-ui/` dihapus (source di-git-mv ke `admin-ui/src/{app,landing}`).

## Arsitektur Singkat
Alur utama: Telegram webhook → `src/index.ts` → handlers/routes (`src/handlers/`, `src/routes/`) → services TS (`src/services/`) → antrian BullMQ/Redis → DB PostgreSQL (Prisma) → distribusi (PostBridge, CloakAdapter, publish TikTok/IG/FB) → analytics.

- **Bot TS (port 3000)**: `src/index.ts` (dev via `tsx watch`), admin dashboard & API di `src/routes/admin.ts` + `src/routes/admin/` (auth: Basic/cookie/token vs `ADMIN_PASSWORD` — `src/routes/admin/auth.ts:37,48,54`).
- **Python API (port 8767)**: `services/api.py` + entry `services/run_api.py` — endpoint `/health`, `/audio/*`, `/text/*`, `/image/*`, `/video/*`, `/download/*`, `/research/*`, `/trending/*`, `/analyze/*`, `/cloak/*`, `/autopilot/*`, `/calendar/*`, `/ab-test/*` (per `smoke_test.py`); sub-service Python di `services/{music,tts,looping,analysis,clipper,carousel,comic_gen,movie_gen,repurpose,remetadata,storyboard,download,pinterest,research,trends,engagement,autopilot,ab_testing,bookshelf,brand,content_calendar,faceless,projects,media,data,db,cloak_adapter,remotion,remotion-ads}/`.
- **Ebook service (port 8765)**: `services/ebook/` (pipeline, export, db, cover — lihat `services/ebook/AGENTS.md`).
- **Infra**: PostgreSQL 15 + Redis 7 + Bull dashboard + Prometheus/Grafana (profile `monitoring`) — `docker-compose.yml`; PM2 `ecosystem.config.js` (fork ×1, log `/home/openclaw/.pm2/logs/`, port 3002 di host).

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
- **Ebook**: `EBOOK_API_URL=http://localhost:8765`, `EBOOK_API_KEY`.
- **Ecosystem**: `ECOSYSTEM_API_KEY`, `SOCIAL_SERVICE_URL` (127.0.0.1:8200), `AFFILIATE_SERVICE_URL` (127.0.0.1:3001), `TRACKING_URL`.
- **Lainnya**: feature flags `ENABLE_*`, pixel tracking (Facebook/GA4/TikTok), `LOG_LEVEL`/`LOG_FILE`, provider 2026 (`VEO_*`, `KLING_*`), ElevenLabs.

## Prioritas Improvement (Top 5)
1. **HIGH — Build pipeline rusak, Docker prod dijamin gagal — SUDAH DIPERBAIKI.** `npm run build` (`package.json` script = `tsc -p tsconfig.build.json`) mewarisi `"noEmit": true` dari `tsconfig.json:18` lewat `extends`, jadi `dist/` tidak pernah diemisi; `Dockerfile:64` `COPY --from=builder /app/dist ./dist` + `Dockerfile:84` `CMD node dist/index.js` → image produksi mati. Fix yang diterapkan: `tsconfig.build.json:6` kini menambahkan `"noEmit": false` (base tetap `noEmit: true` untuk typecheck murni). Verifikasi: `npm run build` exit 0 dan `dist/index.js` teremisi.
2. **HIGH — docker-compose: mount & build context menunjuk path yang tidak ada — SUDAH DIPERBAIKI (sebagian).** `docker-compose.yml:115` build context dikoreksi `./services/ebook`, `:147` mount `./config/monitoring/prometheus.yml`, `:173-174` `./config/monitoring/grafana/...` (profile monitoring). Verifikasi: `docker compose config -q` valid. **Sisa blocker**: `services/ebook/` TIDAK punya Dockerfile (Glob `services/ebook/**/Dockerfile*` → no match) — service ebook tetap tidak buildable; dan `init.sql` (`:61` mount) tidak ada di root (perlu cek apakah service postgres memakainya wajib).
3. **MEDIUM — Default admin password lemah (`admin123`) — hipotesis konfigurasi, BELUM DIPERBAIKI.** `playwright.config.prod.ts:7` berkomentar "default matches .env: admin123". Implementasi kode tidak hardcode default: `ADMIN_PASSWORD` wajib via zod (`src/config/env.ts:19`) dan dibandingkan dengan `timingSafeCompare` (`src/routes/admin/auth.ts:37,48,54`). Jika `.env` benar berisi `admin123`, ganti dengan secret kuat (`.env` tidak dibaca saat audit — verifikasi manual oleh user).
4. **MEDIUM — ecosystem.config.js non-portable — SUDAH DIPERBAIKI.** Path absolut mesin-specific (`/home/linuxbrew/.linuxbrew/bin/tsx`, `/home/openclaw/.pm2/logs/`) diganti relatif: `script: "./node_modules/.bin/tsx"`, `cwd: __dirname`, log `path.join(__dirname, "logs", "pm2", ...)` (`ecosystem.config.js:6,8,19-20`). Verifikasi: `node --check` OK.
5. **MEDIUM — WORKFLOW.md merujuk file yang tidak ada — SUDAH DIPERBAIKI.** Referensi `services/suno/client.py` dan `services/cloakbrowser/__init__.py` dihapus; kini konsisten `services/cloak_adapter/__init__.py` (`WORKFLOW.md:396,659`). Referensi `/suno <prompt>` dipertahankan karena itu command Telegram (bukan path file).

6. **HIGH — Konsolidasi frontend 3 SPA → 1 bundle React admin-ui — KODE DONE, RUNTIME PROD BELUM TERVERIFIKASI.** customer-ui/ & landing-ui/ dihapus, source digabung ke admin-ui/src/{app,landing}; main.tsx lazy 3 app (`/`, `/admin/*`, `/app/*`); vite base "/"; backend serve admin-ui/dist + SPA fallback notFoundHandler (src/index.ts:373-393). **CATATAN VERIFIKASI 2026-08-02**: `cd admin-ui && npm run build` exit 0 (7 asset, dist/ teremisi) dan `/admin/` 200 via server jalan (static serve baca disk per-request). **TAPI** server :3000/:3002 di-start ~2026-07-31 16:46 WIB TANPA `--watch` → menjalankan snapshot PRA-konsolidasi (referensi `customer-ui/dist` & `landing-ui/dist` yang sudah dihapus); akibatnya `/app` → 302 → `/app/` → **404** `{"error":"Not Found"}`. `src/index.ts` modified (mtime 2026-08-02 09:00 WIB) dan SEMUA perubahan konsolidasi masih UNCOMMITTED (HEAD `bac10d8` masih pakai customer-ui). **Blocker**: restart server (PM2 :3002 + :3000) → re-smoke `/app/*` → e2e login browser → commit. Jangan verifikasi runtime prod sebelum restart. **PASCA-FIX 2026-08-02 (testing+review+fixing agent)**: regresi CSS landing ditutup — `import "./index.css"` di `admin-ui/src/landing/App.tsx:1` (grep `hero-gradient`: terdefinisi di `admin-ui/dist/assets/App-BLVI5avz.css` = 2 match (class + media query), dipakai `App-D4fBirZS.js:1`); fallback `/admin/` dihapus dari isSpaRoute (`src/index.ts:377-380` — dead code vs catch-all `admin.ts:414-423`); landing `/` dibaca per-request (`src/routes/web/pages.ts:25-31`); verifikasi: jest 1435 passed (84 suites), build root + admin-ui exit 0, smoke :3111 `/` `/app/` `/admin/` 200. Sisa LOW: regex asset edge-case (`index.ts:380`), title "admin-ui" (`admin-ui/index.html`), cache maxAge 1h utk index.html (`index.ts:333`) — pre-existing. Blocker prod tetap: restart PM2 :3000/:3002 + e2e browser.
7. **MEDIUM — Service ebook dihapus dari docker-compose (Fase 1 konsolidasi).** services/ebook/config.py:65-68 port dikomentari; services/api.py enforce_ebook_api_key opsional; `docker compose config -q` OK, pytest subset 510 passed. Sisa: cek `init.sql` mount (docker-compose.yml:61) manual.

Tambahan (Low): doc drift — `llms.txt` sudah dikoreksi (catatan + link aktual, `llms.txt:42,50`); `README.md` sudah diberi catatan koreksi (`README.md:218` catatan `k8s/` belum ada, `:99` arahkan ke `services/ebook/AGENTS.md`) meski masih ada penyebutan "sibling `ebook/` directory" (`:83,92`) yang agak menyesatkan — bisa dirapikan lagi. Brand drift (`.env.example` header "BERKAHKARYA AI VIDEO STUDIO" vs package.json `openclaw-bot` vs repo `1ai-content`) BELUM diubah (tidak mengubah behavior, kandidat rapikan manual). coverageThreshold jest sangat rendah (branches 15 / lines 25); creds dev hardcoded di compose (`GF_SECURITY_ADMIN_PASSWORD=admin` `docker-compose.yml:171`, `POSTGRES_PASSWORD=postgres` `docker-compose.yml:57`) — sengaja dibiarkan (dev-only, bukan secret asli).

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
  TG[Telegram] -->|webhook| BOT[src/index.ts — Telegraf/Fastify :3000]
  BOT --> SVC[src/services/*.ts]
  SVC --> P[(PostgreSQL — Prisma)]
  SVC --> R[(Redis — BullMQ)]
  SVC --> PY[services/api.py — Python :8767]
  PY --> MEDIA[music/ tts/ looping/ analysis/ clipper/ ...]
  SVC --> EB[services/ebook — :8765]
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
- `playwright.config.prod.ts` — baseURL `https://content.aitradepulse.com`, tanpa webServer; komentar default `admin123` (temuan Medium #3).
- `.eslintrc.js` — eslint untuk `src/ --ext .ts`.
- `WORKFLOW.md` (mode 600) — manual operasional "1AI-CONTENT FACTORY": workflow create/edit/distribute/analyze, 25+ Telegram commands, 43+ CloakBrowser profiles, 9-tier video fallback; referensi stale `services/suno/` & `services/cloakbrowser/` sudah dikoreksi (sudah diperbaiki — lihat Prioritas #5).
- `llms.txt` — daftar doc untuk LLM; link stale sudah diberi catatan koreksi (lihat Prioritas tambahan — Low).
- `smoke_test.py` — smoke test API Python port 8767: endpoint `/health`, `/audio/*`, `/text/*`, `/image/*`, `/video/*`, `/download/*`, `/research/*`, `/trending/*`, `/analyze/*`, `/cloak/*`, `/autopilot/*`, `/calendar/*`, `/ab-test/*` + 13 negative test endpoint legacy (harus 404).
- `verify_curl.sh` & `verify_findings.py` — verifikasi ad hoc kontrak field API 8767 (caption, video/ad, autopilot/create, cloak/batch-post, autopilot/run).
- `CLAUDE.md` — pointer: "You MUST read AGENTS.md root".
- Lainnya: `CHANGELOG.md`, `CONTRIBUTING.md`, `LICENSE`, `.env.example`, `.gitignore`, `.cursorrules`, `jest.e2e.config.js`, `tsconfig.*`.

> Last updated: 2026-08-02 — konsolidasi 1 backend + 1 frontend: customer-ui/ & landing-ui/ dihapus (source digabung ke admin-ui/src/{app,landing}), vite base "/", 3 namespace di main.tsx, static serve + SPA fallback src/index.ts (328-383), ebook dihapus dari docker-compose; docs (01/02/04/06), src/AGENTS.md, tests comment disinkronkan. Rekap sebelumnya — codebase onboarding swarm, fase verifikasi: Sub-Direktori dikoreksi — `services/` kini menunjuk `services/AGENTS.md` + 31 sub-layanan, ditambah baris `services/tests/` (`services/tests/AGENTS.md` baru), baris "tanpa AGENTS.md" diperbarui (admin-ui/customer-ui/landing-ui/docs/public sudah punya AGENTS.md masing-masing), dan lokasi messages/callbacks dikoreksi ke `src/handlers/` (bukan `src/routes/` — folder `src/routes/messages` tidak ada). Catatan sesi pertama: template root (frontmatter, Tech Stack, Arsitektur, Sub-Direktori, Global Constraints, Prioritas Improvement, Excluded Paths, Dependency Map, Dokumentasi File Root) + isi placeholder This repo/Hard rules; section MANDATORY PROCESS & Rules dipertahankan verbatim. Update terakhir — fase eksekusi: semua fix kode diterapkan (tsconfig.build.json `noEmit: false`, docker-compose path, ecosystem.config.js relatif, WORKFLOW.md referensi, `services/db/models.py` DATABASE_URL, `services/autopilot/tiktok_publisher.py`, mock fs jest web.test.ts, redaksi secret test → env var) dan didokumentasikan di Prioritas Improvement (#1-#5) + Dokumen File Root; verifikasi literal: jest 1435 passed (84 suites), pytest 526 passed, `npm run build` exit 0 dengan `dist/` teremisi, `docker compose config -q` valid. Update terakhir sesi ini — fase QA multi-agent: testing (jest 1435 PASS, build x2 PASS, smoke :3111) + review (HIGH regresi CSS landing ditemukan) + fixing (5 fix diterapkan: import CSS landing, isSpaRoute /app-only, landing read per-request, komentar admin.ts, warning index.ts — lihat Prioritas #6); AGENTS.md (root, src, admin-ui, admin-ui/src/landing) disinkronkan.
