#!/usr/bin/env python3
"""
E2E Flow Verification — Tests all critical bot flows via Telethon.
Verifies: main menu, prompt library, V3 generate flow, Smart mode, admin/saved prompts.
"""

import asyncio
import sys
from telethon import TelegramClient
from telethon.tl.custom import Message
from datetime import datetime

API_ID = 23913448
API_HASH = "78d168f985edf365a5cd9679a917a0b2"
SESSION_PATH = "/home/openclaw/.openclaw/workspace/.vilona/sessions/paijo"
BOT_USERNAME = "berkahkarya_saas_bot"

TIMEOUT = 15  # seconds to wait for bot response


class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    BLUE = "\033[94m"
    YELLOW = "\033[93m"
    END = "\033[0m"
    BOLD = "\033[1m"


results = []


def log(msg, color=Colors.END):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"{color}[{ts}] {msg}{Colors.END}")


def ok(test_name, detail=""):
    log(f"PASS: {test_name} {detail}", Colors.GREEN)
    results.append(("PASS", test_name))


def fail(test_name, detail=""):
    log(f"FAIL: {test_name} {detail}", Colors.RED)
    results.append(("FAIL", test_name))


def info(msg):
    log(f"  -> {msg}", Colors.BLUE)


async def wait_response(client, bot_entity, after_date, timeout=TIMEOUT):
    """Wait for the next bot message after a given timestamp."""
    for _ in range(timeout * 2):
        await asyncio.sleep(0.5)
        msgs = await client.get_messages(bot_entity, limit=3)
        for m in msgs:
            if (
                m.date.replace(tzinfo=None) >= after_date
                and m.sender_id != (await client.get_me()).id
            ):
                return m
    return None


async def wait_response_with_buttons(client, bot_entity, after_date, timeout=TIMEOUT):
    """Wait for a bot message that has inline buttons."""
    for _ in range(timeout * 2):
        await asyncio.sleep(0.5)
        msgs = await client.get_messages(bot_entity, limit=5)
        for m in msgs:
            if (
                m.date.replace(tzinfo=None) >= after_date
                and m.sender_id != (await client.get_me()).id
            ):
                if m.reply_markup and hasattr(m.reply_markup, "rows"):
                    return m
    return None


def get_buttons(msg):
    """Extract inline button data from a message."""
    if not msg or not msg.reply_markup or not hasattr(msg.reply_markup, "rows"):
        return []
    buttons = []
    for row in msg.reply_markup.rows:
        for btn in row.buttons:
            data = getattr(btn, "data", None)
            if data:
                buttons.append(
                    {
                        "text": btn.text,
                        "data": (
                            data.decode("utf-8")
                            if isinstance(data, bytes)
                            else str(data)
                        ),
                    }
                )
            elif hasattr(btn, "url") and btn.url:
                buttons.append({"text": btn.text, "url": btn.url})
    return buttons


def find_button(buttons, callback_data=None, text_contains=None):
    """Find a button by callback_data or text."""
    for b in buttons:
        if callback_data and b.get("data") == callback_data:
            return b
        if text_contains and text_contains.lower() in b["text"].lower():
            return b
    return None


async def click_button(msg, callback_data):
    """Click an inline button by callback_data."""
    if not msg or not msg.reply_markup:
        return False
    for row in msg.reply_markup.rows:
        for btn in row.buttons:
            data = getattr(btn, "data", None)
            if data:
                d = data.decode("utf-8") if isinstance(data, bytes) else str(data)
                if d == callback_data:
                    await msg.click(data=data)
                    return True
    return False


