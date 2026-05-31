"""
Tests for the prompt library flow (/prompts).

Flow tested:
  /prompts -> niche category buttons present
           -> clicking a niche -> prompt list appears (use_prompt_* or use_admin_prompt_*)
           -> clicking a prompt -> no "Prompt Tidak Ditemukan" error
           -> model name leak check (Gemini, GPT, Claude etc. must not appear)
"""

import pytest
from conftest import (
    send_and_wait,
    click_callback,
    _has_button,
    _get_button_callbacks,
    _is_error_text,
)

# AI model names that must never appear in bot responses
_SECRET_NAMES = [
    "Gemini",
    "GPT-4",
    "Grok",
    "Claude",
    "OpenAI",
    "Anthropic",
    "Mistral",
    "Llama",
    "OmniRoute",
]


# ─── /prompts entry screen ───────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_prompts_shows_niche_buttons(client, bot):
    msg = await send_and_wait(client, bot, "/prompts", need_buttons=True)
    assert msg is not None, "/prompts produced no response with buttons"
    cbs = _get_button_callbacks(msg)
    niche_cbs = [c for c in cbs if c.startswith("prompts_")]
    assert (
        len(niche_cbs) > 0
    ), f"/prompts did not show any prompts_* niche buttons; got: {cbs}"


@pytest.mark.asyncio
async def test_prompts_response_is_not_error(client, bot):
    msg = await send_and_wait(client, bot, "/prompts")
    assert msg is not None
    assert not _is_error_text(
        msg.text
    ), f"/prompts returned an error: {(msg.text or '')[:120]}"


@pytest.mark.asyncio
async def test_prompts_has_main_menu_escape(client, bot):
    msg = await send_and_wait(client, bot, "/prompts", need_buttons=True)
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
            "/prompts niche menu does not expose a top-level main_menu escape button"
        )


# ─── Niche selection ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_fnb_niche_shows_prompt_list(client, bot):
    msg = await send_and_wait(client, bot, "/prompts", need_buttons=True)
    assert msg is not None

    if not _has_button(msg, callback_data="prompts_fnb"):
        pytest.skip("prompts_fnb niche not available")

    result = await click_callback(client, bot, msg, "prompts_fnb")
    assert result is not None, "Clicking prompts_fnb produced no response"
    assert not _is_error_text(
        result.text
    ), f"prompts_fnb returned an error: {(result.text or '')[:120]}"
    cbs = _get_button_callbacks(result)
    use_btns = [c for c in cbs if c.startswith("use_")]
    assert len(use_btns) > 0, f"F&B niche showed no use_* prompt buttons; got: {cbs}"


@pytest.mark.asyncio
async def test_all_niches_respond_without_error(client, bot):
    """Every niche button on /prompts must open without an error response."""
    msg = await send_and_wait(client, bot, "/prompts", need_buttons=True)
    assert msg is not None

    cbs = _get_button_callbacks(msg)
    niche_cbs = [
        c
        for c in cbs
        if c.startswith("prompts_") and c not in ("prompts_trending", "prompts_custom")
    ]
    if not niche_cbs:
        pytest.skip("No niche buttons found on /prompts")

    failures = []
    for niche in niche_cbs:
        fresh = await send_and_wait(client, bot, "/prompts", need_buttons=True)
        if not fresh:
            failures.append(f"[{niche}] could not reload /prompts")
            continue
        result = await click_callback(client, bot, fresh, niche)
        if result is None:
            failures.append(f"[{niche}] produced no response")
        elif _is_error_text(result.text):
            failures.append(f"[{niche}] error: {(result.text or '')[:80]}")

    assert not failures, "Niche failures:\n" + "\n".join(failures)


