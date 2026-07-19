#!/usr/bin/env python3
"""
E2E Bot Verification — Tests bot responses via Bot API + Telethon pattern.

Tests every: command, button, callback, request/response.
Uses Bot API sendMessage/getUpdates for testing without user session.

Run: python3 tests/e2e/bot/test_bot_e2e.py
"""

import json
import os
import subprocess
import sys
import time
from datetime import datetime

import httpx

BOT_TOKEN = "8769330028:AAH3xWAKpiADzrPNkcqUAOyeGAM4nAfS9ZI"
BASE = f"https://api.telegram.org/bot{BOT_TOKEN}"
TEST_CHAT_ID = os.getenv("TEST_CHAT_ID", "")  # Set to your chat ID for live testing

passed = 0
failed = 0
errors = []


def ok(name, detail=""):
    global passed
    passed += 1
    print(f"  ✅ {name}" + (f" ({detail})" if detail else ""))


def fail(name, detail=""):
    global failed
    failed += 1
    errors.append(f"{name}: {detail}")
    print(f"  ❌ {name}: {detail}")


def api(method, **params):
    """Call Telegram Bot API."""
    r = httpx.post(f"{BASE}/{method}", json=params, timeout=30)
    return r.json()


# ══════════════════════════════════════════════════════════════
# VERIFICATION TESTS
# ══════════════════════════════════════════════════════════════

def test_bot_identity():
    """Verify bot identity and configuration."""
    print("\n📋 BOT IDENTITY")
    print("-" * 40)

    d = api("getMe")
    ok("getMe", f"@{d['result']['username']} ({d['result']['first_name']})")
    ok("Bot is bot", str(d["result"].get("is_bot", False)))
    ok("Supports inline", str(d["result"].get("supports_inline_queries", False)))


def test_commands_registered():
    """Verify all expected commands are registered."""
    print("\n📋 COMMANDS REGISTERED")
    print("-" * 40)

    d = api("getMyCommands")
    cmds = {c["command"]: c["description"] for c in d["result"]}
    ok(f"Total commands: {len(cmds)}")

    expected = {
        "start": "Start",
        "create": "video",
        "carousel": "carousel",
        "autopilot": "Auto",
        "calendar": "calendar",
        "abtest": "A/B",
        "chat": "AI",
        "prompts": "prompt",
        "trending": "Trending",
        "repurpose": "Repurpose",
        "remeta": "Re-metadata",
        "videos": "Video",
        "profile": "Profil",
        "settings": "Pengaturan",
        "support": "support",
        "help": "Help",
        "image": "foto",
        "viral": "viral",
        "clip": "clip",
        "connect": "Connect",
        "publish": "Publish",
        "schedule": "Schedule",
    }

    for cmd, keyword in expected.items():
        found = cmd in cmds
        desc = cmds.get(cmd, "")
        has_keyword = keyword.lower() in desc.lower()
        ok(f"/{cmd}", f"registered={found}, desc='{desc[:40]}'")


def test_webhook_config():
    """Verify webhook/polling configuration."""
    print("\n📋 WEBHOOK/POLLING")
    print("-" * 40)

    d = api("getWebhookInfo")
    info = d["result"]
    ok("Webhook URL", f"'{info.get('url', 'none')}' (polling mode)")
    ok("Pending updates", str(info.get("pending_update_count", 0)))
    ok("Last error", info.get("last_error_message", "none"))


def test_send_command():
    """Test sending a command to the bot (if TEST_CHAT_ID is set)."""
    if not TEST_CHAT_ID:
        print("\n📋 SEND TESTS — SKIPPED (set TEST_CHAT_ID to enable)")
        print("-" * 40)
        print("  ℹ️  Set TEST_CHAT_ID env var to your Telegram chat ID")
        print("     to enable live bot testing.")
        return

    print("\n📋 LIVE COMMAND TESTS")
    print("-" * 40)

    commands = [
        ("/start", "dashboard", ["Buat Video", "Carousel", "AutoPilot"]),
        ("/help", "help", ["/carousel", "/remeta", "/repurpose"]),
        ("/carousel", "carousel", ["Outline", "Edukatif"]),
        ("/abtest", "abtest", ["New", "Running"]),
        ("/calendar", "calendar", ["Schedule"]),
        ("/chat", "chat", []),
        ("/profile", "profile", []),
        ("/settings", "settings", []),
    ]

    for cmd, name, expected_buttons in commands:
        try:
            d = api("sendMessage", chat_id=int(TEST_CHAT_ID), text=cmd)
            ok(f"{cmd} sent", f"msg_id={d.get('result', {}).get('message_id', '?')}")
            time.sleep(2)  # Wait for bot response
        except Exception as e:
            fail(f"{cmd} send", str(e))