async def run_tests():
    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
    await client.start()
    me = await client.get_me()
    bot = await client.get_entity(BOT_USERNAME)

    log(f"Connected as: {me.first_name} (ID: {me.id})", Colors.BOLD)
    log(f"Testing bot: @{BOT_USERNAME}\n", Colors.BOLD)

    # ═══════════════════════════════════════════════════════════════════════
    # TEST 1: /start command
    # ═══════════════════════════════════════════════════════════════════════
    log("TEST 1: /start command", Colors.YELLOW)
    now = datetime.utcnow()
    await client.send_message(bot, "/start")
    resp = await wait_response(client, bot, now)
    if resp and resp.text:
        info(f"Response: {resp.text[:100]}...")
        if "Halo" in resp.text or "Selamat" in resp.text or "menu" in resp.text.lower():
            ok("/start responds")
        else:
            fail("/start responds", f"Unexpected: {resp.text[:80]}")
    else:
        fail("/start responds", "No response")

    await asyncio.sleep(2)

    # ═══════════════════════════════════════════════════════════════════════
    # TEST 2: Main Menu via main_menu callback
    # ═══════════════════════════════════════════════════════════════════════
    log("\nTEST 2: Main Menu layout", Colors.YELLOW)
    now = datetime.utcnow()
    # Send /start to get a message with buttons, then find main_menu or use it directly
    await client.send_message(bot, "/menu")
    resp = await wait_response_with_buttons(client, bot, now)

    if resp:
        btns = get_buttons(resp)
        btn_texts = [b["text"] for b in btns]
        btn_datas = [b.get("data", "") for b in btns]
        info(f"Buttons found: {len(btns)}")
        for b in btns:
            info(f"  [{b['text']}] -> {b.get('data', b.get('url', '?'))}")

        # Check required main menu buttons
        required = {
            "back_prompts": "Pilih Prompt",
            "create_video_new": "Buat Video",
            "topup": "Top Up",
            "videos_list": "Video Saya",
        }
        for cb, label in required.items():
            if find_button(btns, callback_data=cb):
                ok(f"Main menu has '{label}' button")
            else:
                fail(f"Main menu has '{label}' button", f"Missing callback_data={cb}")

        # Check NO model names visible
        full_text = resp.text + " ".join(btn_texts)
        for secret in [
            "Gemini",
            "GPT",
            "Grok",
            "Claude",
            "OpenAI",
            "Anthropic",
            "OmniRoute",
        ]:
            if secret.lower() in full_text.lower():
                fail(f"No model name leak: {secret}", f"Found in menu text!")
            else:
                ok(f"No model name leak: {secret}")
    else:
        fail("Main menu responds with buttons", "No button response")

    await asyncio.sleep(2)

    # ═══════════════════════════════════════════════════════════════════════
    # TEST 3: Prompt Library flow (back_prompts)
    # ═══════════════════════════════════════════════════════════════════════
    log("\nTEST 3: Prompt Library (back_prompts)", Colors.YELLOW)
    if resp:
        now = datetime.utcnow()
        clicked = await click_button(resp, "back_prompts")
        if clicked:
            info("Clicked 'Pilih Prompt & Buat Video'")
            await asyncio.sleep(3)
            resp2 = await wait_response_with_buttons(client, bot, now)
            if resp2:
                btns2 = get_buttons(resp2)
                info(f"Response: {resp2.text[:100]}...")
                info(f"Buttons: {len(btns2)}")
                if any(
                    "niche" in str(b.get("data", "")).lower()
                    or "prompts_" in str(b.get("data", ""))
                    for b in btns2
                ):
                    ok("Prompt library shows niche selection")
                elif (
                    "Prompt" in resp2.text
                    or "niche" in resp2.text.lower()
                    or "Library" in resp2.text
                ):
                    ok("Prompt library shows content")
                else:
                    fail(
                        "Prompt library shows niche selection",
                        f"Text: {resp2.text[:100]}",
                    )
            else:
                fail("Prompt library responds", "No response after click")
        else:
            fail("Click back_prompts", "Button not found")

    await asyncio.sleep(2)

    # ═══════════════════════════════════════════════════════════════════════
    # TEST 4: V3 Generate flow (/create)
    # ═══════════════════════════════════════════════════════════════════════
    log("\nTEST 4: V3 Generate flow (/create)", Colors.YELLOW)
    now = datetime.utcnow()
    await client.send_message(bot, "/create")
    resp3 = await wait_response_with_buttons(client, bot, now)
    if resp3:
        btns3 = get_buttons(resp3)
        info(f"Response: {resp3.text[:100]}...")

        # Should show Basic/Smart/Pro mode selection
        has_basic = find_button(btns3, callback_data="mode_basic")
        has_smart = find_button(btns3, callback_data="mode_smart")
        has_pro = find_button(btns3, callback_data="mode_pro")
        has_menu = find_button(btns3, callback_data="main_menu")

        if has_basic:
            ok("/create shows Basic mode")
        else:
            fail("/create shows Basic mode")
        if has_smart:
            ok("/create shows Smart mode")
        else:
            fail("/create shows Smart mode")
        if has_pro:
            ok("/create shows Pro mode")
        else:
            fail("/create shows Pro mode")
        if has_menu:
            ok("/create has Menu Utama button")
        else:
            fail("/create has Menu Utama button")

        # TEST 4b: Click Smart mode -> should show action selection
        if has_smart:
            now = datetime.utcnow()
            await click_button(resp3, "mode_smart")
            info("Clicked Smart mode")
            await asyncio.sleep(3)
            resp4 = await wait_response_with_buttons(client, bot, now)
            if resp4:
                btns4 = get_buttons(resp4)
                has_video = find_button(btns4, callback_data="action_video")
                has_image_set = find_button(btns4, callback_data="action_image_set")
                if has_video:
                    ok("Smart mode shows Video action")
                else:
                    fail(
                        "Smart mode shows Video action",
                        f"Buttons: {[b.get('data') for b in btns4]}",
                    )

                # TEST 4c: Click Video -> should show preset selection (duration)
                if has_video:
                    now = datetime.utcnow()
                    await click_button(resp4, "action_video")
                    info("Clicked Video action")
                    await asyncio.sleep(3)
                    resp5 = await wait_response_with_buttons(client, bot, now)
                    if resp5:
                        btns5 = get_buttons(resp5)
                        has_preset = find_button(
                            btns5, callback_data="preset_quick"
                        ) or find_button(btns5, callback_data="preset_standard")
                        if has_preset:
                            ok("Smart Video shows duration presets (preset_*)")
                        else:
                            fail(
                                "Smart Video shows duration presets",
                                f"Buttons: {[b.get('data') for b in btns5]}",
                            )

                        # TEST 4d: Click preset -> should show platform selection
                        preset_btn = find_button(btns5, callback_data="preset_standard")
                        if preset_btn:
                            now = datetime.utcnow()
                            await click_button(resp5, "preset_standard")
                            info("Clicked Standard preset")
                            await asyncio.sleep(3)
                            resp6 = await wait_response_with_buttons(client, bot, now)
                            if resp6:
                                btns6 = get_buttons(resp6)
                                has_platform = find_button(
                                    btns6, callback_data="platform_tiktok"
                                )
                                if has_platform:
                                    ok("Preset shows platform selection (platform_*)")
                                else:
                                    fail(
                                        "Preset shows platform selection",
                                        f"Buttons: {[b.get('data') for b in btns6]}",
                                    )
                            else:
                                fail("Preset responds", "No response")
                    else:
                        fail("Video action responds", "No response")
            else:
                fail("Smart mode responds", "No response")
    else:
        fail("/create responds with buttons", "No response")

    await asyncio.sleep(2)

    # ═══════════════════════════════════════════════════════════════════════
    # TEST 5: Keyboard button "Create Video"
    # ═══════════════════════════════════════════════════════════════════════
    log("\nTEST 5: Reply keyboard button", Colors.YELLOW)
    now = datetime.utcnow()
    await client.send_message(bot, "\U0001f3ac Create Video")  # 🎬
    resp7 = await wait_response_with_buttons(client, bot, now)
    if resp7:
        btns7 = get_buttons(resp7)
        has_mode = find_button(btns7, callback_data="mode_basic") or find_button(
            btns7, callback_data="mode_smart"
        )
        if has_mode:
            ok("Keyboard '🎬 Create Video' -> V3 mode selection")
        else:
            info(f"Response: {resp7.text[:100]}...")
            fail(
                "Keyboard '🎬 Create Video' -> V3 mode selection",
                f"Got buttons: {[b.get('data') for b in btns7]}",
            )
    else:
        fail("Keyboard button responds", "No response")

    await asyncio.sleep(2)

    # ═══════════════════════════════════════════════════════════════════════
    # TEST 6: /prompts command
    # ═══════════════════════════════════════════════════════════════════════
    log("\nTEST 6: /prompts command", Colors.YELLOW)
    now = datetime.utcnow()
    await client.send_message(bot, "/prompts")
    resp8 = await wait_response_with_buttons(client, bot, now)
    if resp8:
        btns8 = get_buttons(resp8)
        has_fnb = find_button(btns8, text_contains="F&B") or find_button(
            btns8, callback_data="prompts_fnb"
        )
        if has_fnb:
            ok("/prompts shows niche categories")
        else:
            fail(
                "/prompts shows niche categories",
                f"Buttons: {[b['text'] for b in btns8[:5]]}",
            )

        # Click F&B niche
        fnb_btn = find_button(btns8, callback_data="prompts_fnb")
        if fnb_btn:
            now = datetime.utcnow()
            await click_button(resp8, "prompts_fnb")
            info("Clicked F&B niche")
            await asyncio.sleep(3)
            resp9 = await wait_response_with_buttons(client, bot, now)
            if resp9:
                btns9 = get_buttons(resp9)
                use_prompt_btns = [
                    b
                    for b in btns9
                    if b.get("data", "").startswith("use_prompt_")
                    or b.get("data", "").startswith("use_admin_prompt_")
                ]
                if use_prompt_btns:
                    ok(f"F&B niche shows {len(use_prompt_btns)} prompt buttons")

                    # Click first prompt
                    first_prompt = use_prompt_btns[0]
                    now = datetime.utcnow()
                    await click_button(resp9, first_prompt["data"])
                    info(f"Clicked prompt: {first_prompt['text'][:30]}")
                    await asyncio.sleep(3)
                    resp10 = await wait_response_with_buttons(client, bot, now)
                    if resp10:
                        text10 = resp10.text or ""
                        if "tidak ditemukan" in text10.lower():
                            fail(
                                "Prompt selection works",
                                "GOT 'Prompt Tidak Ditemukan' ERROR!",
                            )
                        else:
                            btns10 = get_buttons(resp10)
                            has_video_cta = find_button(
                                btns10, callback_data="create_video_new"
                            ) or find_button(btns10, text_contains="Video")
                            if has_video_cta:
                                ok("Prompt selected -> shows Video CTA")
                            else:
                                ok(f"Prompt selected -> response OK: {text10[:80]}")
                    else:
                        fail("Prompt click responds", "No response")
                else:
                    fail("F&B shows prompt buttons", f"No use_prompt_ buttons found")
            else:
                fail("F&B niche responds", "No response")
    else:
        fail("/prompts responds", "No response")

    await asyncio.sleep(2)

    # ═══════════════════════════════════════════════════════════════════════
    # TEST 7: Model name leak check in various flows
    # ═══════════════════════════════════════════════════════════════════════
    log("\nTEST 7: Model name leak check across flows", Colors.YELLOW)
    # Collect recent messages and check for leaks
    recent = await client.get_messages(bot, limit=20)
    leaked = set()
    for m in recent:
        if not m.text:
            continue
        for secret in [
            "Gemini",
            "GPT-4",
            "Grok",
            "Claude",
            "Anthropic",
            "OpenAI",
            "Mistral",
            "Llama",
        ]:
            if secret.lower() in m.text.lower():
                leaked.add(
                    f"{secret} in msg ID {m.id}: ...{m.text[max(0,m.text.lower().index(secret.lower())-20):m.text.lower().index(secret.lower())+30]}..."
                )

    if leaked:
        for l in leaked:
            fail(f"Model name leak found", l)
    else:
        ok("No model names leaked in recent 20 messages")

    # ═══════════════════════════════════════════════════════════════════════
    # TEST 8: Main Menu button accessibility from /create flow
    # ═══════════════════════════════════════════════════════════════════════
    log("\nTEST 8: Menu Utama button in sub-flows", Colors.YELLOW)
    now = datetime.utcnow()
    await client.send_message(bot, "/create")
    resp_create = await wait_response_with_buttons(client, bot, now)
    if resp_create:
        btns_c = get_buttons(resp_create)
        menu_btn = find_button(btns_c, callback_data="main_menu")
        if menu_btn:
            ok("Menu Utama button in /create")
            # Click it and verify main menu appears
            now = datetime.utcnow()
            await click_button(resp_create, "main_menu")
            await asyncio.sleep(3)
            resp_menu = await wait_response_with_buttons(client, bot, now)
            if resp_menu:
                btns_menu = get_buttons(resp_menu)
                if find_button(btns_menu, callback_data="back_prompts"):
                    ok("Menu Utama click -> shows full main menu")
                else:
                    fail(
                        "Menu Utama click -> shows main menu",
                        f"Buttons: {[b.get('data') for b in btns_menu[:5]]}",
                    )
            else:
                fail("Menu Utama click responds", "No response")
        else:
            fail("Menu Utama in /create", "Button missing")

    # ═══════════════════════════════════════════════════════════════════════
    # SUMMARY
    # ═══════════════════════════════════════════════════════════════════════
    print("\n" + "=" * 60)
    passed = sum(1 for s, _ in results if s == "PASS")
    failed = sum(1 for s, _ in results if s == "FAIL")
    total = len(results)

    color = Colors.GREEN if failed == 0 else Colors.RED
    print(f"{color}{Colors.BOLD}")
    print(f"  RESULTS: {passed}/{total} passed, {failed} failed")
    print(f"{Colors.END}")

    if failed > 0:
        print(f"\n{Colors.RED}Failed tests:{Colors.END}")
        for status, name in results:
            if status == "FAIL":
                print(f"  {Colors.RED}x {name}{Colors.END}")

    print("=" * 60)

    await client.disconnect()
    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(run_tests())
    sys.exit(0 if success else 1)
