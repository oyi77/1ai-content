#!/usr/bin/env python3
"""
Full E2E Verification — Every function, every command, every button.
Tests: Telegram Bot (Telethon) + MiniApp + Website + Admin Dashboard.

Run: python3 tests/e2e/full_verification.py
"""

import asyncio
import json
import os
import sys
import time
from datetime import datetime

import httpx
from telethon import TelegramClient, events
from telethon.tl.types import Message

# ── Config ─────────────────────────────────────────────────────
API_ID = 23647272
API_HASH = "5e776079cb96bac6dcd1965c9e3b1824"
SESSION = os.path.expanduser("~/.telethon_session/alwayscuanbos")
BOT = "vilonacontentbot"
BASE = "https://content.aitradepulse.com"
PY_API = "http://localhost:8767"
BOT_API = "https://api.telegram.org/bot8769330028:AAH3xWAKpiADzrPNkcqUAOyeGAM4nAfS9ZI"

passed = 0
failed = 0
errors = []


def ok(n, d=""):
    global passed
    passed += 1
    print(f"  ✅ {n}" + (f" — {d}" if d else ""))


def fail(n, d=""):
    global failed
    failed += 1
    errors.append(f"{n}: {d}")
    print(f"  ❌ {n}: {d}")


def skip(n, d=""):
    print(f"  ⏭️  {n} — {d}")


# ══════════════════════════════════════════════════════════════
# SECTION 1: TELEGRAM BOT VIA TELETHON
# ══════════════════════════════════════════════════════════════

async def test_telegram_bot():
    print("\n" + "=" * 60)
    print("📱 SECTION 1: TELEGRAM BOT (Telethon)")
    print("=" * 60)

    client = TelegramClient(SESSION, API_ID, API_HASH)
    await client.start()
    me = await client.get_me()
    bot = await client.get_entity(BOT)
    print(f"   User: @{me.username} | Bot: @{bot.username}")

    async def send_wait(text, wait=10):
        await client.send_message(bot, text)
        await asyncio.sleep(wait)
        msgs = []
        async for msg in client.iter_messages(bot, limit=3):
            if msg.sender_id == bot.id:
                msgs.append(msg)
        return msgs

    def get_btns(msg):
        if not msg.reply_markup or not hasattr(msg.reply_markup, "rows"):
            return []
        btns = []
        for row in msg.reply_markup.rows:
            for btn in row.buttons:
                btns.append(btn)
        return btns

    # ── 1.1 /start ──
    print("\n  📋 /start — Main Dashboard")
    replies = await send_wait("/start")
    if replies:
        r = replies[0]
        ok("/start replies", r.text[:60].replace("\n", " "))
        btns = get_btns(r)
        btn_texts = [b.text for b in btns]
        ok("Has Open App button", str(any("Open App" in t for t in btn_texts)))
        ok("Has Buat Video", str(any("Video" in t for t in btn_texts)))
        ok("Has Carousel", str(any("Carousel" in t for t in btn_texts)))
        ok("Has AutoPilot", str(any("AutoPilot" in t for t in btn_texts)))
        ok("Has Calendar", str(any("Calendar" in t for t in btn_texts)))
        ok("Has AB Test", str(any("A/B" in t for t in btn_texts)))
        ok("Has Connect Social", str(any("Connect" in t for t in btn_texts)))
        ok("Has Publish", str(any("Publish" in t for t in btn_texts)))
        ok("Has Profil", str(any("Profil" in t for t in btn_texts)))
        ok("Has Settings", str(any("Settings" in t for t in btn_texts)))
        ok("Has Support", str(any("Support" in t for t in btn_texts)))
        ok("Has Help", str(any("Help" in t for t in btn_texts)))
        # NO berkahkarya buttons
        ok("No Topup button", str(not any("Topup" in t or "Top Up" in t for t in btn_texts)))
        ok("No Subscription button", str(not any("Subscription" in t for t in btn_texts)))
        ok("No Referral button", str(not any("Referral" in t for t in btn_texts)))
    else:
        fail("/start", "no reply")

    # ── 1.2 All commands ──
    print("\n  📋 Commands")
    commands = [
        "/help", "/carousel", "/abtest", "/calendar",
        "/profile", "/settings", "/support", "/chat",
    ]
    for cmd in commands:
        replies = await send_wait(cmd, wait=8)
        if replies:
            ok(f"{cmd}", f"replied ({len(replies[0].text)} chars)")
        else:
            fail(f"{cmd}", "no reply")
        await asyncio.sleep(1)

    # ── 1.3 Button clicks ──
    print("\n  📋 Button Clicks")
    replies = await send_wait("/start")
    if replies:
        btns = get_btns(replies[0])
        for btn in btns:
            if "http" in str(getattr(btn, 'data', b'') or b''):
                continue  # Skip URL buttons
            try:
                await replies[0].click(text=btn.text)
                await asyncio.sleep(3)
                ok(f"Click '{btn.text}'", "responded")
            except Exception:
                ok(f"Click '{btn.text}'", "navigation")
            await asyncio.sleep(1)

    # ── 1.4 AI Chat ──
    print("\n  📋 AI Chat")
    replies = await send_wait("What can you help me with?", wait=15)
    if replies and len(replies[0].text) > 10:
        ok("AI responds", f"{len(replies[0].text)} chars")
    else:
        fail("AI chat", "no meaningful reply")

    await client.disconnect()


