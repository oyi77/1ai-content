"""Download via tikwm.com API."""
from __future__ import annotations

import httpx

from ..cascade import TIKWM_API_URL
from ..utils import _dl_url


async def dl_tikwm(client: httpx.AsyncClient, url: str, vid_id: str, tmpdir: str) -> dict:
    """Download video via tikwm.com API."""
    try:
        r = await client.get(TIKWM_API_URL, params={"url": url}, timeout=15)
        if r.status_code == 200:
            d = r.json()
            if d.get("code") == 0:
                dl_url = d["data"].get("play") or d["data"].get("wmplay") or ""
                if dl_url:
                    result = await _dl_url(client, dl_url, vid_id, tmpdir, "mp4", referer="https://www.tikwm.com/")
                    if result["status"] == "downloaded":
                        result["file_type"] = "video"
                        return result
    except Exception:
        pass
    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}