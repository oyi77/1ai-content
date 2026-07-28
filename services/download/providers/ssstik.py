"""Download via ssstik.io — no watermark, no browser needed."""
from __future__ import annotations

import asyncio
import os
import re
from urllib.parse import quote as url_quote

import httpx
from loguru import logger


# ── Broken-state cache (module-level) ─────────────────────────────
_SSSTIK_BROKEN_CHECKED: bool = False
_SSSTIK_BROKEN: bool = False
_ssstik_cache_time: float = 0.0
_SSSTIK_CACHE_TTL: float = 300.0  # re-check every 5 minutes


async def _ssstik_is_broken() -> bool:
    """Check if ssstik.io is broken (TikTok changed page structure). Re-checks every 5 min."""
    global _SSSTIK_BROKEN_CHECKED, _SSSTIK_BROKEN, _ssstik_cache_time
    now = asyncio.get_event_loop().time()
    if _SSSTIK_BROKEN_CHECKED and (now - _ssstik_cache_time) < _SSSTIK_CACHE_TTL:
        return _SSSTIK_BROKEN
    _SSSTIK_BROKEN_CHECKED = True
    _ssstik_cache_time = now
    _SSSTIK_BROKEN = False  # reset — try again
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True, verify=False) as c:
            r = await c.get("https://ssstik.io/id", headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0",
            })
            if "changed something" in r.text:
                _SSSTIK_BROKEN = True
    except Exception:
        pass  # transient error — don't mark permanently broken
    return _SSSTIK_BROKEN


async def dl_ssstik(video_url: str, vid_id: str, tmpdir: str) -> dict:
    """Download video via ssstik.io API — no watermark, no browser needed.

    Uses direct POST to the HTMX endpoint and parses the response HTML
    for the tikcdn.io download link. Works without cookies or session token.

    NOTE: Since ~July 2026, ssstik.io returns "TikTok changed something on
    their website" — this method is short-circuited when the homepage check
    confirms the service is broken.
    """
    # Fast pre-check — skip if ssstik is known broken
    if await _ssstik_is_broken():
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "ssstik_broken_skip"}

    os.makedirs(tmpdir, exist_ok=True)
    fp = os.path.join(tmpdir, f"ssstik_{vid_id}.mp4")
    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True, verify=False) as client:
            # Step 1: POST TikTok URL to ssstik.io HTMX endpoint
            body = f"id={url_quote(video_url)}&locale=id&tt=&debug=ab%3D1%26loc%3DID%26ip%3D192.88.101.14"
            r = await client.post(
                "https://ssstik.io/abc?url=dl",
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0",
                    "Accept": "*/*",
                    "Content-Type": "application/x-www-form-urlencoded",
                    "HX-Request": "true",
                    "HX-Trigger": "_gcaptcha_pt",
                    "HX-Target": "target",
                    "HX-Current-URL": "https://ssstik.io/id",
                    "Origin": "https://ssstik.io",
                    "Referer": "https://ssstik.io/id",
                },
                content=body,
                timeout=30.0,
            )
            if r.status_code != 200:
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"ssstik_http_{r.status_code}"}

            # Step 2: Extract download link from HTML response
            html = r.text
            links = re.findall(r'href="(https://tikcdn\.io/ssstik/[^"]+)"', html)
            video_links = [l for l in links if "/ssstik/" in l]
            if not video_links:
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "ssstik_no_link"}

            # Step 3: Download the video with proper browser headers
            dl_url = video_links[0]
            async with httpx.AsyncClient(timeout=120.0, follow_redirects=True, verify=False) as dl_client:
                vr = await dl_client.get(
                    dl_url,
                    headers={
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
                        "Referer": "https://ssstik.io/",
                        "Accept": "video/webm,video/mp4,video/*,*/*",
                        "Accept-Language": "en-US,en;q=0.9",
                    },
                )
                if vr.status_code == 200 and len(vr.content) > 10000:
                    with open(fp, "wb") as f:
                        f.write(vr.content)
                    return {"file_path": fp, "file_type": "video", "status": "downloaded", "tmpdir": tmpdir}
                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"ssstik_dl_{vr.status_code}"}
    except Exception as e:
        logger.warning(f"[ssstik] Error: {type(e).__name__}: {e}")
        return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"ssstik_{type(e).__name__}"}