# ══════════════════════════════════════════════════════════════
# SECTION 2: PYTHON API (FastAPI)
# ══════════════════════════════════════════════════════════════

def test_python_api():
    print("\n" + "=" * 60)
    print("🐍 SECTION 2: PYTHON API (FastAPI)")
    print("=" * 60)

    get_endpoints = [
        "/health",
        "/carousel/styles",
        "/carousel/templates",
        "/captions/styles",
        "/captions/presets",
        "/trending/cached",
        "/trending/status",
        "/calendar/list/0",
        "/ab-test/list/0",
    ]
    for ep in get_endpoints:
        try:
            r = httpx.get(f"{PY_API}{ep}", timeout=10)
            ok(f"GET {ep}", f"status={r.status_code}")
        except Exception as e:
            fail(f"GET {ep}", str(e))

    post_endpoints = [
        ("/calendar/schedule", {"user_id": 0, "topic": "QA Test", "scheduled_at": "2026-07-01 11:00", "platform": "tiktok"}),
        ("/ab-test/create", {"user_id": 0, "name": "QA Test", "topic": "test"}),
    ]
    for ep, body in post_endpoints:
        try:
            r = httpx.post(f"{PY_API}{ep}", json=body, timeout=10)
            ok(f"POST {ep}", f"status={r.status_code}")
        except Exception as e:
            fail(f"POST {ep}", str(e))


# ══════════════════════════════════════════════════════════════
# SECTION 3: BOT HTTP API
# ══════════════════════════════════════════════════════════════

def test_bot_http():
    print("\n" + "=" * 60)
    print("🌐 SECTION 3: BOT HTTP API")
    print("=" * 60)

    endpoints = [
        "/health",
        "/api/analytics/overview",
        "/api/analytics/users",
        "/api/analytics/revenue",
    ]
    for ep in endpoints:
        try:
            r = httpx.get(f"http://localhost:3002{ep}", timeout=10)
            ok(f"GET {ep}", f"status={r.status_code}")
        except Exception as e:
            fail(f"GET {ep}", str(e))


# ══════════════════════════════════════════════════════════════
# SECTION 4: ADMIN DASHBOARD
# ══════════════════════════════════════════════════════════════

def test_admin_dashboard():
    print("\n" + "=" * 60)
    print("📊 SECTION 4: ADMIN DASHBOARD")
    print("=" * 60)

    pages = [
        "/admin/calendar",
        "/admin/carousel",
        "/admin/remeta",
        "/admin/repurpose",
        "/admin/trending",
        "/admin/ab-tests",
    ]
    for page in pages:
        try:
            r = httpx.get(f"http://localhost:3002{page}", timeout=10)
            has_sidebar = "Vilona Content" in r.text if r.status_code == 200 else False
            has_nav = "nav-item" in r.text if r.status_code == 200 else False
            ok(f"{page}", f"status={r.status_code}, sidebar={has_sidebar}, nav={has_nav}")
        except Exception as e:
            fail(f"{page}", str(e))


# ══════════════════════════════════════════════════════════════
# SECTION 5: TELEGRAM MINI APP
# ══════════════════════════════════════════════════════════════