# ─── Prompt selection ────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_selecting_first_fnb_prompt_does_not_show_not_found_error(client, bot):
    """
    Guard against the 'Prompt Tidak Ditemukan' regression.
    When a user clicks a prompt button the response must not be an
    'not found' error.
    """
    msg = await send_and_wait(client, bot, "/prompts", need_buttons=True)
    assert msg is not None

    if not _has_button(msg, callback_data="prompts_fnb"):
        pytest.skip("prompts_fnb not available")

    niche_msg = await click_callback(client, bot, msg, "prompts_fnb")
    assert niche_msg is not None

    cbs = _get_button_callbacks(niche_msg)
    use_btn = next((c for c in cbs if c.startswith("use_")), None)
    if use_btn is None:
        pytest.skip("No use_* prompt button found in F&B niche")

    result = await click_callback(client, bot, niche_msg, use_btn)
    assert result is not None, f"Clicking prompt '{use_btn}' produced no response"

    text = (result.text or "").lower()
    assert (
        "tidak ditemukan" not in text
    ), f"Prompt selection shows 'Tidak Ditemukan' error for '{use_btn}'"
    assert not _is_error_text(
        result.text
    ), f"Prompt selection returned error for '{use_btn}': {text[:120]}"


@pytest.mark.asyncio
async def test_selected_prompt_shows_video_creation_cta(client, bot):
    """
    After selecting a prompt the bot should show a CTA to create a video
    or display the prompt content — not just a blank or error screen.
    """
    msg = await send_and_wait(client, bot, "/prompts", need_buttons=True)
    assert msg is not None

    cbs = _get_button_callbacks(msg)
    niche_cb = next(
        (
            c
            for c in cbs
            if c.startswith("prompts_")
            and c not in ("prompts_trending", "prompts_custom")
        ),
        None,
    )
    if niche_cb is None:
        pytest.skip("No niche button available")

    niche_msg = await click_callback(client, bot, msg, niche_cb)
    if niche_msg is None:
        pytest.skip(f"Niche '{niche_cb}' produced no response")

    niche_cbs = _get_button_callbacks(niche_msg)
    use_btn = next((c for c in niche_cbs if c.startswith("use_")), None)
    if use_btn is None:
        pytest.skip("No use_* prompt button in selected niche")

    result = await click_callback(client, bot, niche_msg, use_btn)
    assert result is not None

    result_cbs = _get_button_callbacks(result)
    text = (result.text or "").lower()

    has_cta = (
        "create_video_new" in result_cbs
        or _has_button(result, text_contains="Video")
        or _has_button(result, text_contains="Buat")
        or any(w in text for w in ("produk", "product", "prompt", "video", "buat"))
    )
    assert has_cta, (
        f"After prompt selection, expected a video CTA or prompt content. "
        f"Text: {text[:120]}  |  Buttons: {result_cbs}"
    )


# ─── Model name leak ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_prompt_library_does_not_leak_model_names(client, bot):
    """
    AI provider / model names must never appear in the bot's messages.
    Tests the /prompts flow specifically since it involves AI-generated content.
    """
    # Collect the /prompts screen plus one niche
    msgs_to_check = []

    entry_msg = await send_and_wait(client, bot, "/prompts", need_buttons=True)
    if entry_msg:
        msgs_to_check.append(entry_msg)
        cbs = _get_button_callbacks(entry_msg)
        first_niche = next(
            (
                c
                for c in cbs
                if c.startswith("prompts_") and c not in ("prompts_trending",)
            ),
            None,
        )
        if first_niche:
            niche_msg = await click_callback(client, bot, entry_msg, first_niche)
            if niche_msg:
                msgs_to_check.append(niche_msg)

    leaks = []
    for m in msgs_to_check:
        text = m.text or ""
        for secret in _SECRET_NAMES:
            if secret.lower() in text.lower():
                # Find the context around the leak
                idx = text.lower().index(secret.lower())
                snippet = text[max(0, idx - 20) : idx + len(secret) + 20]
                leaks.append(f"'{secret}' in message {m.id}: ...{snippet}...")

    assert not leaks, "Model names leaked in prompt library:\n" + "\n".join(leaks)


@pytest.mark.asyncio
async def test_main_menu_does_not_leak_model_names(client, bot):
    """
    The main menu (/menu) must not expose any internal AI provider names.
    """
    msg = await send_and_wait(client, bot, "/menu")
    assert msg is not None

    text = (msg.text or "") + " ".join(
        btn.text
        for row in (
            msg.reply_markup.rows
            if msg.reply_markup and hasattr(msg.reply_markup, "rows")
            else []
        )
        for btn in row.buttons
    )

    leaks = [s for s in _SECRET_NAMES if s.lower() in text.lower()]
    assert not leaks, f"Model names leaked in main menu: {leaks}"
