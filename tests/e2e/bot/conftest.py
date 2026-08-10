"""
Shared pytest fixtures and helpers for Telethon bot e2e tests.

Session credentials are read-only — the Telethon session at SESSION_PATH
must already be authorized before running these tests.  If it is not, every
test that depends on the `client` or `bot` fixtures will be skipped with a
clear message rather than failing or hanging.

Telethon binds to one event loop at connect time and refuses to work on any
other.  We create a single loop at import time, connect eagerly, and yield
that loop as the session-scoped event_loop fixture so every test runs on it.
"""

import asyncio
import inspect
import os
from datetime import datetime, timezone
from typing import Optional

import pytest
from telethon import TelegramClient
from telethon.tl.custom import Message

# ─── connection constants ────────────────────────────────────────────────────
API_ID = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "")
SESSION_PATH = "/home/openclaw/.hermes/workspace/sessions/paijo"
BOT_USERNAME = "vilona_content_bot"
BASE_URL = "http://localhost:3002"

# How long (seconds) to poll for a bot reply before giving up
DEFAULT_TIMEOUT = 20
# How frequently to poll (seconds)
POLL_INTERVAL = 0.5
# "Loading" messages the bot sends while generating — skip these when waiting
LOADING_KEYWORDS = ("Vilona",)

# ─── Eager connection at module level ────────────────────────────────────────
# This ensures Telethon connects on a known loop BEFORE pytest-asyncio
# creates its own loops.  All tests then run on this exact loop.

_LOOP = asyncio.new_event_loop()
_CLIENT: Optional[TelegramClient] = None
_BOT = None
_SKIP_REASON: Optional[str] = None


def _connect_sync():
    global _CLIENT, _BOT, _SKIP_REASON
    tc = TelegramClient(SESSION_PATH, API_ID, API_HASH, loop=_LOOP)
    _LOOP.run_until_complete(tc.connect())

    if not _LOOP.run_until_complete(tc.is_user_authorized()):
        _LOOP.run_until_complete(tc.disconnect())
        _SKIP_REASON = f"Telethon session not authorized at {SESSION_PATH}"
        return

    try:
        _BOT = _LOOP.run_until_complete(tc.get_entity(BOT_USERNAME))
    except Exception as exc:
        _LOOP.run_until_complete(tc.disconnect())
        _SKIP_REASON = f"Cannot resolve bot @{BOT_USERNAME}: {exc}"
        return

    _CLIENT = tc


try:
    _connect_sync()
except Exception as exc:
    _SKIP_REASON = f"Failed to connect Telethon: {exc}"


# ─── pytest hook: force session loop_scope on every async test ───────────────
def pytest_collection_modifyitems(items):
    marker = pytest.mark.asyncio(loop_scope="session")
    for item in items:
        if asyncio.iscoroutinefunction(item.obj) or inspect.isasyncgenfunction(
            item.obj
        ):
            item.add_marker(marker)


# ─── event loop fixture (session-scoped, yields the Telethon loop) ──────────
@pytest.fixture(scope="session")
def event_loop():
    asyncio.set_event_loop(_LOOP)
    yield _LOOP
    if _CLIENT:
        try:
            result = _CLIENT.disconnect()
            if asyncio.iscoroutine(result) or asyncio.isfuture(result):
                _LOOP.run_until_complete(result)
        except Exception:
            pass
    if not _LOOP.is_closed():
        _LOOP.close()


# ─── client/bot fixtures ────────────────────────────────────────────────────
@pytest.fixture(scope="session")
def client():
    if _SKIP_REASON:
        pytest.skip(_SKIP_REASON)
    return _CLIENT


@pytest.fixture(scope="session")
def bot():
    if _SKIP_REASON:
        pytest.skip(_SKIP_REASON)
    return _BOT


# ─── low-level helpers ────────────────────────────────────────────────────────


def _is_loading(text: str) -> bool:
    """Return True for short animation/loading messages sent by the bot."""
    if not text:
        return False
    return any(kw in text for kw in LOADING_KEYWORDS) and len(text) < 60


def _get_button_callbacks(msg) -> list[str]:
    """Return all callback_data strings from a message's inline keyboard."""
    if not msg or not msg.reply_markup:
        return []
    if not hasattr(msg.reply_markup, "rows"):
        return []
    out = []
    for row in msg.reply_markup.rows:
        for btn in row.buttons:
            data = getattr(btn, "data", None)
            if data:
                out.append(data.decode() if isinstance(data, bytes) else data)
    return out


def _get_button_map(msg) -> dict[str, str]:
    """Return {callback_data: label} for every inline button in the message."""
    if not msg or not msg.reply_markup:
        return {}
    if not hasattr(msg.reply_markup, "rows"):
        return {}
    out = {}
    for row in msg.reply_markup.rows:
        for btn in row.buttons:
            data = getattr(btn, "data", None)
            if data:
                key = data.decode() if isinstance(data, bytes) else data
                out[key] = btn.text
    return out


