<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-01 | Updated: 2026-08-02 -->

# tests

## Purpose
Test suites covering unit, integration, and end-to-end tests. Jest with ts-jest for TypeScript, Playwright for browser, Telethon (Python) for live Telegram bot tests.

## Key Files

| File | Description |
|------|-------------|
| `setup-env.ts` | Test environment variable setup (defaults: `DEMO_MODE=false`, `BOT_TOKEN='test-token:AAtest'`, `ADMIN_PASSWORD='test-admin-password'`, `NODE_ENV=test`, dst.) |
| `setup-mocks.ts` | Shared mock definitions: `@/config/database`, `@/config/redis`, `@/config/queue` (didaftarkan via `setupFiles` di jest config) |
| `fixtures/index.ts` | Test fixture data (mockUser, mockVideo, mockTransaction, createMockContext, dst.) |
| `p2p.test.ts` | Unit test `P2pService` (calculateFee 0.5%, validateTransfer, executeTransfer via `$transaction`) |
| `p2p-integration.test.ts` | Test `sendCommand` (`src/commands/send`) + `callbackHandler` (`src/handlers/callback`) |
| `image-reference.test.ts` | Test AvatarService + capability flags provider (img2img / ip_adapter) |
| `README.md` | Panduan testing (struktur, contoh, klaim coverage — lihat Issue Spesifik) |
| `comprehensive_results.json` | Hasil 15 test manual 2026-03-24 (11 pass, 4 fail) — arsip, bukan test aktual |

## Root Python Scripts (one-off / manual — TIDAK dijalankan jest)

Script Telethon manual untuk verifikasi live bot. Kredensial sebelumnya hardcoded — **SUDAH DIPERBAIKI 2026-08-02**: diganti `os.getenv("TELEGRAM_API_ID"/"TELEGRAM_API_HASH")` (default `0`/`""`). Nilai lama yang pernah terekspos: revoke/rotasi bila perlu.

| File | Catatan |
|------|---------|
| `comprehensive_test.py`, `e2e_telegram_test.py`, `e2e_flow_verification.py`, `e2e_element_selection.py` | Kredensial via env (`TELEGRAM_API_ID`/`TELEGRAM_API_HASH`) + `SESSION_PATH` (baris 8-25) |
| `e2e_full_coverage.py` | Script Telethon manual, tidak ada kredensial di header |
| `snaptik_test.py`, `deob_test.py`, `deob_v2.py`, `deob_v3.py`, `deob_v4.py`, `debug_args.py`, `debug_sep.py`, `find_sep.py` | Reverse-engineering Snaptik (scraping token page) — utilitas sekali pakai |
| `*.json` (e2e_*_results.json) | Hasil run manual — arsip |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `unit/` | Unit tests dengan mocked dependencies (see `unit/AGENTS.md`) |
| `e2e/` | End-to-end tests (see `e2e/AGENTS.md`) |
| `fixtures/` | Test fixture data (see `fixtures/AGENTS.md`) |
| `admin/` | Admin API route tests (see `admin/AGENTS.md`) |
| `integration/` | Integration tests service-to-service (see `integration/AGENTS.md`) |
| `youtube/` | YouTube pipeline unit tests (see `youtube/AGENTS.md`) |
| `utils/` | Test helpers (container mocks) + test-nya (see `utils/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- `npm test` runs jest (`testMatch: **/*.test.ts` di `roots` src + tests; `setupFiles`: setup-env.ts + setup-mocks.ts)
- `npm run test:e2e` runs e2e (requires running server)
- Use patterns from `setup-mocks.ts` for consistent mocking
- New services need tests in `unit/services/`, new commands in `unit/commands/`
- Jangan menambah kredensial hardcoded ke file test; ambil dari env (lihat `setup-env.ts`)

## Issue Spesifik

- **Kredensial hardcoded (HIGH) — SUDAH DIPERBAIKI 2026-08-02**: semua script Telethon kini membaca `TELEGRAM_API_ID`/`TELEGRAM_API_HASH`/`BOT_TOKEN` dari env — `tests/e2e/bot/conftest.py:25-26`, `tests/e2e/bot/test_bot_telethon.py:29-30`, `tests/e2e/bot/test_bot_e2e.py:20`, `tests/e2e/full_verification.py:21-22`, dan script root `tests/*.py`. Nilai lama yang pernah hardcoded tetap harus di-revoke bila terekspos (token bot: via @BotFather).
- **Dokumentasi coverage mismatch (MEDIUM)**: `README.md` menyatakan requirement 80/75/80/80, tetapi jest config di `package.json` memakai `coverageThreshold.global` = branches 15 / functions 22 / lines 25 / statements 25.
- `setup-mocks.ts` komentar baris 4 menyebut `setupFilesAfterFramework` — config yang benar adalah `setupFiles` (jest config package.json).
- Root tests/ berisi file yang tidak masuk jest (`testMatch` hanya `*.test.ts`) — Python scripts & JSON results hanya untuk referensi manual.

<!-- MANUAL: -->
> Last updated: 2026-08-02 — update 2: verifikasi fix kredensial (env var) di semua script Telethon; Issue Spesifik HIGH kredensial → SUDAH DIPERBAIKI.
