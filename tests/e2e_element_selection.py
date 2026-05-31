#!/usr/bin/env python3
"""
E2E Test: Element Selection UI for i2i (image-to-image)
Navigation: /start → image_generate → product category → imgref_upload → upload image

TC1 - Loading indicator shown before keyboard (🔍 Menganalisis gambar)
TC2 - Element keyboard appears in Bahasa Indonesia (Produk/Objek, Orang/Model)
TC3 - Default selection: Produk=✅, Orang=☐
TC4 - "Lewati" button skips to prompt input
TC5 - "Generate →" with Produk proceeds to prompt input
"""

import asyncio
import os
import sys
import json
import time
import subprocess
from telethon import TelegramClient
from telethon.errors import FloodWaitError
from datetime import datetime

API_ID = 23913448
API_HASH = "78d168f985edf365a5cd9679a917a0b2"
SESSION_PATH = "/home/openclaw/.openclaw/workspace/.vilona/sessions/paijo"
BOT_USERNAME = "berkahkarya_saas_bot"
TEST_IMAGE = "/home/openclaw/.openclaw/workspace/flosia-tiktok-scenes/flosia_scene3_using_detergent.png"

RESULTS = []


def flush_vision_cache():
    """Delete all vision:cache:image:* keys from Redis so analysis actually runs (~3-5s)."""
    try:
        result = subprocess.run(
            ["redis-cli", "--scan", "--pattern", "vision:cache:image:*"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        keys = result.stdout.strip().split("\n")
        keys = [k for k in keys if k]
        if keys:
            subprocess.run(["redis-cli", "del"] + keys, capture_output=True, timeout=5)
            print(f"  [cache] flushed {len(keys)} vision cache key(s)")
        else:
            print("  [cache] no vision cache keys to flush")
    except Exception as e:
        print(f"  [cache] flush failed (non-fatal): {e}")


def log(tc, status, detail=""):
    icon = "✅" if status == "PASS" else "❌"
    print(f"{icon} {tc}: {detail}")
    RESULTS.append({"tc": tc, "status": status, "detail": detail})


def ts():
    return datetime.now().strftime("%H:%M:%S")


async def click_btn(msg, *keywords, wait=4):
    """Click first button matching any keyword."""
    if not msg or not msg.buttons:
        return None
    for row in msg.buttons:
        for btn in row:
            if any(kw.lower() in btn.text.lower() for kw in keywords):
                print(f"  [{ts()}] clicking [{btn.text}]")
                try:
                    await btn.click()
                except FloodWaitError as e:
                    await asyncio.sleep(e.seconds + 3)
                await asyncio.sleep(wait)
                return btn.text
    available = [b.text for row in msg.buttons for b in row]
    print(f"  [WARN] none of {keywords!r} found. Available: {available}")
    return None


async def get_recent(client, bot, limit=10):
    """Get recent messages from bot (incoming only)."""
    msgs = await client.get_messages(bot, limit=limit)
    return [m for m in msgs if not m.out]


async def wait_for_new_msg(client, bot, after_id, timeout=25, with_buttons=False):
    """Poll for a new bot message after after_id."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        await asyncio.sleep(2)
        msgs = await get_recent(client, bot, limit=5)
        for m in msgs:
            if m.id > after_id:
                if with_buttons and not m.buttons:
                    continue
                return m
    return None


def _is_stale_keyboard(msg):
    """Return True if the message has element-selection buttons (stale state from prior run)."""
    if not msg or not msg.buttons:
        return False
    texts = [b.text.lower() for row in msg.buttons for b in row]
    return any(
        any(kw in t for kw in ("produk/objek", "orang/model", "lewati")) for t in texts
    )


async def navigate_to_imgref_upload(client, bot):
    """Navigate bot to IMAGE_REFERENCE_WAITING state. Returns (last_msg_id, success)."""
    # Reset — send /start up to twice to clear stale element-selection state
    await client.send_message(bot, "/start")
    await asyncio.sleep(4)

    msgs = await get_recent(client, bot, limit=3)
    start_msg = msgs[0] if msgs else None
    if not start_msg:
        return None, "No response to /start"

    # If bot returned a stale element-selection keyboard, send /start again to reset
    if _is_stale_keyboard(start_msg):
        print(f"  [nav] stale element-selection keyboard detected — resending /start")
        await client.send_message(bot, "/start")
        await asyncio.sleep(5)
        msgs = await get_recent(client, bot, limit=3)
        start_msg = msgs[0] if msgs else start_msg

    print(
        f"  [nav] /start response id={start_msg.id} btns={[b.text for row in (start_msg.buttons or []) for b in row]}"
    )

    # Click image generation entry point — do NOT include 'generate' (matches element btn)
    clicked = await click_btn(
        start_msg, "create image", "image", "gambar", "foto", wait=4
    )
    if not clicked:
        # Try via /help → Main Menu
        await client.send_message(bot, "/help")
        await asyncio.sleep(4)
        msgs = await get_recent(client, bot, limit=3)
        help_msg = msgs[0] if msgs else None
        await click_btn(help_msg, "main menu", "menu utama", "home", wait=5)
        msgs = await get_recent(client, bot, limit=5)
        main_msg = next((m for m in msgs if m.buttons), None)
        clicked = await click_btn(
            main_msg, "create image", "image", "gambar", "foto", wait=4
        )

    # Re-fetch the message (it may have been edited in place)
    msgs = await get_recent(client, bot, limit=5)
    current = msgs[0] if msgs else None
    print(
        f"  [nav] after image click id={current.id if current else None} btns={[b.text for row in (current.buttons or []) for b in row] if current else []}"
    )

    # Click product category
    if current and current.buttons:
        clicked2 = await click_btn(current, "product", "produk", "foto produk", wait=4)
        if clicked2:
            msgs = await get_recent(client, bot, limit=5)
            current = msgs[0] if msgs else current

    print(
        f"  [nav] after category id={current.id if current else None} btns={[b.text for row in (current.buttons or []) for b in row] if current else []}"
    )

    # Click imgref_upload (Upload Reference Image)
    if current:
        clicked3 = await click_btn(
            current, "upload", "reference", "referensi", "foto referensi", wait=4
        )
        if not clicked3:
            # Might need to search across recent messages
            msgs = await get_recent(client, bot, limit=8)
            for m in msgs:
                if m.buttons:
                    c = await click_btn(m, "upload", "reference", "referensi", wait=4)
                    if c:
                        clicked3 = c
                        break

    msgs = await get_recent(client, bot, limit=3)
    final = msgs[0] if msgs else None
    print(
        f"  [nav] after imgref_upload id={final.id if final else None} text={(final.text or '')[:80] if final else None}"
    )
    return final, "ok"


async def main():
    print(f"\n{'='*60}")
    print("E2E Test: Element Selection UI (i2i)")
    print(f"Bot: @{BOT_USERNAME}")
    print(f"Image: {TEST_IMAGE} ({os.path.getsize(TEST_IMAGE):,} bytes)")
    print(f"{'='*60}\n")

    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
    await client.connect()
    if not await client.is_user_authorized():
        print("❌ Not authorized. Run the session setup first.")
        sys.exit(1)
    me = await client.get_me()
    print(f"Logged in as @{me.username}\n")
    bot = await client.get_entity(BOT_USERNAME)

    # ── Navigate to IMAGE_REFERENCE_WAITING ──
    print("Navigating to image reference state...")
    nav_msg, nav_status = await navigate_to_imgref_upload(client, bot)
    if nav_status != "ok" or not nav_msg:
        print(f"❌ Navigation failed: {nav_status}")
        for tc in ["TC1", "TC2", "TC3", "TC4", "TC5"]:
            log(tc, "FAIL", f"Navigation failed: {nav_status}")
        await client.disconnect()
        return

    last_id = nav_msg.id

    # ── Upload product image ──
    # Flush vision cache so analysis actually runs (cold cache → ~3-5s → loading indicator visible)
    flush_vision_cache()
    print(f"\nUploading product image (after id={last_id})...")
    upload_start = time.time()
    await client.send_file(bot, TEST_IMAGE)
    print(f"  Image sent at {ts()}, waiting for bot response (up to 30s)...")

    # Collect ALL new messages — poll fast (0.5s) for first 8s to catch transient loading msg.
    # Also re-check seen messages each poll: bot edits the loading msg in-place to add the keyboard.
    received = []  # latest state of each message (updated on edit)
    first_seen = {}  # id → original message snapshot (never mutated, for TC1)
    received_map = {}  # id → latest msg object
    deadline = time.time() + 30
    seen_ids = set()
    keyboard_found = False
    while time.time() < deadline and not keyboard_found:
        elapsed = time.time() - upload_start
        await asyncio.sleep(0.5 if elapsed < 8 else 2)
        msgs = await get_recent(client, bot, limit=10)
        for m in msgs:
            if m.id > last_id:
                if m.id not in seen_ids:
                    seen_ids.add(m.id)
                    received.append(m)
                    received_map[m.id] = m
                    first_seen[m.id] = m  # snapshot original
                    print(
                        f"  [t+{time.time()-upload_start:.1f}s] new msg id={m.id} text={(m.text or '')[:60]!r} has_buttons={bool(m.buttons)}"
                    )
                    if m.buttons:
                        keyboard_found = True
                elif (
                    received_map.get(m.id)
                    and not received_map[m.id].buttons
                    and m.buttons
                ):
                    # Message was edited to add buttons (loading → keyboard); update current state
                    received_map[m.id] = m
                    for i, r in enumerate(received):
                        if r.id == m.id:
                            received[i] = m
                            break
                    # first_seen[m.id] keeps the original loading text — do NOT overwrite
                    print(
                        f"  [t+{time.time()-upload_start:.1f}s] msg id={m.id} EDITED → added buttons {[b.text for row in m.buttons for b in row]}"
                    )
                    keyboard_found = True

    print(f"\n  Total new messages: {len(received)}")

    if not received:
        print("  ⚠️  No messages received. Bot may not be in correct state.")
        print("  Recent messages:")
        msgs = await get_recent(client, bot, limit=5)
        for m in msgs:
            print(
                f"    id={m.id} text={(m.text or '')[:80]!r} btns={[b.text for row in (m.buttons or []) for b in row]}"
            )

    # ── TC1: Loading indicator ──
    # Check first_seen snapshots (original text before edit) — loading msg is edited in-place
    loading_snap = next(
        (
            m
            for m in first_seen.values()
            if "menganalisis" in (m.text or "").lower()
            or "analyzing" in (m.text or "").lower()
            or "🔍" in (m.text or "")
        ),
        None,
    )
    log(
        "TC1",
        "PASS" if loading_snap else "FAIL",
        (
            f"Loading msg: {(loading_snap.text or '')[:60]!r}"
            if loading_snap
            else f"Not found in originals: {[(m.text or '')[:40] for m in first_seen.values()]}"
        ),
    )

    # ── TC2: Keyboard in Bahasa Indonesia ──
    keyboard_msg = next((m for m in reversed(received) if m.buttons), None)

    if keyboard_msg:
        btn_texts = [b.text for row in keyboard_msg.buttons for b in row]
        print(f"\n  Keyboard buttons: {btn_texts}")
        has_id = any("produk" in t.lower() or "orang" in t.lower() for t in btn_texts)
        no_en = not any(t in ["Product/Subject", "Character/Person"] for t in btn_texts)
        log("TC2", "PASS" if (has_id and no_en) else "FAIL", f"Buttons: {btn_texts}")

        # ── TC3: Default Produk=✅, Orang=☐ ──
        produk_btn = next(
            (t for t in btn_texts if "produk" in t.lower() or "objek" in t.lower()),
            None,
        )
        orang_btn = next(
            (t for t in btn_texts if "orang" in t.lower() or "model" in t.lower()), None
        )
        produk_checked = produk_btn and "✅" in produk_btn
        orang_unchecked = not orang_btn or "✅" not in orang_btn
        log(
            "TC3",
            "PASS" if (produk_checked and orang_unchecked) else "FAIL",
            f"Produk='{produk_btn}', Orang='{orang_btn}'",
        )

        # ── TC4: Lewati button ──
        print("\nTC4: Testing Lewati button...")
        before_id = keyboard_msg.id
        lewati = await click_btn(keyboard_msg, "lewati", "skip", wait=6)
        if lewati:
            after = await wait_for_new_msg(client, bot, before_id, timeout=10)
            if not after:
                msgs = await get_recent(client, bot, limit=3)
                # Also check if original message was edited
                refetched = await client.get_messages(bot, ids=keyboard_msg.id)
                after = (
                    refetched
                    if not isinstance(refetched, list)
                    else (refetched[0] if refetched else None)
                )

            if after:
                still_imgelem = after.buttons and any(
                    hasattr(b, "data") and b"imgelem" in (b.data or b"")
                    for row in after.buttons
                    for b in row
                    if hasattr(b, "data")
                )
                log(
                    "TC4",
                    "PASS" if not still_imgelem else "FAIL",
                    f"After skip: {(after.text or '')[:60]!r}",
                )
            else:
                log("TC4", "FAIL", "No response after Lewati")
        else:
            log("TC4", "FAIL", f"No Lewati button in: {btn_texts}")

        # ── TC5: Generate → button ──
        print("\nTC5: Navigating again for Generate → test...")
        nav_msg2, _ = await navigate_to_imgref_upload(client, bot)
        if nav_msg2:
            last_id2 = nav_msg2.id
            await client.send_file(bot, TEST_IMAGE)
            print(f"  Waiting up to 30s for element keyboard...")

            received2 = []
            seen2 = set()
            deadline2 = time.time() + 30
            while time.time() < deadline2:
                await asyncio.sleep(2)
                msgs2 = await get_recent(client, bot, limit=8)
                for m in msgs2:
                    if m.id > last_id2 and m.id not in seen2:
                        seen2.add(m.id)
                        received2.append(m)

            kb2 = next((m for m in reversed(received2) if m.buttons), None)
            if kb2:
                gen_btn = await click_btn(kb2, "generate", "✨", wait=6)
                if gen_btn:
                    after2 = await wait_for_new_msg(client, bot, kb2.id, timeout=10)
                    if not after2:
                        refetched2 = await client.get_messages(bot, ids=kb2.id)
                        after2 = (
                            refetched2
                            if not isinstance(refetched2, list)
                            else (refetched2[0] if refetched2 else None)
                        )
                    if after2:
                        still_kb = after2.buttons and any(
                            hasattr(b, "data") and b"imgelem" in (b.data or b"")
                            for row in after2.buttons
                            for b in row
                            if hasattr(b, "data")
                        )
                        log(
                            "TC5",
                            "PASS" if not still_kb else "FAIL",
                            f"After Generate: {(after2.text or '')[:60]!r}",
                        )
                    else:
                        log("TC5", "FAIL", "No response after Generate click")
                else:
                    log(
                        "TC5",
                        "FAIL",
                        f"No Generate button in: {[b.text for row in kb2.buttons for b in row]}",
                    )
            else:
                log("TC5", "FAIL", "No keyboard on second upload")
        else:
            log("TC5", "FAIL", "Navigation failed for second upload")
    else:
        msg_texts = [(m.text or "")[:60] for m in received]
        for tc in ["TC2", "TC3", "TC4", "TC5"]:
            log(tc, "FAIL", f"No keyboard received. Messages: {msg_texts}")

    await client.disconnect()

    # Summary
    print(f"\n{'='*60}")
    passed = sum(1 for r in RESULTS if r["status"] == "PASS")
    total = len(RESULTS)
    for r in RESULTS:
        icon = "✅" if r["status"] == "PASS" else "❌"
        print(f"  {icon} {r['tc']}: {r['detail']}")
    print(f"\n{passed}/{total} passed")

    out = "/mnt/data/openclaw/projects/openclaw-saas-bot/tests/e2e_element_selection_results.json"
    with open(out, "w") as f:
        json.dump(
            {
                "passed": passed,
                "total": total,
                "results": RESULTS,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
            f,
            indent=2,
        )
    print(f"Results: {out}")
    return passed == total


if __name__ == "__main__":
    ok = asyncio.run(main())
    sys.exit(0 if ok else 1)