def _has_button(msg, *, callback_data: str = None, text_contains: str = None) -> bool:
    """
    Return True if the message has an inline button matching either
    `callback_data` (exact) or `text_contains` (case-insensitive substring).
    """
    if not msg or not msg.reply_markup:
        return False
    if not hasattr(msg.reply_markup, "rows"):
        return False
    for row in msg.reply_markup.rows:
        for btn in row.buttons:
            if callback_data is not None:
                data = getattr(btn, "data", None)
                if data:
                    d = data.decode() if isinstance(data, bytes) else data
                    if d == callback_data:
                        return True
            if text_contains is not None:
                if text_contains.lower() in btn.text.lower():
                    return True
    return False


def _is_error_text(text: Optional[str]) -> bool:
    """Return True if the bot message text looks like an error response."""
    if not text:
        return False
    t = text.lower()
    return any(
        kw in t
        for kw in ("error", "gagal", "tidak ditemukan", "failed", "can't parse", "oops")
    )


async def wait_for_response(
    client: TelegramClient,
    bot,
    since: datetime,
    *,
    timeout: float = DEFAULT_TIMEOUT,
    need_buttons: bool = False,
) -> Optional[Message]:
    """
    Poll for the next non-loading bot message sent after `since`.
    """
    me = await client.get_me()
    iterations = int(timeout / POLL_INTERVAL)
    for _ in range(iterations):
        await asyncio.sleep(POLL_INTERVAL)
        msgs = await client.get_messages(bot, limit=8)
        for m in sorted(msgs, key=lambda x: x.date, reverse=True):
            msg_date = (
                m.date.replace(tzinfo=timezone.utc) if m.date.tzinfo is None else m.date
            )
            if msg_date <= since:
                continue
            if m.sender_id == me.id:
                continue
            if _is_loading(m.text or ""):
                continue
            if need_buttons and not _get_button_callbacks(m):
                continue
            return m
    return None


async def send_and_wait(
    client: TelegramClient,
    bot,
    text: str,
    *,
    timeout: float = DEFAULT_TIMEOUT,
    need_buttons: bool = False,
) -> Optional[Message]:
    """Send `text` to the bot and return the first substantive reply."""
    since = datetime.now(timezone.utc)
    await client.send_message(bot, text)
    return await wait_for_response(
        client, bot, since, timeout=timeout, need_buttons=need_buttons
    )


async def click_callback(
    client: TelegramClient,
    bot,
    msg: Message,
    callback_data: str,
    *,
    timeout: float = DEFAULT_TIMEOUT,
) -> Optional[Message]:
    """
    Click the inline button with `callback_data` on `msg` and wait for the
    bot to either edit that message or send a new one.
    """
    if not msg or not msg.reply_markup:
        return None

    clicked = False
    for row in msg.reply_markup.rows:
        for btn in row.buttons:
            data = getattr(btn, "data", None)
            if data:
                d = data.decode() if isinstance(data, bytes) else data
                if d == callback_data:
                    await msg.click(data=data)
                    clicked = True
                    break
        if clicked:
            break

    if not clicked:
        return None

    old_text = msg.text or ""
    old_btns = _get_button_callbacks(msg)
    me = await client.get_me()

    iterations = int(timeout / POLL_INTERVAL)
    for _ in range(iterations):
        await asyncio.sleep(POLL_INTERVAL)

        # Check for an edit on the original message
        edited_list = await client.get_messages(bot, ids=[msg.id])
        if edited_list and edited_list[0]:
            edited = edited_list[0]
            new_text = edited.text or ""
            new_btns = _get_button_callbacks(edited)
            if new_text != old_text or new_btns != old_btns:
                if not _is_loading(new_text):
                    return edited

        # Check for a brand-new message
        recent = await client.get_messages(bot, limit=3)
        for m in recent:
            if m.id == msg.id:
                continue
            if m.sender_id == me.id:
                continue
            if _is_loading(m.text or ""):
                continue
            return m

    return None


async def click_button_by_text(
    client: TelegramClient,
    bot,
    msg: Message,
    text_contains: str,
    *,
    timeout: float = DEFAULT_TIMEOUT,
) -> Optional[Message]:
    """
    Click the first inline button whose label contains `text_contains`
    (case-insensitive) and wait for the bot reply.
    """
    if not msg or not msg.reply_markup:
        return None
    for row in msg.reply_markup.rows:
        for btn in row.buttons:
            if text_contains.lower() in btn.text.lower():
                data = getattr(btn, "data", None)
                if data:
                    d = data.decode() if isinstance(data, bytes) else data
                    return await click_callback(client, bot, msg, d, timeout=timeout)
    return None
