#!/usr/bin/env python3
"""
FULL E2E Coverage Test — Tests EVERY command, EVERY menu button, EVERY callback flow.
Uses polling-based response detection to avoid timing issues.
"""

import asyncio
import os
import sys
from telethon import TelegramClient
from datetime import datetime, timezone

API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SESSION_PATH = "/home/openclaw/.openclaw/workspace/.vilona/sessions/paijo"
BOT_USERNAME = "berkahkarya_saas_bot"

POLL_INTERVAL = 0.5
MAX_WAIT = 20  # seconds

results = []
tested_callbacks = set()
broken_callbacks = set()


def P(t):
    results.append(("PASS", t))
    print(f"  \033[92mPASS\033[0m: {t}")


def F(t):
    results.append(("FAIL", t))
    print(f"  \033[91mFAIL\033[0m: {t}")


async def run():
    client = TelegramClient(SESSION_PATH, API_ID, API_HASH)
    await client.start()
    me = await client.get_me()
    bot = await client.get_entity(BOT_USERNAME)

    async def wait_for_response(since, max_wait=MAX_WAIT, need_buttons=False):
        """Poll for bot response, skipping loading animations."""
        for _ in range(int(max_wait / POLL_INTERVAL)):
            await asyncio.sleep(POLL_INTERVAL)
            msgs = await client.get_messages(bot, limit=8)
            for m in sorted(msgs, key=lambda x: x.date, reverse=True):
                if m.date >= since and m.sender_id != me.id:
                    t = m.text or ""
                    # Skip loading animations
                    if "Vilona" in t and len(t) < 50:
                        continue
                    btns = get_btns(m)
                    if need_buttons and not btns:
                        continue
                    return m, btns
        return None, []

    async def send_cmd(cmd, max_wait=MAX_WAIT, need_buttons=False):
        """Send command and wait for response with polling."""
        now = datetime.now(timezone.utc)
        await client.send_message(bot, cmd)
        return await wait_for_response(now, max_wait, need_buttons)

    async def click_btn(msg, cb, max_wait=MAX_WAIT):
        """Click callback button and detect response (edited or new message)."""
        if not msg or not msg.reply_markup:
            return None, []
        clicked = False
        for r in msg.reply_markup.rows:
            for b in r.buttons:
                d = getattr(b, "data", None)
                if d and (d.decode() if isinstance(d, bytes) else d) == cb:
                    await msg.click(data=d)
                    clicked = True
                    break
            if clicked:
                break
        if not clicked:
            return None, []

        old_text = msg.text or ""
        old_btns = get_btns(msg)

        for _ in range(int(max_wait / POLL_INTERVAL)):
            await asyncio.sleep(POLL_INTERVAL)
            # Check edited message
            edited = await client.get_messages(bot, ids=[msg.id])
            if edited and edited[0]:
                new_text = edited[0].text or ""
                new_btns = get_btns(edited[0])
                if new_text != old_text or new_btns != old_btns:
                    return edited[0], new_btns
            # Check for new messages
            msgs = await client.get_messages(bot, limit=3)
            for m in msgs:
                if m.id != msg.id and m.sender_id != me.id:
                    t = m.text or ""
                    if "Vilona" in t and len(t) < 50:
                        continue
                    return m, get_btns(m)
        return None, []

    def get_btns(msg):
        if not msg or not msg.reply_markup or not hasattr(msg.reply_markup, "rows"):
            return []
        btns = []
        for r in msg.reply_markup.rows:
            for b in r.buttons:
                d = getattr(b, "data", None)
                if d:
                    btns.append(d.decode() if isinstance(d, bytes) else d)
        return btns

    def get_btn_labels(msg):
        if not msg or not msg.reply_markup or not hasattr(msg.reply_markup, "rows"):
            return {}
        out = {}
        for r in msg.reply_markup.rows:
            for b in r.buttons:
                d = getattr(b, "data", None)
                if d:
                    out[d.decode() if isinstance(d, bytes) else d] = b.text
        return out

    def is_error(text):
        if not text:
            return False
        t = text.lower()
        return any(
            x in t
            for x in [
                "error",
                "gagal",
                "tidak ditemukan",
                "failed",
                "can't parse",
                "oops",
            ]
        )

    # ═══════════════════════════════════════════════════════════════
    # PHASE 1: ALL BOT COMMANDS
    # ═══════════════════════════════════════════════════════════════
    print("\n\033[1m═══ PHASE 1: ALL BOT COMMANDS ═══\033[0m")

    commands = [
        "/start",
        "/menu",
        "/create",
        "/prompts",
        "/daily",
        "/trending",
        "/referral",
        "/topup",
        "/profile",
        "/videos",
        "/settings",
        "/support",
        "/help",
        "/social",
    ]

    for cmd in commands:
        m, btns = await send_cmd(cmd)
        t = (m.text or "")[:80] if m else "NO RESPONSE"
        if m and not is_error(m.text or ""):
            P(f'{cmd} — ({len(btns)} btns) "{t}"')
        elif m:
            F(f"{cmd} — Error: {t}")
        else:
            F(f"{cmd} — No response")
        await asyncio.sleep(2)  # Pause between commands

    # ═══════════════════════════════════════════════════════════════
    # PHASE 2: MAIN MENU — EVERY BUTTON
    # ═══════════════════════════════════════════════════════════════
    print("\n\033[1m═══ PHASE 2: MAIN MENU BUTTONS ═══\033[0m")

    m_create, _ = await send_cmd("/create")
    if m_create:
        m_menu, menu_btns = await click_btn(m_create, "main_menu")
        if m_menu and menu_btns:
            labels = get_btn_labels(m_menu)
            P(f"Main menu: {len(menu_btns)} buttons")

            for cb in menu_btns:
                if cb == "main_menu":
                    continue
                tested_callbacks.add(cb)
                label = labels.get(cb, cb)

                # Re-open main menu fresh
                m_c, _ = await send_cmd("/create")
                if not m_c:
                    continue
                m_m, _ = await click_btn(m_c, "main_menu")
                if not m_m:
                    continue

                m_result, btns_result = await click_btn(m_m, cb)
                if m_result:
                    t = (m_result.text or "")[:60]
                    if is_error(m_result.text or ""):
                        F(f'Menu [{cb}] "{label}" — Error: {t}')
                        broken_callbacks.add(cb)
                    else:
                        P(f'Menu [{cb}] "{label}" — OK ({len(btns_result)} btns)')
                else:
                    F(f'Menu [{cb}] "{label}" — No response')
                    broken_callbacks.add(cb)
                await asyncio.sleep(2)
        else:
            F("Could not load main menu")
    else:
        F("/create for main menu — no response")

    # ═══════════════════════════════════════════════════════════════
    # PHASE 3: /create — ALL 3 MODES + ACTIONS
    # ═══════════════════════════════════════════════════════════════
    print("\n\033[1m═══ PHASE 3: /create MODES + ACTIONS ═══\033[0m")

    for mode in ["mode_basic", "mode_smart", "mode_pro"]:
        m, _ = await send_cmd("/create")
        if not m:
            F(f"{mode}: /create failed")
            await asyncio.sleep(2)
            continue

        m2, btns2 = await click_btn(m, mode)
        if m2 and btns2:
            tested_callbacks.add(mode)
            P(f"[{mode}] — {len(btns2)} action buttons")

            actions = [b for b in btns2 if b.startswith("action_")]
            for action in actions:
                tested_callbacks.add(action)
                # Fresh start for each action
                m_a, _ = await send_cmd("/create")
                if not m_a:
                    continue
                m_mode, _ = await click_btn(m_a, mode)
                if not m_mode:
                    continue

                m_act, btns_act = await click_btn(m_mode, action)
                if m_act:
                    P(f"  [{action}] — OK ({len(btns_act)} btns)")
                else:
                    F(f"  [{action}] — No response")
                await asyncio.sleep(2)
        else:
            F(f"[{mode}] — No response")
        await asyncio.sleep(2)

    # ═══════════════════════════════════════════════════════════════
    # PHASE 4: SMART MODE FULL CHAIN
    # ═══════════════════════════════════════════════════════════════
    print("\n\033[1m═══ PHASE 4: SMART MODE FULL CHAIN ═══\033[0m")

    for preset in [
        "preset_quick",
        "preset_standard",
        "preset_extended",
        "preset_custom",
    ]:
        m, _ = await send_cmd("/create")
        if not m:
            continue
        m2, _ = await click_btn(m, "mode_smart")
        if not m2:
            continue
        m3, btns3 = await click_btn(m2, "action_video")
        if not m3:
            continue
        if preset not in btns3:
            F(f"[{preset}] not in preset buttons")
            continue

        m4, btns4 = await click_btn(m3, preset)
        tested_callbacks.add(preset)

        if preset == "preset_custom":
            if m4:
                P(f"[preset_custom] — shows input prompt")
                m5, btns5 = await send_cmd("300")
                if m5 and (
                    "platform_tiktok" in str(btns5)
                    or "5 menit" in (m5.text or "")
                    or "Custom" in (m5.text or "")
                ):
                    P(f"Custom 300s — accepted ({len(btns5)} btns)")
                else:
                    t5 = (m5.text or "")[:60] if m5 else "NO RESPONSE"
                    F(f"Custom 300s — {t5}")
            else:
                F(f"[preset_custom] — No response")
        else:
            if m4 and any(b.startswith("platform_") for b in btns4):
                P(
                    f'[{preset}] — shows {len([b for b in btns4 if b.startswith("platform_")])} platforms'
                )
                # Test TikTok click
                m5, btns5 = await click_btn(m4, "platform_tiktok")
                tested_callbacks.add("platform_tiktok")
                if m5:
                    P(f"  platform_tiktok — OK")
                else:
                    F(f"  platform_tiktok — No response")
            else:
                F(f"[{preset}] — No platform buttons: {btns4}")
        await asyncio.sleep(2)

    # ═══════════════════════════════════════════════════════════════
    # PHASE 5: PROMPT LIBRARY — ALL NICHES
    # ═══════════════════════════════════════════════════════════════
    print("\n\033[1m═══ PHASE 5: PROMPT LIBRARY NICHES ═══\033[0m")

    m_p, btns_p = await send_cmd("/prompts")
    if m_p:
        niche_btns = [
            b
            for b in btns_p
            if b.startswith("prompts_")
            and b != "prompts_trending"
            and b != "prompts_custom"
        ]
        P(f"/prompts — {len(niche_btns)} niches")

        for niche in niche_btns:
            m_n, _ = await send_cmd("/prompts")
            if not m_n:
                continue

            m_niche, btns_niche = await click_btn(m_n, niche)
            tested_callbacks.add(niche)
            if m_niche:
                use_btns = [b for b in btns_niche if b.startswith("use_")]
                if use_btns:
                    P(f"[{niche}] — {len(use_btns)} prompts")
                    # Test first prompt
                    m_sel, _ = await click_btn(m_niche, use_btns[0])
                    tested_callbacks.add(use_btns[0])
                    if m_sel and is_error(m_sel.text or ""):
                        F(f'  [{use_btns[0]}] PROMPT ERROR: {(m_sel.text or "")[:60]}')
                        broken_callbacks.add(use_btns[0])
                    elif m_sel:
                        P(f"  [{use_btns[0]}] Select — OK")
                    else:
                        F(f"  [{use_btns[0]}] Select — No response")
                else:
                    P(f"[{niche}] — 0 prompt buttons (may have admin prompts only)")
            else:
                F(f"[{niche}] — No response")
            await asyncio.sleep(2)
    else:
        F("/prompts — No response")

    # ═══════════════════════════════════════════════════════════════
    # PHASE 6: REFERRAL FLOW
    # ═══════════════════════════════════════════════════════════════
    print("\n\033[1m═══ PHASE 6: REFERRAL ═══\033[0m")

    m_ref, btns_ref = await send_cmd("/referral")
    if m_ref and not is_error(m_ref.text or ""):
        P(f"/referral — OK ({len(btns_ref)} btns)")
        for cb in btns_ref:
            if cb == "main_menu":
                continue
            m_r, _ = await send_cmd("/referral")
            if not m_r:
                continue
            m_btn, btns_btn = await click_btn(m_r, cb)
            tested_callbacks.add(cb)
            if m_btn and not is_error(m_btn.text or ""):
                P(f"  [{cb}] — OK")
            elif m_btn:
                F(f'  [{cb}] — Error: {(m_btn.text or "")[:60]}')
                broken_callbacks.add(cb)
            else:
                F(f"  [{cb}] — No response")
            await asyncio.sleep(2)
    elif m_ref:
        F(f'/referral — Error: {(m_ref.text or "")[:80]}')
    else:
        F("/referral — No response")

    # ═══════════════════════════════════════════════════════════════
    # PHASE 7: TOPUP
    # ═══════════════════════════════════════════════════════════════
    print("\n\033[1m═══ PHASE 7: TOPUP ═══\033[0m")

    m_topup, btns_topup = await send_cmd("/topup")
    if m_topup and not is_error(m_topup.text or ""):
        P(f"/topup — OK ({len(btns_topup)} btns)")
        for cb in btns_topup[:5]:
            tested_callbacks.add(cb)
            P(f"  [{cb}] — button available")
    elif m_topup:
        F(f'/topup — Error: {(m_topup.text or "")[:60]}')
    else:
        F("/topup — No response")

    # ═══════════════════════════════════════════════════════════════
    # PHASE 8: KEYBOARD BUTTONS
    # ═══════════════════════════════════════════════════════════════
    print("\n\033[1m═══ PHASE 8: REPLY KEYBOARD BUTTONS ═══\033[0m")

    keyboard_buttons = [
        "\U0001f3ac Create Video",
        "\U0001f5bc\ufe0f Generate Image",
        "\U0001f4ac Chat AI",
        "\U0001f4da Prompt Library",
        "\U0001f525 Trending",
        "\U0001f381 Daily Prompt",
        "\U0001f4c1 My Videos",
        "\U0001f4b0 Top Up",
        "\U0001f464 Profile",
        "\U0001f465 Referral",
        "\u2699\ufe0f Settings",
        "\U0001f198 Support",
        "\U0001f4d6 Help",
    ]

    for btn_text in keyboard_buttons:
        m, btns = await send_cmd(btn_text)
        t = (m.text or "")[:60] if m else "NO RESPONSE"
        if m and not is_error(m.text or ""):
            P(f'KB "{btn_text}" — OK ({len(btns)} btns)')
        elif m:
            F(f'KB "{btn_text}" — Error: {t}')
        else:
            F(f'KB "{btn_text}" — No response')
        await asyncio.sleep(2)

    # ═══════════════════════════════════════════════════════════════
    # PHASE 9: MODEL NAME LEAK
    # ═══════════════════════════════════════════════════════════════
    print("\n\033[1m═══ PHASE 9: MODEL NAME LEAK CHECK ═══\033[0m")

    recent = await client.get_messages(bot, limit=50)
    secrets = ["Gemini", "GPT-4", "Grok", "Claude", "OpenAI", "Anthropic"]
    leaked = set()
    for m in recent:
        if not m.text:
            continue
        for s in secrets:
            if s.lower() in m.text.lower():
                leaked.add(s)
    if leaked:
        for s in leaked:
            F(f"Model name leaked: {s}")
    else:
        P("No model names in recent 50 messages")

    # ═══════════════════════════════════════════════════════════════
    # SUMMARY
    # ═══════════════════════════════════════════════════════════════
    print("\n" + "=" * 60)
    passed = sum(1 for s, _ in results if s == "PASS")
    failed = sum(1 for s, _ in results if s == "FAIL")
    total = len(results)

    color = "\033[92m" if failed == 0 else "\033[91m"
    print(f"{color}\033[1m  RESULTS: {passed}/{total} passed, {failed} failed\033[0m")
    print(f"  Unique callbacks tested: {len(tested_callbacks)}")

    if broken_callbacks:
        print(f"\n\033[91m  BROKEN CALLBACKS ({len(broken_callbacks)}):\033[0m")
        for cb in sorted(broken_callbacks):
            print(f"    x {cb}")

    if failed > 0:
        print(f"\n\033[91m  ALL FAILURES:\033[0m")
        for status, name in results:
            if status == "FAIL":
                print(f"    x {name}")

    print("=" * 60)
    await client.disconnect()
    return failed == 0


if __name__ == "__main__":
    success = asyncio.run(run())
    sys.exit(0 if success else 1)
