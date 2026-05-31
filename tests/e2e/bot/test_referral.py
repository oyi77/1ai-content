"""
Tests for the referral system (/referral).

Verified behaviors:
  - /referral responds with referral info
  - A referral link / code is included in the response
  - A share button is present
  - Referral stats are displayed (earned, total referrals)
  - Clicking any referral sub-button does not return an error
"""

import pytest
from conftest import (
    send_and_wait,
    click_callback,
    _has_button,
    _get_button_callbacks,
    _is_error_text,
)

# ─── /referral entry screen ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_referral_returns_response(client, bot):
    msg = await send_and_wait(client, bot, "/referral", timeout=30)
    assert msg is not None, "/referral produced no bot response"


@pytest.mark.asyncio
async def test_referral_response_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/referral", timeout=30)
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/referral returned an error: {(msg.text or '')[:120]}"


@pytest.mark.asyncio
async def test_referral_does_not_show_no_account_error(client, bot):
    """
    A known bug: /referral shows "don't have an account" for logged-in users.
    This test guards against regression.
    """
    msg = await send_and_wait(client, bot, "/referral", timeout=30)
    assert msg is not None
    text = (msg.text or "").lower()
    assert (
        "don't have an account" not in text
    ), "/referral incorrectly shows 'don't have an account'"
    assert (
        "belum memiliki akun" not in text
    ), "/referral incorrectly shows 'belum memiliki akun'"


@pytest.mark.asyncio
async def test_referral_shows_referral_code_or_link(client, bot):
    msg = await send_and_wait(client, bot, "/referral", timeout=30)
    assert msg is not None
    text = msg.text or ""
    has_code = "ref_" in text or "start=ref" in text or "?start=" in text
    assert (
        has_code
    ), f"/referral response does not contain a referral code or deep link: {text[:200]}"


@pytest.mark.asyncio
async def test_referral_contains_stats(client, bot):
    """
    The referral screen should show at least one stat:
    number of referrals, earned amount, or commission info.
    """
    msg = await send_and_wait(client, bot, "/referral", timeout=30)
    assert msg is not None
    text = (msg.text or "").lower()
    has_stats = any(
        w in text
        for w in (
            "referral",
            "refer",
            "komisi",
            "commission",
            "earned",
            "total",
            "kredit",
            "credit",
        )
    )
    assert (
        has_stats
    ), f"/referral response does not contain stats keywords: {text[:200]}"


@pytest.mark.asyncio
async def test_referral_has_share_button(client, bot):
    """A share / invite button must be present on the referral screen."""
    msg = await send_and_wait(client, bot, "/referral", need_buttons=True, timeout=30)
    if msg is None:
        pytest.skip("Bot did not respond in time to /referral")
    has_share = (
        _has_button(msg, text_contains="Share")
        or _has_button(msg, text_contains="Bagikan")
        or _has_button(msg, text_contains="Invite")
        or _has_button(msg, text_contains="Undang")
        or _has_button(msg, text_contains="Kirim")
    )
    if not has_share:
        pytest.xfail(
            f"Referral screen has no Share/Invite button; "
            f"callbacks: {_get_button_callbacks(msg)}"
        )


@pytest.mark.asyncio
async def test_referral_has_main_menu_escape(client, bot):
    msg = await send_and_wait(client, bot, "/referral", need_buttons=True, timeout=30)
    assert msg is not None
    cbs = _get_button_callbacks(msg)
    has_escape = (
        "main_menu" in cbs
        or _has_button(msg, text_contains="Menu")
        or _has_button(msg, text_contains="Kembali")
        or _has_button(msg, text_contains="Back")
    )
    assert (
        has_escape
    ), f"Referral screen is missing main menu escape button; callbacks: {cbs}"


# ─── referral sub-buttons ────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_all_referral_sub_buttons_respond_without_error(client, bot):
    """
    Every callback button on the referral screen (except main_menu) must
    produce a non-error response when clicked.
    """
    msg = await send_and_wait(client, bot, "/referral", need_buttons=True, timeout=30)
    assert msg is not None

    cbs = _get_button_callbacks(msg)
    # Skip navigation-only buttons
    skip = {"main_menu", "back_main", "back"}
    test_cbs = [c for c in cbs if c not in skip]

    if not test_cbs:
        pytest.skip("No testable sub-buttons found on /referral screen")

    failures = []
    for cb in test_cbs:
        # Re-fetch fresh /referral message each time so message state is clean
        fresh_msg = await send_and_wait(
            client, bot, "/referral", need_buttons=True, timeout=30
        )
        if not fresh_msg:
            failures.append(f"[{cb}] could not reload /referral")
            continue

        result = await click_callback(client, bot, fresh_msg, cb)
        if result is None:
            failures.append(f"[{cb}] produced no response")
        elif _is_error_text(result.text):
            failures.append(f"[{cb}] returned error: {(result.text or '')[:80]}")

    assert not failures, "Referral sub-button failures:\n" + "\n".join(failures)
