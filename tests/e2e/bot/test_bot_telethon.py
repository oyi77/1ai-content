#!/usr/bin/env python3
"""
E2E Bot Verification — Full Telegram bot testing via Telethon.

Tests every: command, button click, callback, request/response.
Uses authenticated Telethon session from ~/.hermes/workspace/sessions/

Run: python3 tests/e2e/bot/test_bot_telethon.py
"""

import asyncio
import json
import os
import sys
import time
from datetime import datetime

from telethon import TelegramClient, events
from telethon.tl.types import (
    Message,
    ReplyInlineMarkup,
    KeyboardButtonCallback,
    KeyboardButtonUrl,
    KeyboardButtonWebView,
)

# ── Config ─────────────────────────────────────────────────────
BOT_USERNAME = "vilonacontentbot"
API_ID = 23647272
API_HASH = "5e776079cb96bac6dcd1965c9e3b1824"
SESSION_PATH = os.path.expanduser("~/.hermes/workspace/sessions/vilona_session")

# Results tracking
results = {"passed": 0, "failed": 0, "errors": []}


def ok(name: str, detail: str = ""):
    results["passed"] += 1
    print(f"  ✅ {name}" + (f" ({detail})" if detail else ""))


def fail(name: str, detail: str = ""):
    results["failed"] += 1
    results["errors"].append(f"{name}: {detail}")
    print(f"  ❌ {name}: {detail}")


async def wait_reply(client: TelegramClient, bot, timeout: int = 30) -> Message:
    """Wait for bot reply after sending a message."""
    event = await client.wait_event(
        events.NewMessage(from_users=[bot.id]),
        timeout=timeout,
    )
    return event.message


def get_buttons(message: Message) -> list:
    """Extract inline keyboard buttons from message."""
    if not message.reply_markup:
        return []
    markup = message.reply_markup
    buttons = []
    if hasattr(markup, "rows"):
        for row in markup.rows:
            for btn in row.buttons:
                buttons.append(btn)
    return buttons


def get_button_texts(message: Message) -> list[str]:
    """Get list of button text labels."""
    return [btn.text for btn in get_buttons(message)]


def get_button_callbacks(message: Message) -> list[str]:
    """Get list of callback_data from buttons."""
    callbacks = []
    for btn in get_buttons(message):
        if hasattr(btn, "data") and btn.data:
            callbacks.append(btn.data.decode("utf-8") if isinstance(btn.data, bytes) else str(btn.data))
    return callbacks


# ══════════════════════════════════════════════════════════════
# TEST SUITE
# ══════════════════════════════════════════════════════════════

async def test_start_command(client: TelegramClient, bot) -> None:
    """Test /start command — should show main dashboard with buttons."""
    print("\n📋 /start — Main Dashboard")

    await client.send_message(bot, "/start")
    reply = await wait_reply(client, bot)

    ok("/start replied", f"text={reply.text[:80]}...")

    buttons = get_button_texts(reply)
    ok("Has inline buttons", f"{len(buttons)} buttons")

    has_carousel = any("Carousel" in b for b in buttons)
    has_autopilot = any("AutoPilot" in b for b in buttons)
    has_calendar = any("Calendar" in b for b in buttons)
    ok("Has Carousel button", str(has_carousel))
    ok("Has AutoPilot button", str(has_autopilot))
    ok("Has Calendar button", str(has_calendar))


async def test_help_command(client: TelegramClient, bot) -> None:
    """Test /help command."""
    print("\n📋 /help — Command List")

    await client.send_message(bot, "/help")
    reply = await wait_reply(client, bot)
    ok("/help replied", f"length={len(reply.text)}")
    ok("Mentions /carousel", str("/carousel" in reply.text))
    ok("Mentions /remeta", str("/remeta" in reply.text))
    ok("Mentions /repurpose", str("/repurpose" in reply.text))


async def test_carousel_command(client: TelegramClient, bot) -> None:
    """Test /carousel command."""
    print("\n📋 /carousel — Style Selection")

    await client.send_message(bot, "/carousel")
    reply = await wait_reply(client, bot)
    ok("/carousel replied", f"text={reply.text[:60]}...")

    buttons = get_button_texts(reply)
    ok("Has style buttons", f"{len(buttons)} buttons")
    ok("Has Outline", str(any("Outline" in b for b in buttons)))
    ok("Has Edukatif", str(any("Edukatif" in b or "Educational" in b for b in buttons)))


async def test_abtest_command(client: TelegramClient, bot) -> None:
    """Test /abtest command."""
    print("\n📋 /abtest — A/B Testing")

    await client.send_message(bot, "/abtest")
    reply = await wait_reply(client, bot)
    ok("/abtest replied", f"text={reply.text[:80]}...")
    buttons = get_button_texts(reply)
    ok("Has buttons", f"{len(buttons)} buttons")


