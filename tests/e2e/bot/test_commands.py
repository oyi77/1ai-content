"""
Tests for all top-level bot commands.

Each test sends one command and verifies the bot returns a substantive
response.  Tests are deliberately coarse-grained at this level — deeper
flow assertions live in the flow-specific test files.
"""

import pytest
from conftest import send_and_wait, _has_button, _is_error_text

# ─── /start ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_start_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/start")
    assert msg is not None, "/start produced no bot response"


@pytest.mark.asyncio
async def test_start_contains_welcome_text(client, bot):
    msg = await send_and_wait(client, bot, "/start")
    assert msg is not None
    text = (msg.text or "").lower()
    has_welcome = any(
        w in text
        for w in ("halo", "selamat", "welcome", "hello", "menu", "kredit", "credit")
    )
    assert has_welcome, f"/start text did not contain any welcome keyword: {text[:120]}"


@pytest.mark.asyncio
async def test_start_has_inline_keyboard(client, bot):
    msg = await send_and_wait(client, bot, "/start", need_buttons=True)
    assert msg is not None, "/start produced no response with inline keyboard"
    assert msg.reply_markup is not None, "/start message has no reply_markup"


@pytest.mark.asyncio
async def test_start_response_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/start")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/start returned an error: {(msg.text or '')[:120]}"


# ─── /menu ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_menu_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/menu")
    assert msg is not None, "/menu produced no bot response"


@pytest.mark.asyncio
async def test_menu_has_inline_keyboard(client, bot):
    msg = await send_and_wait(client, bot, "/menu", need_buttons=True)
    assert msg is not None, "/menu produced no response with inline keyboard"


@pytest.mark.asyncio
async def test_menu_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/menu")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/menu returned an error: {(msg.text or '')[:120]}"


# ─── /create ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/create")
    assert msg is not None, "/create produced no bot response"