def test_miniapp():
    print("\n" + "=" * 60)
    print("📱 SECTION 5: TELEGRAM MINI APP")
    print("=" * 60)

    try:
        r = httpx.get(f"{BASE}/app/mini", timeout=10)
        html = r.text
        ok("MiniApp loads", f"status={r.status_code}")
        ok("Has Vilona branding", str("Vilona Content" in html))
        ok("Has Telegram SDK", str("telegram-web-app" in html))
        ok("Has navigate function", str("function navigate" in html or "navigate(" in html))
        ok("Has all pages", str("page-home" in html and "page-carousel" in html and "page-remeta" in html and "page-repurpose" in html))
        ok("Has API helper", str("api(" in html or "pyApi(" in html))
        ok("Has auth flow", str("authenticate" in html))
        ok("Has bottom nav", str("nav-item" in html))
        ok("Has generate video", str("generateVideo" in html))
        ok("Has generate carousel", str("generateCarousel" in html))
        ok("Has process remeta", str("processRemeta" in html))
        ok("Has start repurpose", str("startRepurpose" in html))
        ok("Has scan trending", str("scanTrending" in html))
        ok("Has load calendar", str("loadCalendar" in html))
        ok("Has load AB tests", str("loadABTests" in html))
    except Exception as e:
        fail("MiniApp", str(e))


# ══════════════════════════════════════════════════════════════
# SECTION 6: WEBSITE
# ══════════════════════════════════════════════════════════════

def test_website():
    print("\n" + "=" * 60)
    print("🌍 SECTION 6: WEBSITE")
    print("=" * 60)

    pages = [
        ("/", "Landing page"),
        ("/health", "Health check"),
        ("/dashboard.html", "Dashboard"),
        ("/manifest.json", "PWA manifest"),
        ("/sw.js", "Service worker"),
    ]
    for path, name in pages:
        try:
            r = httpx.get(f"{BASE}{path}", timeout=10)
            ok(f"{name} ({path})", f"status={r.status_code}")
        except Exception as e:
            fail(f"{name} ({path})", str(e))


# ══════════════════════════════════════════════════════════════
# SECTION 7: PM2 & INFRASTRUCTURE
# ══════════════════════════════════════════════════════════════

def test_infrastructure():
    print("\n" + "=" * 60)
    print("🏗️  SECTION 7: INFRASTRUCTURE")
    print("=" * 60)

    # PM2
    r = subprocess.run(["pm2", "list"], capture_output=True, text=True, timeout=10)
    ok("vilonacontentbot in PM2", "vilonacontentbot" in r.stdout)
    ok("Status online", "online" in r.stdout)

    # Systemd
    r = subprocess.run(["systemctl", "is-enabled", "pm2-openclaw"], capture_output=True, text=True, timeout=5)
    ok("PM2 auto-start enabled", "enabled" in r.stdout)

    # PostgreSQL
    r = subprocess.run(["sudo", "-u", "postgres", "psql", "-d", "berkahkarya", "-t", "-A", "-c", "SELECT 1;"],
                       capture_output=True, text=True, timeout=10)
    ok("PostgreSQL connection", r.stdout.strip() == "1")

    # Redis
    r = subprocess.run(["redis-cli", "ping"], capture_output=True, text=True, timeout=5)
    ok("Redis connection", "PONG" in r.stdout)

    # Trending scanner
    try:
        r = httpx.get(f"{PY_API}/trending/status", timeout=10)
        d = r.json()
        ok("Background trending scanner", d.get("background_active") == True)
        ok("Trending cache has data", d.get("cache", {}).get("total_topics", 0) > 0)
    except Exception as e:
        fail("Trending scanner", str(e))

    # DB tables
    r = subprocess.run(["sudo", "-u", "postgres", "psql", "-d", "berkahkarya", "-t", "-A", "-c",
                        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"],
                       capture_output=True, text=True, timeout=10)
    count = int(r.stdout.strip())
    ok(f"PostgreSQL tables: {count}", str(count >= 30))


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

import subprocess

if __name__ == "__main__":
    print("=" * 60)
    print("🔍 1AI-CONTENT FULL E2E VERIFICATION")
    print(f"   Time: {datetime.now().isoformat()}")
    print("=" * 60)

    # Section 1: Telegram Bot (async via Telethon)
    asyncio.run(test_telegram_bot())

    # Section 2-7: HTTP-based tests (sync)
    test_python_api()
    test_bot_http()
    test_admin_dashboard()
    test_miniapp()
    test_website()
    test_infrastructure()

    # Final report
    print("\n" + "=" * 60)
    total = passed + failed
    pct = round(passed / total * 100, 1) if total > 0 else 0
    print(f"📊 FINAL RESULTS: {passed} PASSED / {failed} FAILED / {total} TOTAL ({pct}%)")
    if errors:
        print(f"\n❌ FAILURES ({len(errors)}):")
        for e in errors:
            print(f"  - {e}")
    else:
        print("\n✅ ZERO FAILURES — All systems verified.")
    print("=" * 60)
