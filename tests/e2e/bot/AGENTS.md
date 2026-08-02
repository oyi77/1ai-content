<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-01 | Updated: 2026-08-02 -->

# Telegram Bot E2E Tests

Python/pytest tests for live Telegram bot interactions using Telethon client library.

## Purpose

Test actual Telegram bot behavior by sending real messages/callbacks through Telegram API. Verify bot responses, state transitions, and side effects (credits, videos, etc.).

## Key Files

| File | Purpose |
|---|---|
| conftest.py | Pytest fixtures dan setup. Kredensial via env (`TELEGRAM_API_ID`/`TELEGRAM_API_HASH`, baris 25-26) — **SUDAH DIPERBAIKI 2026-08-02** |
| test_commands.py | Test bot commands |
| test_create_flow.py | Video creation workflow |
| test_onboarding.py | First-time user flow |
| test_payment_flow.py | Payment workflows |
| test_prompts_flow.py | Prompt template selection |
| test_referral.py | Referral system |
| test_settings_flow.py | User settings |
| test_webapp_endpoints.py | Web app endpoints |
| test_bot_e2e.py | E2E langsung ke Bot API Telegram. Kredensial via env `BOT_TOKEN` (baris 20) — **SUDAH DIPERBAIKI 2026-08-02**; token lama pernah live & terekspos → WAJIB di-revoke via @BotFather |
| test_bot_telethon.py | E2E Telethon tambahan. Kredensial via env (`TELEGRAM_API_ID`/`TELEGRAM_API_HASH`, baris 29-30) — **SUDAH DIPERBAIKI 2026-08-02** |
| test_youtube_commands.py | Test perintah YouTube |
| pytest.ini | Konfigurasi pytest |
| requirements.txt | Dependensi Python (Telethon, pytest) |

> Catatan: daftar diperbarui 2026-08-02 — 3 test file + 2 file config ditambahkan dari listing disk.

## Subdirectories

None.

## For AI Agents

**Telethon setup:** conftest.py initializes Telethon client with test account credentials.

**Bot interaction:** Use client to send messages and receive responses.

**Assertions:** Verify bot replies and database state changes.

**Async/await:** All Telethon operations are async.

**Cleanup:** Fixtures should delete test users and data after tests.

## Dependencies

- Python 3.8+
- Telethon library
- pytest
- Live bot instance

## Testing

Set environment variables and run pytest tests/e2e/bot/.

<!-- MANUAL: -->
Bot e2e tests require live infrastructure.
Telethon sessions persist; clean up test accounts.
Be mindful of Telegram API rate limits.

> Last updated: 2026-08-02 — update 2: verifikasi fix kredensial → env var di conftest.py, test_bot_e2e.py, test_bot_telethon.py; tandai SUDAH DIPERBAIKI; token bot lama harus di-revoke via @BotFather.
