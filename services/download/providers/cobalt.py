"""Download via Cobalt API — tries local, then public instances."""
from __future__ import annotations

import httpx
from loguru import logger

from ..cascade import COBALT_URL, COBALT_PUBLIC_INSTANCES
from ..utils import _dl_url


async def dl_cobalt(client: httpx.AsyncClient, url: str, vid_id: str, tmpdir: str) -> dict:
    """Download video via Cobalt API — tries local, then public instances."""
    instances = [COBALT_URL] + COBALT_PUBLIC_INSTANCES
    for instance in instances:
        try:
            logger.info(f"[cobalt] Trying {instance}...")
            r = await client.post(
                f"{instance}/",
                json={"url": url, "videoQuality": "720"},
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                timeout=8,
            )
            if r.status_code != 200:
                continue
            data = r.json()
            status = data.get("status", "")
            if status in ("tunnel", "redirect"):
                dl_url = data.get("url", "")
                if dl_url:
                    result = await _dl_url(client, dl_url, vid_id, tmpdir, "mp4")
                    if result["status"] == "downloaded":
                        result["file_type"] = "video"
                        return result
        except Exception as e:
            logger.debug(f"[cobalt] {instance} failed: {e}")
            continue
    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}