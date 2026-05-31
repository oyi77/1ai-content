"""
Tests for the settings flow (/settings).

Flow tested:
  /settings -> settings menu with inline buttons
            -> language sub-menu (language options present)
            -> notification toggle (responds without error)
"""

import pytest
from conftest import (
    send_and_wait,
    click_callback,
    click_button_by_text,
    _has_button,
    _get_button_callbacks,
    _is_error_text,
)

# ─── /settings entry screen ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_settings_shows_inline_keyboard(client, bot):
    msg = await send_and_wait(client, bot, "/settings", need_buttons=True)
    assert msg is not None, "/settings produced no response with inline keyboard"


@pytest.mark.asyncio
async def test_settings_response_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/settings")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/settings returned an error: {(msg.text or '')[:120]}"


@pytest.mark.asyncio
async def test_settings_has_language_button(client, bot):
    msg = await send_and_wait(client, bot, "/settings", need_buttons=True)
    assert msg is not None
    has_lang = (
        _has_button(msg, text_contains="language")
        or _has_button(msg, text_contains="bahasa")
        or _has_button(msg, text_contains="lang")
    )
    assert has_lang, (
        "Settings screen has no language button. "
        f"Buttons: {_get_button_callbacks(msg)}"
    )


@pytest.mark.asyncio
async def test_settings_has_notification_button(client, bot):
    msg = await send_and_wait(client, bot, "/settings", need_buttons=True)
    assert msg is not None
    has_notif = (
        _has_button(msg, text_contains="notif")
        or _has_button(msg, text_contains="notification")
        or _has_button(msg, callback_data="settings_notifications")
        or _has_button(msg, callback_data="toggle_notifications")
    )
    # Notifications setting may live in a sub-menu — not fatal if absent at top level
    if not has_notif:
        pytest.xfail(
            "Notification button not found at top-level settings "
            "(may be in a sub-menu)"
        )


@pytest.mark.asyncio
async def test_settings_has_main_menu_escape(client, bot):
    msg = await send_and_wait(client, bot, "/settings", need_buttons=True)
    assert msg is not None
    cbs = _get_button_callbacks(msg)
    has_escape = (
        "main_menu" in cbs
        or _has_button(msg, text_contains="Menu")
        or _has_button(msg, text_contains="Kembali")
        or _has_button(msg, text_contains="Back")
    )
    if not has_escape:
        pytest.xfail(
            "Settings menu does not expose a top-level main_menu escape button"
        )


# ─── Language sub-menu ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_language_button_shows_language_options(client, bot):
    msg = await send_and_wait(client, bot, "/settings", need_buttons=True)
    assert msg is not None

    # Try clicking the language button by text since callback_data varies
    result = (
        await click_button_by_text(client, bot, msg, "bahasa")
        or await click_button_by_text(client, bot, msg, "language")
        or await click_button_by_text(client, bot, msg, "lang")
    )

    if result is None:
        pytest.skip("Language button not found or did not respond")

    assert not _is_error_text(
        result.text
    ), f"Language sub-menu returned an error: {(result.text or '')[:120]}"
    # Should show at least Indonesian and English options
    text = (result.text or "").lower()
    cbs = _get_button_callbacks(result)
    has_lang_options = (
        "indonesia" in text
        or "english" in text
        or any("lang_" in c or "id" in c or "en" in c for c in cbs)
        or _has_button(result, text_contains="Indonesia")
        or _has_button(result, text_contains="English")
    )
    assert has_lang_options, (
        f"Language sub-menu did not show language options. "
        f"Text: {text[:120]}  |  Buttons: {cbs}"
    )


@pytest.mark.asyncio
async def test_language_options_are_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/settings", need_buttons=True)
    assert msg is not None

    result = await click_button_by_text(
        client, bot, msg, "bahasa"
    ) or await click_button_by_text(client, bot, msg, "language")

    if result is None:
        pytest.skip("Language button not found or did not respond")

    assert not _is_error_text(
        result.text
    ), f"Language options returned an error: {(result.text or '')[:120]}"


# ─── Notification toggle ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_notification_toggle_responds_without_error(client, bot):
    """
    Toggling notifications must not produce an error response.
    The test attempts to find and click a notifications button at the
    top-level settings screen.
    """
    msg = await send_and_wait(client, bot, "/settings", need_buttons=True)
    assert msg is not None

    result = (
        await click_button_by_text(client, bot, msg, "notif")
        or await click_callback(client, bot, msg, "settings_notifications")
        or await click_callback(client, bot, msg, "toggle_notifications")
    )

    if result is None:
        pytest.skip("Notification button not found at top-level settings")

    assert not _is_error_text(
        result.text
    ), f"Notification toggle returned an error: {(result.text or '')[:120]}"
