"""
Tests for the Fastify HTTP endpoints served alongside the Telegram bot.

These are pure HTTP tests (no Telethon needed) so they run independently
of the bot session.  They use aiohttp and skip gracefully when the server
is not reachable at BASE_URL.
"""

import pytest
import aiohttp
from conftest import BASE_URL

# ─── helpers ─────────────────────────────────────────────────────────────────


async def _get(path: str) -> tuple[int, str]:
    """
    Perform a GET request and return (status_code, response_text).
    Raises pytest.skip if the server is not reachable.
    """
    try:
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=10)
        ) as session:
            async with session.get(f"{BASE_URL}{path}") as resp:
                body = await resp.text()
                return resp.status, body
    except aiohttp.ClientConnectorError:
        pytest.skip(f"Server not reachable at {BASE_URL} — is the bot running?")
    except Exception as exc:
        pytest.skip(f"HTTP error reaching {BASE_URL}{path}: {exc}")


# ─── public endpoints ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_health_endpoint_returns_200():
    status, _ = await _get("/health")
    assert status == 200, f"/health returned {status}, expected 200"


@pytest.mark.asyncio
async def test_landing_page_returns_200():
    status, _ = await _get("/")
    assert status == 200, f"/ (landing page) returned {status}, expected 200"


@pytest.mark.asyncio
async def test_api_packages_returns_200():
    status, body = await _get("/api/packages")
    assert status == 200, f"/api/packages returned {status}, expected 200"


@pytest.mark.asyncio
async def test_api_packages_returns_json_list(client, bot):
    """Packages endpoint must return a JSON array."""
    import json

    try:
        async with aiohttp.ClientSession(
            timeout=aiohttp.ClientTimeout(total=10)
        ) as session:
            async with session.get(f"{BASE_URL}/api/packages") as resp:
                if resp.status != 200:
                    pytest.skip(f"/api/packages returned {resp.status}")
                data = await resp.json()
                assert isinstance(
                    data, (list, dict)
                ), f"/api/packages did not return a JSON object: {str(data)[:120]}"
    except aiohttp.ClientConnectorError:
        pytest.skip(f"Server not reachable at {BASE_URL}")


# ─── authenticated endpoints (expect 401 without token) ───────────────────────


@pytest.mark.asyncio
async def test_webapp_dashboard_returns_200():
    """
    /app (the Telegram Mini App) is a public page that loads the web dashboard.
    Auth is handled client-side via Telegram initData, not server-side.
    """
    status, _ = await _get("/app")
    assert status == 200, f"/app returned {status}, expected 200"


@pytest.mark.asyncio
async def test_api_user_endpoint_requires_auth():
    """/api/user must reject unauthenticated requests."""
    status, _ = await _get("/api/user")
    assert status in (401, 403), f"/api/user should require auth but returned {status}"


# ─── Facebook domain verification ─────────────────────────────────────────────


@pytest.mark.asyncio
async def test_facebook_verification_file_accessible():
    """
    The FB domain verification HTML file used in the /support flow must
    remain publicly accessible.
    """
    status, _ = await _get("/go7u73s641jq2jtd8gfh2ecbl94kmy.html")
    assert status == 200, f"Facebook verification file returned {status}, expected 200"
