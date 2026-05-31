"""
Tests for new-user onboarding behavior.

These tests observe the /start flow for an already-registered user and verify:
  - The welcome message format is correct
  - Language is either Indonesian or English (no garbled output)
  - The main menu keyboard buttons are present after /start
  - The "Create Video" keyboard button triggers the creation flow

Note: We cannot simulate a brand-new user (that would require a fresh
Telegram account). Instead we verify that /start for a returning user
correctly shows the returning-user menu — which is the normal production path.
"""

import pytest
from conftest import (
    send_and_wait,
    click_button_by_text,
    _has_button,
    _get_button_callbacks,
    _is_error_text,
)

# ─── /start returning-user flow ──────────────────────────────────────────────


@pytest.mark.asyncio
async def test_start_returns_non_empty_response(client, bot):
    msg = await send_and_wait(client, bot, "/start")
    assert msg is not None, "/start produced no response"
    assert msg.text, "/start returned a message with no text"


@pytest.mark.asyncio
async def test_start_response_is_in_known_language(client, bot):
    """
    The bot must respond in either Indonesian or English.
    This guards against locale mismatches returning untranslated strings.
    """
    msg = await send_and_wait(client, bot, "/start")
    assert msg is not None
    text = (msg.text or "").lower()

    indonesian_words = ("halo", "selamat", "kredit", "buat", "video", "menu", "saldo")
    english_words = (
        "hello",
        "welcome",
        "credit",
        "create",
        "menu",
        "balance",
        "quick actions",
        "quick action",
    )

    is_indonesian = any(w in text for w in indonesian_words)
    is_english = any(w in text for w in english_words)

    assert (
        is_indonesian or is_english
    ), f"/start response is not in Indonesian or English: {text[:200]}"


@pytest.mark.asyncio
async def test_start_response_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/start")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/start returned an error: {(msg.text or '')[:120]}"


@pytest.mark.asyncio
async def test_start_shows_inline_keyboard(client, bot):
    """Returning users must see an inline keyboard after /start."""
    msg = await send_and_wait(client, bot, "/start", need_buttons=True)
    assert msg is not None, "/start did not respond with inline keyboard buttons"


@pytest.mark.asyncio
async def test_start_inline_keyboard_has_at_least_two_buttons(client, bot):
    msg = await send_and_wait(client, bot, "/start", need_buttons=True)
    assert msg is not None
    cbs = _get_button_callbacks(msg)
    assert (
        len(cbs) >= 2
    ), f"/start showed only {len(cbs)} button(s), expected at least 2"


# ─── Language selection (accessible from /settings) ──────────────────────────


@pytest.mark.asyncio
async def test_language_selection_indonesian_responds(client, bot):
    """
    Selecting Indonesian from the language settings must produce a
    non-error acknowledgement.
    """
    settings_msg = await send_and_wait(client, bot, "/settings", need_buttons=True)
    if settings_msg is None:
        pytest.skip("/settings did not respond with buttons")

    lang_result = await click_button_by_text(
        client, bot, settings_msg, "bahasa"
    ) or await click_button_by_text(client, bot, settings_msg, "language")
    if lang_result is None:
        pytest.skip("Language button not found in settings")

    id_result = await click_button_by_text(client, bot, lang_result, "Indonesia")
    if id_result is None:
        pytest.skip("Indonesian option not found in language sub-menu")

    assert not _is_error_text(
        id_result.text
    ), f"Selecting Indonesian returned error: {(id_result.text or '')[:120]}"


@pytest.mark.asyncio
async def test_language_selection_english_responds(client, bot):
    """
    Selecting English from the language settings must produce a
    non-error acknowledgement.
    """
    settings_msg = await send_and_wait(client, bot, "/settings", need_buttons=True)
    if settings_msg is None:
        pytest.skip("/settings did not respond with buttons")

    lang_result = await click_button_by_text(
        client, bot, settings_msg, "bahasa"
    ) or await click_button_by_text(client, bot, settings_msg, "language")
    if lang_result is None:
        pytest.skip("Language button not found in settings")

    en_result = await click_button_by_text(client, bot, lang_result, "English")
    if en_result is None:
        pytest.skip("English option not found in language sub-menu")

    assert not _is_error_text(
        en_result.text
    ), f"Selecting English returned error: {(en_result.text or '')[:120]}"

    # Restore to Indonesian so other tests see the default language
    await click_button_by_text(
        client, bot, en_result, "Bahasa"
    ) or await click_button_by_text(client, bot, en_result, "Indonesia")


# ─── Keyboard shortcut smoke tests ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_create_video_keyboard_button_triggers_mode_selection(client, bot):
    """
    The '🎬 Create Video' reply keyboard button must open the V3 mode
    selection screen (mode_basic / mode_smart / mode_pro).
    """
    msg = await send_and_wait(client, bot, "\U0001f3ac Create Video", need_buttons=True)
    assert msg is not None, "'🎬 Create Video' keyboard button produced no response"

    cbs = _get_button_callbacks(msg)
    has_mode = any(c in cbs for c in ("mode_basic", "mode_smart", "mode_pro"))
    assert has_mode, (
        f"'🎬 Create Video' keyboard button did not trigger mode selection. "
        f"Buttons: {cbs}  |  Text: {(msg.text or '')[:120]}"
    )


@pytest.mark.asyncio
async def test_create_video_keyboard_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "\U0001f3ac Create Video")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"'🎬 Create Video' returned error: {(msg.text or '')[:120]}"