@pytest.mark.asyncio
async def test_create_has_mode_buttons(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None, "/create produced no response with buttons"
    has_any_mode = (
        _has_button(msg, callback_data="mode_basic")
        or _has_button(msg, callback_data="mode_smart")
        or _has_button(msg, callback_data="mode_pro")
    )
    assert (
        has_any_mode
    ), "/create did not show any mode selection button (mode_basic/mode_smart/mode_pro)"


@pytest.mark.asyncio
async def test_create_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/create")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/create returned an error: {(msg.text or '')[:120]}"


# ─── /prompts ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_prompts_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/prompts")
    assert msg is not None, "/prompts produced no bot response"


@pytest.mark.asyncio
async def test_prompts_has_niche_buttons(client, bot):
    msg = await send_and_wait(client, bot, "/prompts", need_buttons=True)
    assert msg is not None, "/prompts produced no response with buttons"
    from conftest import _get_button_callbacks

    cbs = _get_button_callbacks(msg)
    niche_cbs = [c for c in cbs if c.startswith("prompts_")]
    assert len(niche_cbs) > 0, f"/prompts showed no prompts_* buttons; got: {cbs}"


@pytest.mark.asyncio
async def test_prompts_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/prompts")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/prompts returned an error: {(msg.text or '')[:120]}"


# ─── /topup ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_topup_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/topup")
    assert msg is not None, "/topup produced no bot response"


@pytest.mark.asyncio
async def test_topup_contains_pricing_keywords(client, bot):
    msg = await send_and_wait(client, bot, "/topup")
    assert msg is not None
    text = (msg.text or "").lower()
    has_pricing = any(
        w in text
        for w in (
            "credit",
            "kredit",
            "rp ",
            "idr",
            "harga",
            "price",
            "topup",
            "top up",
            "balance",
            "saldo",
        )
    )
    assert (
        has_pricing
    ), f"/topup response did not contain pricing keywords: {text[:120]}"


@pytest.mark.asyncio
async def test_topup_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/topup")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/topup returned an error: {(msg.text or '')[:120]}"


# ─── /profile ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_profile_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/profile")
    assert msg is not None, "/profile produced no bot response"


@pytest.mark.asyncio
async def test_profile_contains_account_info(client, bot):
    msg = await send_and_wait(client, bot, "/profile")
    assert msg is not None
    text = (msg.text or "").lower()
    has_info = any(
        w in text
        for w in (
            "profile",
            "profil",
            "account",
            "akun",
            "balance",
            "saldo",
            "credit",
            "kredit",
        )
    )
    assert has_info, f"/profile response did not contain account keywords: {text[:120]}"


@pytest.mark.asyncio
async def test_profile_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/profile")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/profile returned an error: {(msg.text or '')[:120]}"


# ─── /referral ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_referral_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/referral")
    assert msg is not None, "/referral produced no bot response"


@pytest.mark.asyncio
async def test_referral_contains_referral_keywords(client, bot):
    msg = await send_and_wait(client, bot, "/referral")
    assert msg is not None
    text = (msg.text or "").lower()
    has_ref = any(
        w in text
        for w in ("referral", "refer", "komisi", "commission", "invite", "undang")
    )
    assert (
        has_ref
    ), f"/referral response did not contain referral keywords: {text[:120]}"


@pytest.mark.asyncio
async def test_referral_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/referral")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/referral returned an error: {(msg.text or '')[:120]}"


# ─── /videos ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_videos_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/videos")
    assert msg is not None, "/videos produced no bot response"


@pytest.mark.asyncio
async def test_videos_contains_video_keywords(client, bot):
    msg = await send_and_wait(client, bot, "/videos")
    assert msg is not None
    text = (msg.text or "").lower()
    has_vids = any(
        w in text for w in ("video", "daftar", "list", "history", "riwayat", "belum")
    )
    assert has_vids, f"/videos response did not contain video keywords: {text[:120]}"


@pytest.mark.asyncio
async def test_videos_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/videos")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/videos returned an error: {(msg.text or '')[:120]}"


# ─── /settings ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_settings_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/settings")
    assert msg is not None, "/settings produced no bot response"


@pytest.mark.asyncio
async def test_settings_has_inline_keyboard(client, bot):
    msg = await send_and_wait(client, bot, "/settings", need_buttons=True)
    assert msg is not None, "/settings produced no response with inline keyboard"


@pytest.mark.asyncio
async def test_settings_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/settings")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/settings returned an error: {(msg.text or '')[:120]}"


# ─── /subscription ───────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_subscription_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/subscription")
    assert msg is not None, "/subscription produced no bot response"


@pytest.mark.asyncio
async def test_subscription_contains_plan_keywords(client, bot):
    msg = await send_and_wait(client, bot, "/subscription")
    assert msg is not None
    text = (msg.text or "").lower()
    has_plan = any(w in text for w in ("subscription", "langganan", "plan", "paket"))
    assert (
        has_plan
    ), f"/subscription response did not contain plan keywords: {text[:120]}"


@pytest.mark.asyncio
async def test_subscription_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/subscription")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/subscription returned an error: {(msg.text or '')[:120]}"


# ─── /support ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_support_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/support")
    assert msg is not None, "/support produced no bot response"


@pytest.mark.asyncio
async def test_support_contains_contact_info(client, bot):
    msg = await send_and_wait(client, bot, "/support")
    assert msg is not None
    text = (msg.text or "").lower()
    has_contact = any(
        w in text for w in ("support", "bantuan", "help", "contact", "kontak", "@")
    )
    assert (
        has_contact
    ), f"/support response did not contain contact keywords: {text[:120]}"


@pytest.mark.asyncio
async def test_support_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/support")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/support returned an error: {(msg.text or '')[:120]}"


# ─── /help ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_help_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/help")
    assert msg is not None, "/help produced no bot response"


@pytest.mark.asyncio
async def test_help_contains_help_keywords(client, bot):
    msg = await send_and_wait(client, bot, "/help")
    assert msg is not None
    text = (msg.text or "").lower()
    has_help = any(
        w in text for w in ("help", "bantuan", "command", "perintah", "panduan", "cara")
    )
    assert has_help, f"/help response did not contain help keywords: {text[:120]}"


@pytest.mark.asyncio
async def test_help_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/help")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/help returned an error: {(msg.text or '')[:120]}"


# ─── /social ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_social_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/social")
    assert msg is not None, "/social produced no bot response"


@pytest.mark.asyncio
async def test_social_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/social")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/social returned an error: {(msg.text or '')[:120]}"


# ─── /daily ──────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_daily_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/daily")
    assert msg is not None, "/daily produced no bot response"


@pytest.mark.asyncio
async def test_daily_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/daily")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/daily returned an error: {(msg.text or '')[:120]}"


# ─── /trending ───────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_trending_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/trending")
    assert msg is not None, "/trending produced no bot response"


@pytest.mark.asyncio
async def test_trending_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/trending")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/trending returned an error: {(msg.text or '')[:120]}"


# ─── /cancel ─────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cancel_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/cancel")
    assert msg is not None, "/cancel produced no bot response"


@pytest.mark.asyncio
async def test_cancel_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/cancel")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/cancel returned an error: {(msg.text or '')[:120]}"


# ─── reply keyboard buttons ──────────────────────────────────────────────────

_KEYBOARD_BUTTONS = [
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


@pytest.mark.asyncio
@pytest.mark.parametrize("btn_text", _KEYBOARD_BUTTONS)
async def test_reply_keyboard_button_returns_response(client, bot, btn_text):
    """Each reply keyboard shortcut must produce a non-error bot response."""
    msg = await send_and_wait(client, bot, btn_text)
    assert (
        msg is not None
    ), f"Reply keyboard button '{btn_text}' produced no bot response"
    assert not _is_error_text(
        msg.text
    ), f"Reply keyboard button '{btn_text}' returned an error: {(msg.text or '')[:120]}"
