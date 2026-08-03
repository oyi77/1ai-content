<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-01 | Updated: 2026-08-02 -->

# src

## Purpose
Application source code. Telegram bot utama, MCP server, Fastify HTTP server, BullMQ job processing, multi-provider AI video generation pipeline, credit-based payment processing, dan admin dashboard.

## Key Files (Entry Points)

| File | Deskripsi |
|------|-----------|
| `index.ts` | Entry utama (521 baris) — bootstrap Telegraf bot + Fastify + BullMQ workers + routes. Setup: `appConfig.BOT_TOKEN` (baris 60), patch `BigInt.prototype.toJSON` (68), override API-key DB → process.env (91-101), worker startup guard `isPlaceholderToken` (79), cron inline (156-200), CORS handler (275-308), reverse proxy `/api/py` → `http://127.0.0.1:8767` (311-320), static admin-ui `/admin/` (329), `public/` root di `/public/` (338-340), static admin-ui single bundle `/assets/` (346-359), SPA fallback notFoundHandler `/app/*` → index.html (373-393; `/admin/*` ditangani catch-all `src/routes/admin.ts:414-423`), handler 404/500 (394-424), webhook vs polling (441-479), graceful shutdown (482), unhandledRejection/uncaughtException + admin alert (494-525) |
| `cron.ts` | `scheduleCronJobs(bot)` (baris 21) — 4 cron job (retention `0 */6 * * *`, subscription `5 17 * * *`, credit `0 17 * * *`, refund `*/5 * * * *`). **DUPLIKAT cron inline index.ts:156-200 dan TIDAK dipanggil modul mana pun → dead code** |
| `README.md` | Dokumentasi lama (78 baris) — **STALE**: masih menyebut struktur `models/` yang sudah tidak ada, tidak menyebut i18n/mcp/repositories/tools |

## Subdirectories

| Direktori | Purpose | AGENTS.md |
|-----------|---------|-----------|
| `commands/` | Bot slash command handlers | ✅ `commands/AGENTS.md` |
| `config/` | Runtime configuration & engines | ✅ `config/AGENTS.md` |
| `flows/` | Video generation orchestration | ✅ `flows/AGENTS.md` |
| `handlers/` | Telegram callback/message routing | ✅ `handlers/AGENTS.md` |
| `i18n/` | Terjemahan & helper `t()` | ✅ `i18n/AGENTS.md` (baru) |
| `mcp/` | MCP server "1ai-content" | ✅ `mcp/AGENTS.md` (baru) |
| `menus/` | Inline keyboard builders | ✅ `menus/AGENTS.md` |
| `middleware/` | Telegraf middleware chain | ✅ `middleware/AGENTS.md` |
| `public/` | Aset statis web (favicon, hero image) | ✅ `public/AGENTS.md` (baru) |
| `repositories/` | Layer akses data (proof-of-concept, saat ini dead code) | ✅ `repositories/AGENTS.md` (baru) |
| `routes/` | Fastify HTTP routes | ✅ `routes/AGENTS.md` |
| `scripts/` | `seed.ts` — DB seeding (diimpor `index.ts:38` via `@/scripts/seed`) | ❌ [FILE TIDAK TERLAMPIR — inferensi dari index.ts:38] |
| `services/` | Business logic — 76 file `*.service.ts` | ✅ `services/AGENTS.md` |
| `tools/` | Repo tool pihak ketiga yang di-vendor (krillinai, tiktok-downloader, vidbee) | ✅ `tools/AGENTS.md` (baru) |
| `types/` | TypeScript type definitions | ✅ `types/AGENTS.md` |
| `utils/` | Utility functions | ✅ `utils/AGENTS.md` |
| `views/` | EJS templates admin/web | ✅ `views/AGENTS.md` |
| `workers/` | BullMQ worker processes | ✅ `workers/AGENTS.md` |

## Temuan (onboarding SRC, 2026-08-02)

### High
1. **IDOR di MCP server** — `mcp/server.ts:287-291` (`1ai-content_get_ebook_status`) & `293-297` (`1ai-content_list_ebooks`) memanggil `ebookService.getStatus(projectId)` / `listProjects(limit)` TANPA userId; `ebook.service.ts:143` & `179` → GET `{EBOOK_API_URL}/text/ebook/projects/{id}/status` tanpa ownership check → akses lintas-user. (SUDAH DIPERBAIKI 2026-08-03 — ownership check ditambahkan, lihat laporan audit.)

### Medium
- `cron.ts` duplikat cron inline `index.ts:156-200`; tidak dipanggil siapa pun (dead code, risiko drift).
- `mcp/server.ts:299-304` (`1ai-content_ai_chat`) — `getOmniRouteService().chat(telegramId, message)` tanpa credit check.
- `mcp/server.ts:188-233` (`1ai-content_create_video`) — mengirim `chatId: 0` → hasil tidak terkirim ke user.
- `repositories/*` — komentar "proof-of-concept", tidak diimpor modul mana pun → dead code.
- `services/AGENTS.md` lama hanya mendokumentasikan 41 dari 76 file `*.service.ts` (35 tidak terdaftar).

### Low
- `mcp/server.ts:173` — health check hardcode `services: { video: true, image: true, social: true }` padahal hanya ebook yang benar-benar dicek.
- `src/README.md` stale (menyebut struktur `models/` yang tidak ada).

## For AI Agents

### Working In This Directory
- Gunakan `@/*` path alias untuk import (mapping ke `src/*`)
- Session state machine: `BotState` union di `types/index.ts`; transisi state via `ctx.session.state`
- `videoCreation` di session mengakumulasi data form create multi-step
- Satu jalur Telegram: bot utama (`index.ts`, webhook/polling) — content-bot dihapus 2026-08-03
- **JANGAN baca `.env`** — gunakan `.env.example`; secret di AGENTS.md harus redacted (maks 8 karakter terakhir)

### Common Patterns
- Services encapsulate business logic, handlers tetap tipis
- Redis-backed sessions dengan 24h TTL
- BullMQ untuk async video generation jobs
- Circuit breaker pattern untuk provider fallback

## Dependencies

### External
- `telegraf` — Telegram bot framework
- `fastify` — HTTP server
- `bullmq` — Job queue processing
- `@prisma/client` — Database ORM
- `ioredis` — Redis client

<!-- MANUAL: -->

> Last updated: 2026-08-02
