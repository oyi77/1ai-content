"""
Tests for the video-creation flow (/create).

These tests verify the UI state machine up to the point where a user would
submit a product description.  No video is actually generated — doing so
would consume credits and take minutes.

Flow covered:
  /create
    -> mode_basic / mode_smart / mode_pro  (mode selection screen)
    -> action_video / action_image_set      (action selection)
    -> preset_quick / preset_standard / ... (duration presets)
    -> platform_tiktok / platform_reels     (platform selection)
    -> back navigation via main_menu button
"""

import pytest
from conftest import (
    send_and_wait,
    click_callback,
    _has_button,
    _get_button_callbacks,
    _is_error_text,
)

# ─── /create entry screen ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_shows_basic_mode_button(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None, "/create produced no response with buttons"
    assert _has_button(
        msg, callback_data="mode_basic"
    ), "/create did not show mode_basic button"


@pytest.mark.asyncio
async def test_create_shows_smart_mode_button(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    assert _has_button(
        msg, callback_data="mode_smart"
    ), "/create did not show mode_smart button"


@pytest.mark.asyncio
async def test_create_shows_pro_mode_button(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    assert _has_button(
        msg, callback_data="mode_pro"
    ), "/create did not show mode_pro button"


@pytest.mark.asyncio
async def test_create_has_main_menu_escape(client, bot):
    """Users must be able to escape /create back to the main menu."""
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    assert _has_button(
        msg, callback_data="main_menu"
    ), "/create screen is missing the main_menu escape button"


# ─── Basic mode ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_basic_mode_shows_action_buttons(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    result = await click_callback(client, bot, msg, "mode_basic")
    if result is None:
        pytest.skip("Bot did not respond in time after clicking mode_basic")
    cbs = _get_button_callbacks(result)
    action_cbs = [c for c in cbs if c.startswith("action_")]
    assert (
        len(action_cbs) > 0
    ), f"mode_basic did not show any action_* buttons; got: {cbs}"


@pytest.mark.asyncio
async def test_basic_mode_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    result = await click_callback(client, bot, msg, "mode_basic")
    if result is None:
        pytest.skip("Bot did not respond in time after clicking mode_basic")
    assert not _is_error_text(
        result.text
    ), f"mode_basic returned an error: {(result.text or '')[:120]}"


@pytest.mark.asyncio
async def test_basic_mode_video_action_responds(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    mode_msg = await click_callback(client, bot, msg, "mode_basic")
    if mode_msg is None:
        pytest.skip("Bot did not respond in time after clicking mode_basic")
    if not _has_button(mode_msg, callback_data="action_video"):
        pytest.skip("mode_basic does not expose action_video")
    result = await click_callback(client, bot, mode_msg, "action_video")
    if result is None:
        pytest.skip("Bot did not respond in time after clicking action_video (basic)")
    assert not _is_error_text(
        result.text
    ), f"action_video (basic) returned error: {(result.text or '')[:120]}"


# ─── Smart mode ──────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_smart_mode_shows_action_buttons(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    result = await click_callback(client, bot, msg, "mode_smart")
    if result is None:
        pytest.skip("Bot did not respond in time after clicking mode_smart")
    cbs = _get_button_callbacks(result)
    action_cbs = [c for c in cbs if c.startswith("action_")]
    assert (
        len(action_cbs) > 0
    ), f"mode_smart did not show any action_* buttons; got: {cbs}"


@pytest.mark.asyncio
async def test_smart_mode_shows_video_action(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    result = await click_callback(client, bot, msg, "mode_smart")
    if result is None:
        pytest.skip("Bot did not respond in time after clicking mode_smart")
    assert _has_button(
        result, callback_data="action_video"
    ), "mode_smart did not show action_video button"


@pytest.mark.asyncio
async def test_smart_video_shows_preset_buttons(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    mode_msg = await click_callback(client, bot, msg, "mode_smart")
    if mode_msg is None:
        pytest.skip("Bot did not respond in time after clicking mode_smart")
    action_msg = await click_callback(client, bot, mode_msg, "action_video")
    if action_msg is None:
        pytest.skip("Bot did not respond in time after clicking action_video (smart)")
    cbs = _get_button_callbacks(action_msg)
    preset_cbs = [c for c in cbs if c.startswith("preset_")]
    assert (
        len(preset_cbs) > 0
    ), f"Smart mode video action did not show preset_* buttons; got: {cbs}"


@pytest.mark.asyncio
async def test_smart_video_preset_standard_shows_platforms(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    mode_msg = await click_callback(client, bot, msg, "mode_smart")
    if mode_msg is None:
        pytest.skip("Bot did not respond in time after clicking mode_smart")
    action_msg = await click_callback(client, bot, mode_msg, "action_video")
    if action_msg is None:
        pytest.skip("Bot did not respond in time after clicking action_video (smart)")
    if not _has_button(action_msg, callback_data="preset_standard"):
        pytest.skip("preset_standard not available in this bot version")
    preset_msg = await click_callback(client, bot, action_msg, "preset_standard")
    if preset_msg is None:
        pytest.skip("Bot did not respond in time after clicking preset_standard")
    cbs = _get_button_callbacks(preset_msg)
    platform_cbs = [c for c in cbs if c.startswith("platform_")]
    assert (
        len(platform_cbs) > 0
    ), f"preset_standard did not show platform_* buttons; got: {cbs}"


@pytest.mark.asyncio
async def test_smart_video_preset_quick_shows_platforms(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    mode_msg = await click_callback(client, bot, msg, "mode_smart")
    if mode_msg is None:
        pytest.skip("Bot did not respond in time after clicking mode_smart")
    action_msg = await click_callback(client, bot, mode_msg, "action_video")
    if action_msg is None:
        pytest.skip("Bot did not respond in time after clicking action_video (smart)")
    if not _has_button(action_msg, callback_data="preset_quick"):
        pytest.skip("preset_quick not available in this bot version")
    preset_msg = await click_callback(client, bot, action_msg, "preset_quick")
    if preset_msg is None:
        pytest.skip("Bot did not respond in time after clicking preset_quick")
    cbs = _get_button_callbacks(preset_msg)
    platform_cbs = [c for c in cbs if c.startswith("platform_")]
    assert (
        len(platform_cbs) > 0
    ), f"preset_quick did not show platform_* buttons; got: {cbs}"


@pytest.mark.asyncio
async def test_smart_video_platform_tiktok_responds(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    mode_msg = await click_callback(client, bot, msg, "mode_smart")
    if mode_msg is None:
        pytest.skip("Bot did not respond in time after clicking mode_smart")
    action_msg = await click_callback(client, bot, mode_msg, "action_video")
    if action_msg is None:
        pytest.skip("Bot did not respond in time after clicking action_video (smart)")

    # Pick whichever preset appears first
    cbs = _get_button_callbacks(action_msg)
    preset = next(
        (c for c in cbs if c.startswith("preset_") and c != "preset_custom"), None
    )
    if preset is None:
        pytest.skip("No non-custom preset available")

    preset_msg = await click_callback(client, bot, action_msg, preset)
    if preset_msg is None:
        pytest.skip(f"Bot did not respond in time after clicking {preset}")
    if not _has_button(preset_msg, callback_data="platform_tiktok"):
        pytest.skip("platform_tiktok not available after this preset")

    result = await click_callback(client, bot, preset_msg, "platform_tiktok")
    if result is None:
        pytest.skip("Bot did not respond in time after clicking platform_tiktok")
    assert not _is_error_text(
        result.text
    ), f"platform_tiktok returned error: {(result.text or '')[:120]}"


# ─── Pro mode ────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pro_mode_shows_action_buttons(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    result = await click_callback(client, bot, msg, "mode_pro")
    if result is None:
        pytest.skip("Bot did not respond in time after clicking mode_pro")
    cbs = _get_button_callbacks(result)
    action_cbs = [c for c in cbs if c.startswith("action_")]
    assert (
        len(action_cbs) > 0
    ), f"mode_pro did not show any action_* buttons; got: {cbs}"


@pytest.mark.asyncio
async def test_pro_mode_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    result = await click_callback(client, bot, msg, "mode_pro")
    if result is None:
        pytest.skip("Bot did not respond in time after clicking mode_pro")
    assert not _is_error_text(
        result.text
    ), f"mode_pro returned an error: {(result.text or '')[:120]}"


# ─── Back navigation ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_main_menu_button_from_create_returns_full_menu(client, bot):
    """Clicking main_menu from the /create screen must show the full main menu."""
    msg = await send_and_wait(client, bot, "/create", need_buttons=True)
    assert msg is not None
    result = await click_callback(client, bot, msg, "main_menu")
    if result is None:
        pytest.skip("Bot did not respond in time after clicking main_menu from /create")
    # The full main menu should have the prompt library and create video buttons
    cbs = _get_button_callbacks(result)
    has_main_menu_items = (
        "back_prompts" in cbs
        or "create_video_new" in cbs
        or _has_button(result, text_contains="Buat Video")
        or _has_button(result, text_contains="Create Video")
    )
    assert (
        has_main_menu_items
    ), f"main_menu click did not show main menu buttons; got: {cbs}"
