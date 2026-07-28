"""1ai-content Download Engine — cascade orchestration and all env constants.

Cascade: snaptik -> ssstik -> tikwm -> oembed -> placeholder
Each method returns {file_path, file_type, status, reason, tmpdir}.
"""
from __future__ import annotations

import asyncio
import os
import tempfile

import httpx
from loguru import logger

# ── External API URLs (configurable via env) ────────────────────────

TIKWM_API_URL = os.getenv("TIKWM_API_URL", "https://www.tikwm.com/api/")
VIDBEE_URL = os.getenv("VIDBEE_URL", "http://localhost:3101")
COBALT_URL = os.getenv("COBALT_URL", "http://localhost:9000")
COBALT_PUBLIC_INSTANCES = [
    "https://co.eepy.today",
]
_proxy_host = os.getenv("TIKTOK_PROXY", "")
_proxy_user = os.getenv("TIKTOK_PROXY_USER", "")
_proxy_pass = os.getenv("TIKTOK_PROXY_PASS", "")
if _proxy_host and _proxy_user and _proxy_pass:
    TIKTOK_PROXY = f"http://{_proxy_user}:{_proxy_pass}@{_proxy_host}"
else:
    TIKTOK_PROXY = _proxy_host  # fallback: bare host or empty
TIKTOK_OEMBED = os.getenv("TIKTOK_OEMBED", "https://www.tiktok.com/oembed")

# ── Provider imports ───────────────────────────────────────────────

from .providers.tikwm import dl_tikwm  # noqa: E402
from .providers.ytdlp import dl_ytdlp  # noqa: E402
from .providers.cobalt import dl_cobalt  # noqa: E402
from .providers.vidbee import dl_vidbee  # noqa: E402
from .providers.browser import dl_cloakbrowser, dl_playwright_direct  # noqa: E402
from .providers.ssstik import dl_ssstik  # noqa: E402
from .providers.snaptik import dl_snaptik  # noqa: E402
from .providers.scrape import scrape_tiktok_page, convert_slideshow_to_video, convert_slideshow_to_video_remotion  # noqa: E402
from .providers.fallback import dl_oembed, dl_placeholder  # noqa: E402
from .utils import _dl_url  # noqa: E402


# ── Cascade ─────────────────────────────────────────────────────────


async def download_video(video_url: str, category: str = "general") -> dict:
    """Download a single video with full cascade fallback.

    Cascade: snaptik -> ssstik -> tikwm -> oembed -> placeholder
    Overall timeout: 45s (reduced from 120s — parallel wave completes in ~20s).
    Returns {file_path, file_type, status, reason, tmpdir}.
    """
    logger.info(f"[download] Starting download for {video_url} (category={category})")
    tmpdir = tempfile.mkdtemp(prefix="1ai_content_")
    vid_id = video_url.rstrip("/").split("/")[-1] if video_url else "unknown"

    if not video_url:
        return {**await dl_placeholder(None, category, tmpdir), "reason": "no_video_url"}

    try:
        return await asyncio.wait_for(
            _download_cascade(video_url, category, tmpdir, vid_id),
            timeout=45.0,
        )
    except asyncio.TimeoutError:
        logger.error(f"[download] Global timeout (45s) downloading {video_url}")
        import shutil
        shutil.rmtree(tmpdir, ignore_errors=True)
        return {"file_path": None, "file_type": "none", "status": "failed", "reason": "timeout_45s", "tmpdir": tmpdir}


async def _download_cascade(video_url: str, category: str, tmpdir: str, vid_id: str) -> dict:
    """Inner cascade — fast parallel fallback.

    Strategy:
      1. Try snaptik + ssstik + tikwm in parallel (max 15s) — TikTok-specific & general.
      2. Try oembed thumbnail (max 5s).
      3. Fallback to placeholder.

    Skipped (confirmed dead for TikTok as of 2026-07):
      - yt-dlp: "Unable to extract universal data" — TikTok API changed
      - Cobalt: public instances unreachable
      - Vidbee: Docker-dependent, unreliable
      - CloakBrowser/Playwright: headless detection blocks
      - scrape/cover: redundant with oembed

    Returns {file_path, file_type, status, reason, tmpdir}.
    """
    is_tiktok = "tiktok.com" in video_url
    errors: list[str] = []

    # ── Reusable client with per-method timeout handled by _try ─────
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True, verify=False, proxy=TIKTOK_PROXY or None) as client:

        # ── Round 1: parallel download tries (15s) ──────────────────
        async def _try(method_name: str, coro) -> dict:
            try:
                return await asyncio.wait_for(coro, timeout=15)
            except (asyncio.TimeoutError, Exception):
                return {"status": "failed", "error": f"{method_name}_failed"}

        round1: list[asyncio.Task] = []

        # 1a. snaptik (TikTok only — no watermark, most reliable)
        if is_tiktok:
            round1.append(asyncio.ensure_future(
                _try("snaptik", dl_snaptik(video_url, vid_id, tmpdir))
            ))

        # 1b. ssstik (TikTok only — no watermark, confirmed working 2026-07)
        if is_tiktok:
            round1.append(asyncio.ensure_future(
                _try("ssstik", dl_ssstik(video_url, vid_id, tmpdir))
            ))

        # 1c. tikwm (TikTok only — 576x1024, lower quality)
        if is_tiktok:
            round1.append(asyncio.ensure_future(
                _try("tikwm", dl_tikwm(client, video_url, vid_id, tmpdir))
            ))

        if round1:
            done, pending = await asyncio.wait(round1, return_when=asyncio.ALL_COMPLETED)
            for t in done:
                r = t.result()
                if r["status"] == "downloaded":
                    # Cancel any remaining pending tasks
                    for p in pending:
                        p.cancel()
                    r["reason"] = f"parallel_{r.get('reason', 'ok')}"
                    return r

            for t in round1:
                if t.done() and not t.cancelled():
                    try:
                        r = t.result()
                        errors.append(f"round1_{r.get('reason', r.get('error', 'failed'))}")
                    except Exception as e:
                        errors.append(f"round1_{type(e).__name__}")

        # ── Round 2: oembed thumbnail (5s) ──────────────────────────
        if is_tiktok:
            r = await dl_oembed(client, video_url, vid_id, tmpdir)
            if r["status"] == "downloaded":
                r["reason"] = "oembed_thumbnail"
                return r
            errors.append(f"oembed={r.get('error', 'failed')}")

        # ── Fallback: placeholder ───────────────────────────────────
        err_summary = "_".join(errors[-3:]) if errors else "unknown"
        return {**await dl_placeholder(client, category, tmpdir), "reason": f"all_failed_{err_summary}"}