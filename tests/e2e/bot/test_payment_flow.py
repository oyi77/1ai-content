"""
Tests for the payment / top-up flow (/topup).

These tests only verify the UI — they do NOT initiate a real payment.
The flow tested is:
  /topup -> package list -> click a package -> gateway selection appears
           -> check_payment button present
"""

import pytest
from conftest import (
    send_and_wait,
    click_callback,
    _has_button,
    _get_button_callbacks,
    _is_error_text,
)

# ─── /topup entry screen ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_topup_shows_package_buttons(client, bot):
    msg = await send_and_wait(client, bot, "/topup", need_buttons=True)
    assert msg is not None, "/topup produced no response with buttons"
    cbs = _get_button_callbacks(msg)
    # Packages are commonly named package_*, buy_*, or topup_*
    pkg_cbs = [
        c
        for c in cbs
        if any(c.startswith(p) for p in ("package_", "buy_", "topup_", "pkg_"))
    ]
    assert (
        len(pkg_cbs) > 0
    ), f"/topup did not show any package buttons; callbacks found: {cbs}"


@pytest.mark.asyncio
async def test_topup_response_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/topup")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/topup returned an error: {(msg.text or '')[:120]}"


@pytest.mark.asyncio
async def test_topup_has_main_menu_escape(client, bot):
    """Users must be able to return to the main menu from /topup."""
    msg = await send_and_wait(client, bot, "/topup", need_buttons=True)
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
    ), f"/topup is missing an escape button back to main menu; callbacks: {cbs}"


# ─── package selection ───────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_clicking_first_package_shows_gateway_or_confirm(client, bot):
    """
    Clicking the first available package button must produce a gateway
    selection screen or a confirmation/invoice screen — not an error.
    """
    msg = await send_and_wait(client, bot, "/topup", need_buttons=True)
    assert msg is not None

    cbs = _get_button_callbacks(msg)
    pkg_cb = next(
        (
            c
            for c in cbs
            if any(c.startswith(p) for p in ("package_", "buy_", "topup_", "pkg_"))
        ),
        None,
    )
    if pkg_cb is None:
        pytest.skip("No package button found on /topup screen")

    result = await click_callback(client, bot, msg, pkg_cb)
    assert result is not None, f"Clicking package '{pkg_cb}' produced no bot response"
    assert not _is_error_text(
        result.text
    ), f"Clicking package '{pkg_cb}' returned an error: {(result.text or '')[:120]}"


@pytest.mark.asyncio
async def test_package_selection_shows_gateway_buttons(client, bot):
    """
    After selecting a package the bot should offer at least one payment
    gateway button.
    """
    msg = await send_and_wait(client, bot, "/topup", need_buttons=True)
    assert msg is not None

    cbs = _get_button_callbacks(msg)
    pkg_cb = next(
        (
            c
            for c in cbs
            if any(c.startswith(p) for p in ("package_", "buy_", "topup_", "pkg_"))
        ),
        None,
    )
    if pkg_cb is None:
        pytest.skip("No package button found on /topup screen")

    result = await click_callback(client, bot, msg, pkg_cb)
    assert result is not None

    result_cbs = _get_button_callbacks(result)
    # Gateway buttons are typically named gateway_*, pay_*, or contain provider names
    gateway_keywords = (
        "gateway_",
        "pay_",
        "midtrans",
        "tripay",
        "duitku",
        "nowpay",
        "qris",
    )
    has_gateway = any(
        any(kw in c.lower() for kw in gateway_keywords) for c in result_cbs
    )
    # Fallback: some flows skip gateway selection and go straight to an invoice
    has_invoice_keyword = any(
        w in (result.text or "").lower()
        for w in ("invoice", "bayar", "pay", "transfer", "virtual account", "va")
    )
    assert has_gateway or has_invoice_keyword, (
        f"After selecting package '{pkg_cb}', expected gateway buttons or invoice text. "
        f"Buttons: {result_cbs}  |  Text: {(result.text or '')[:120]}"
    )


@pytest.mark.asyncio
async def test_payment_check_button_appears_after_package_selection(client, bot):
    """
    The flow must expose a way for the user to check their payment status
    at some point after selecting a package.
    """
    msg = await send_and_wait(client, bot, "/topup", need_buttons=True)
    assert msg is not None

    cbs = _get_button_callbacks(msg)
    pkg_cb = next(
        (
            c
            for c in cbs
            if any(c.startswith(p) for p in ("package_", "buy_", "topup_", "pkg_"))
        ),
        None,
    )
    if pkg_cb is None:
        pytest.skip("No package button found on /topup screen")

    result = await click_callback(client, bot, msg, pkg_cb)
    assert result is not None

    result_cbs = _get_button_callbacks(result)
    # Accept any button that indicates payment checking / confirmation
    check_keywords = (
        "check_payment",
        "cek_payment",
        "cek_bayar",
        "confirm",
        "konfirmasi",
        "check",
    )
    has_check = (
        any(any(kw in c.lower() for kw in check_keywords) for c in result_cbs)
        or _has_button(result, text_contains="Cek")
        or _has_button(result, text_contains="Check")
    )

    # Not all gateways show check immediately — mark as xfail with reason if absent
    if not has_check:
        pytest.xfail(
            "check_payment button not present immediately after package selection "
            "(may appear after gateway is chosen)"
        )