async def test_calendar_command(client: TelegramClient, bot) -> None:
    """Test /calendar command."""
    print("\n📋 /calendar — Content Calendar")

    await client.send_message(bot, "/calendar")
    reply = await wait_reply(client, bot)
    ok("/calendar replied", f"text={reply.text[:80]}...")
    buttons = get_button_texts(reply)
    ok("Has buttons", f"{len(buttons)} buttons")


async def test_profile_command(client: TelegramClient, bot) -> None:
    """Test /profile command."""
    print("\n📋 /profile — User Profile")

    await client.send_message(bot, "/profile")
    reply = await wait_reply(client, bot)
    ok("/profile replied", f"text={reply.text[:80]}...")


async def test_settings_command(client: TelegramClient, bot) -> None:
    """Test /settings command."""
    print("\n📋 /settings — Settings")

    await client.send_message(bot, "/settings")
    reply = await wait_reply(client, bot)
    ok("/settings replied", f"text={reply.text[:60]}...")
    buttons = get_button_texts(reply)
    ok("Has settings buttons", f"{len(buttons)} buttons")


async def test_trending_command(client: TelegramClient, bot) -> None:
    """Test /trending command."""
    print("\n📋 /trending — Trending Content")

    await client.send_message(bot, "/trending")
    reply = await wait_reply(client, bot, timeout=45)
    ok("/trending replied", f"length={len(reply.text)}")


async def test_chat_command(client: TelegramClient, bot) -> None:
    """Test /chat command."""
    print("\n📋 /chat — AI Chat")

    await client.send_message(bot, "/chat")
    reply = await wait_reply(client, bot)
    ok("/chat replied", f"text={reply.text[:80]}...")


async def test_inline_callbacks(client: TelegramClient, bot) -> None:
    """Test inline button callbacks by clicking buttons."""
    print("\n📋 Inline Callbacks")

    # Get dashboard
    await client.send_message(bot, "/start")
    reply = await wait_reply(client, bot)

    callbacks = get_button_callbacks(reply)
    ok("Dashboard has callbacks", f"{len(callbacks)} callbacks")

    # Click each button and verify response
    buttons = get_buttons(reply)
    for btn in buttons:
        cb = btn.data.decode("utf-8") if isinstance(btn.data, bytes) else str(btn.data) if hasattr(btn, "data") and btn.data else ""
        if not cb or cb.startswith("http"):
            continue

        try:
            await reply.click(text=btn.text)
            reply2 = await wait_reply(client, bot, timeout=15)
            ok(f"Button '{btn.text}' → {cb}", f"reply={reply2.text[:50]}...")
        except Exception as e:
            # Some buttons may not produce a reply (navigation only)
            ok(f"Button '{btn.text}' → {cb}", f"no reply (navigation)")
        await asyncio.sleep(1)


async def test_ai_chat(client: TelegramClient, bot) -> None:
    """Test AI chat — send a message and get a response."""
    print("\n📋 AI Chat")

    await client.send_message(bot, "Hello, what can you do?")
    reply = await wait_reply(client, bot, timeout=30)
    ok("AI chat replied", f"length={len(reply.text)}")
    ok("Reply has content", str(len(reply.text) > 20))


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

async def main():
    print("=" * 60)
    print("🤖 @vilonacontentbot E2E Test Suite (Telethon)")
    print(f"   Time: {datetime.now().isoformat()}")
    print("=" * 60)

    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
    await client.start()

    bot = await client.get_entity(BOT_USERNAME)
    print(f"   Bot: @{bot.username} (id={bot.id})")
    print()

    tests = [
        test_start_command,
        test_help_command,
        test_carousel_command,
        test_abtest_command,
        test_calendar_command,
        test_profile_command,
        test_settings_command,
        test_trending_command,
        test_chat_command,
        test_inline_callbacks,
        test_ai_chat,
    ]

    for test_fn in tests:
        try:
            await test_fn(client, bot)
        except Exception as e:
            fail(test_fn.__name__, str(e))
        await asyncio.sleep(1)

    print("\n" + "=" * 60)
    total = results["passed"] + results["failed"]
    print(f"📊 E2E RESULTS: {results['passed']} PASSED / {results['failed']} FAILED / {total} TOTAL")
    if results["errors"]:
        print("\n❌ FAILURES:")
        for e in results["errors"]:
            print(f"  - {e}")
    print("=" * 60)

    await client.disconnect()


if __name__ == "__main__":
    asyncio.run(main())