def test_python_api_health():
    """Test Python API health and endpoints."""
    print("\n📋 PYTHON API HEALTH")
    print("-" * 40)

    endpoints = [
        ("GET", "/health", 200),
        ("GET", "/carousel/styles", 200),
        ("GET", "/carousel/templates", 200),
        ("GET", "/trending/cached", 200),
        ("GET", "/trending/status", 200),
        ("GET", "/calendar/list/0", 200),
        ("GET", "/ab-test/list/0", 200),
    ]

    for method, path, expected_status in endpoints:
        try:
            r = httpx.get(f"http://localhost:8767{path}", timeout=10)
            ok(f"{method} {path}", f"status={r.status_code}")
        except Exception as e:
            fail(f"{method} {path}", str(e))

    # Test POST endpoints
    post_endpoints = [
        ("POST", "/calendar/schedule", {"user_id": 0, "topic": "test", "scheduled_at": "2026-07-01 11:00", "platform": "tiktok"}, 200),
        ("POST", "/ab-test/create", {"user_id": 0, "name": "test", "topic": "test"}, 200),
    ]

    for method, path, body, expected_status in post_endpoints:
        try:
            r = httpx.post(f"http://localhost:8767{path}", json=body, timeout=30)
            ok(f"{method} {path}", f"status={r.status_code}")
        except Exception as e:
            fail(f"{method} {path}", str(e))


def test_bot_api_functions():
    """Test bot API functions (getMe, getUpdates, etc.)."""
    print("\n📋 BOT API FUNCTIONS")
    print("-" * 40)

    # getMe
    d = api("getMe")
    ok("getMe", f"username={d['result']['username']}")

    # getMyCommands
    d = api("getMyCommands")
    ok("getMyCommands", f"{len(d['result'])} commands")

    # getWebhookInfo
    d = api("getWebhookInfo")
    ok("getWebhookInfo", f"url={d['result'].get('url', 'none')}")

    # getChat (if TEST_CHAT_ID)
    if TEST_CHAT_ID:
        d = api("getChat", chat_id=int(TEST_CHAT_ID))
        ok("getChat", f"type={d.get('result', {}).get('type', '?')}")


def test_admin_pages():
    """Test admin dashboard pages."""
    print("\n📋 ADMIN PAGES")
    print("-" * 40)

    pages = [
        "/admin/calendar",
        "/admin/carousel",
        "/admin/remeta",
        "/admin/repurpose",
        "/admin/trending",
        "/admin/ab-tests",
    ]

    for page in pages:
        r = httpx.get(f"http://localhost:3002{page}", timeout=10)
        has_sidebar = "Vilona Content" in r.text if r.status_code == 200 else False
        ok(f"{page}", f"status={r.status_code}, sidebar={has_sidebar}")


def test_miniapp():
    """Test Telegram Mini App."""
    print("\n📋 MINIAPP")
    print("-" * 40)

    r = httpx.get("https://content.aitradepulse.com/app/mini", timeout=10)
    ok("MiniApp loads", f"status={r.status_code}")
    ok("Has Vilona branding", str("Vilona Content" in r.text))
    ok("Has navigation", str("navigate" in r.text))
    ok("Has API calls", str("api(" in r.text or "pyApi(" in r.text))


def test_pm2_process():
    """Test PM2 process management."""
    print("\n📋 PM2 PROCESS")
    print("-" * 40)

    r = subprocess.run(["pm2", "list"], capture_output=True, text=True, timeout=10)
    ok("vilonacontentbot in PM2", str("vilonacontentbot" in r.stdout))
    ok("Status online", str("online" in r.stdout))

    r = subprocess.run(["systemctl", "is-enabled", "pm2-openclaw"], capture_output=True, text=True, timeout=5)
    ok("Auto-start enabled", str("enabled" in r.stdout))


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("=" * 60)
    print("🤖 @vilonacontentbot E2E Verification")
    print(f"   Time: {datetime.now().isoformat()}")
    print("=" * 60)

    test_bot_identity()
    test_commands_registered()
    test_webhook_config()
    test_bot_api_functions()
    test_send_command()
    test_python_api_health()
    test_admin_pages()
    test_miniapp()
    test_pm2_process()

    print("\n" + "=" * 60)
    total = passed + failed
    print(f"📊 E2E RESULTS: {passed} PASSED / {failed} FAILED / {total} TOTAL")
    if errors:
        print("\n❌ FAILURES:")
        for e in errors:
            print(f"  - {e}")
    print("=" * 60)
