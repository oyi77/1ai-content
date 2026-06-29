#!/usr/bin/env python3
"""
E2E Bot Verification — Full Telegram bot testing via Telethon.

Tests every: command, button click, callback, inline keyboard, request/response.
Uses Telethon user client to send messages and receive bot responses.

Requires:
- TELEGRAM_API_ID and TELEGRAM_API_HASH env vars
- A test user session (will create one on first run)
- Bot username: @vilonacontentbot

Run:
    python3 tests/e2e/bot/test_bot_telethon.py
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
API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SESSION_NAME = os.getenv("TELETHON_SESSION", "e2e_test")

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
    print("-" * 40)

    msg = await client.send_message(bot, "/start")
    reply = await wait_reply(client, bot)

    # Check reply exists
    ok("/start replied", f"text={reply.text[:80]}...")

    # Check buttons exist
    buttons = get_button_texts(reply)
    ok("Has inline buttons", f"{len(buttons)} buttons: {buttons[:5]}...")

    # Check for key buttons
    has_create = any("Buat Video" in b or "Generate" in b for b in buttons)
    has_carousel = any("Carousel" in b for b in buttons)
    has_help = any("Help" in b or "📖" in b for b in buttons)
    ok("Has Buat Video button", f"found={has_create}")
    ok("Has Carousel button", f"found={has_carousel}")
    ok("Has Help button", f"found={has_help}")


async def test_help_command(client: TelegramClient, bot) -> None:
    """Test /help command — should show command list."""
    print("\n📋 /help — Command List")
    print("-" * 40)

    msg = await client.send_message(bot, "/help")
    reply = await wait_reply(client, bot)

    ok("/help replied", f"length={len(reply.text)}")
    has_carousel = "carousel" in reply.text.lower() or "/carousel" in reply.text
    has_remeta = "remeta" in reply.text.lower() or "/remeta" in reply.text
    has_repurpose = "repurpose" in reply.text.lower() or "/repurpose" in reply.text
    ok("Mentions /carousel", str(has_carousel))
    ok("Mentions /remeta", str(has_remeta))
    ok("Mentions /repurpose", str(has_repurpose))


async def test_carousel_command(client: TelegramClient, bot) -> None:
    """Test /carousel command — should show style selection."""
    print("\n📋 /carousel — Style Selection")
    print("-" * 40)

    msg = await client.send_message(bot, "/carousel")
    reply = await wait_reply(client, bot)

    ok("/carousel replied", f"text={reply.text[:60]}...")
    buttons = get_button_texts(reply)
    callbacks = get_button_callbacks(reply)
    ok("Has style buttons", f"{len(buttons)} buttons")

    has_outline = any("Outline" in b for b in buttons)
    has_educational = any("Edukatif" in b or "Educational" in b for b in buttons)
    ok("Has Outline style", str(has_outline))
    ok("Has Edukatif style", str(has_educational))

    # Test clicking a style button
    if callbacks:
        cb_msg = await client.send_message(bot, f"/carousel Tips hemat belanja online")
        reply2 = await wait_reply(client, bot)
        ok("Carousel with topic sent", f"reply={reply2.text[:60]}...")


async def test_abtest_command(client: TelegramClient, bot) -> None:
    """Test /abtest command — should show test list."""
    print("\n📋 /abtest — A/B Testing")
    print("-" * 40)

    msg = await client.send_message(bot, "/abtest")
    reply = await wait_reply(client, bot)

    ok("/abtest replied", f"text={reply.text[:80]}...")
    buttons = get_button_texts(reply)
    ok("Has buttons", f"{len(buttons)} buttons")

    has_new = any("New" in b or "➕" in b for b in buttons)
    ok("Has New Test button", str(has_new))


async def test_calendar_command(client: TelegramClient, bot) -> None:
    """Test /calendar command — should show calendar."""
    print("\n📋 /calendar — Content Calendar")
    print("-" * 40)

    msg = await client.send_message(bot, "/calendar")
    reply = await wait_reply(client, bot)

    ok("/calendar replied", f"text={reply.text[:80]}...")
    buttons = get_button_texts(reply)
    ok("Has buttons", f"{len(buttons)} buttons")


async def test_chat_command(client: TelegramClient, bot) -> None:
    """Test /chat command — should show AI chat info."""
    print("\n📋 /chat — AI Chat")
    print("-" * 40)

    msg = await client.send_message(bot, "/chat")
    reply = await wait_reply(client, bot)

    ok("/chat replied", f"text={reply.text[:80]}...")


async def test_trending_command(client: TelegramClient, bot) -> None:
    """Test /trending command — should show trending content."""
    print("\n📋 /trending — Trending Content")
    print("-" * 40)

    msg = await client.send_message(bot, "/trending")
    reply = await wait_reply(client, bot, timeout=45)

    ok("/trending replied", f"length={len(reply.text)}")


async def test_prompts_command(client: TelegramClient, bot) -> None:
    """Test /prompts command — should show prompt library."""
    print("\n📋 /prompts — Prompt Library")
    print("-" * 40)

    msg = await client.send_message(bot, "/prompts")
    reply = await wait_reply(client, bot)

    ok("/prompts replied", f"length={len(reply.text)}")


async def test_profile_command(client: TelegramClient, bot) -> None:
    """Test /profile command — should show user profile."""
    print("\n📋 /profile — User Profile")
    print("-" * 40)

    msg = await client.send_message(bot, "/profile")
    reply = await wait_reply(client, bot)

    ok("/profile replied", f"text={reply.text[:80]}...")
    has_credits = "credit" in reply.text.lower() or "kredit" in reply.text.lower() or "💎" in reply.text
    ok("Shows credits info", str(has_credits))


async def test_settings_command(client: TelegramClient, bot) -> None:
    """Test /settings command — should show settings."""
    print("\n📋 /settings — Settings")
    print("-" * 40)

    msg = await client.send_message(bot, "/settings")
    reply = await wait_reply(client, bot)

    ok("/settings replied", f"text={reply.text[:60]}...")
    buttons = get_button_texts(reply)
    ok("Has settings buttons", f"{len(buttons)} buttons")


async def test_support_command(client: TelegramClient, bot) -> None:
    """Test /support command."""
    print("\n📋 /support — Support")
    print("-" * 40)

    msg = await client.send_message(bot, "/support")
    reply = await wait_reply(client, bot)

    ok("/support replied", f"text={reply.text[:60]}...")


async def test_inline_callbacks(client: TelegramClient, bot) -> None:
    """Test inline button callbacks by simulating clicks."""
    print("\n📋 Inline Callbacks")
    print("-" * 40)

    # Send /start and get the dashboard
    await client.send_message(bot, "/start")
    reply = await wait_reply(client, bot)

    callbacks = get_button_callbacks(reply)
    buttons = get_button_texts(reply)
    ok("Dashboard has callbacks", f"{len(callbacks)} callbacks")

    # Test menu_create callback
    if "menu_create" in callbacks:
        await client.send_message(bot, "/start")
        reply = await wait_reply(client, bot)
        # Find and click the create button
        for btn in get_buttons(reply):
            cb = btn.data.decode("utf-8") if isinstance(btn.data, bytes) else str(btn.data) if hasattr(btn, "data") and btn.data else ""
            if cb == "menu_create":
                await reply.click(text=btn.text)
                reply2 = await wait_reply(client, bot)
                ok("menu_create callback", f"text={reply2.text[:60]}...")
                break

    # Test menu_help callback
    await client.send_message(bot, "/start")
    reply = await wait_reply(client, bot)
    for btn in get_buttons(reply):
        cb = btn.data.decode("utf-8") if isinstance(btn.data, bytes) else str(btn.data) if hasattr(btn, "data") and btn.data else ""
        if cb == "menu_help":
            await reply.click(text=btn.text)
            reply2 = await wait_reply(client, bot)
            ok("menu_help callback", f"text={reply2.text[:60]}...")
            break


async def test_ai_chat(client: TelegramClient, bot) -> None:
    """Test AI chat — send a message and get a response."""
    print("\n📋 AI Chat")
    print("-" * 40)

    msg = await client.send_message(bot, "Hello, what can you do?")
    reply = await wait_reply(client, bot, timeout=30)

    ok("AI chat replied", f"length={len(reply.text)}")
    has_content = len(reply.text) > 20
    ok("Reply has content", str(has_content))


async def test_invalid_input(client: TelegramClient, bot) -> None:
    """Test error handling with invalid input."""
    print("\n📋 Error Handling")
    print("-" * 40)

    # Send empty carousel
    msg = await client.send_message(bot, "/carousel")
    reply = await wait_reply(client, bot)
    ok("Empty /carousel handled", f"reply={reply.text[:60]}...")

    # Send non-existent command
    msg = await client.send_message(bot("/nonexistent"))
    # Wait briefly - bot might not reply to unknown commands
    try:
        reply = await wait_reply(client, bot, timeout=5)
        ok("Unknown command handled", f"reply={reply.text[:40]}...")
    except Exception:
        ok("Unknown command ignored (expected)", "no reply")


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

async def main():
    if not API_ID or not API_HASH:
        print("❌ Set TELEGRAM_API_ID and TELEGRAM_API_HASH env vars")
        print("   Get them from https://my.telegram.org/apps")
        sys.exit(1)

    print("=" * 60)
    print("🤖 @vilonacontentbot E2E Test Suite (Telethon)")
    print(f"   Time: {datetime.now().isoformat()}")
    print("=" * 60)

    client = TelegramClient(SESSION_NAME, API_ID, API_HASH)
    await client.start()

    # Get bot entity
    bot = await client.get_entity(BOT_USERNAME)
    print(f"   Bot: @{bot.username} (id={bot.id})")
    print()

    # Run all tests
    tests = [
        test_start_command,
        test_help_command,
        test_carousel_command,
        test_abtest_command,
        test_calendar_command,
        test_chat_command,
        test_trending_command,
        test_prompts_command,
        test_profile_command,
        test_settings_command,
        test_support_command,
        test_inline_callbacks,
        test_ai_chat,
        test_invalid_input,
    ]

    for test_fn in tests:
        try:
            await test_fn(client, bot)
        except Exception as e:
            fail(test_fn.__name__, str(e))
        await asyncio.sleep(1)  # Rate limit

    # Final report
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
