"""Download helpers — _dl_url() URL downloader and PICSUM_URL constant."""
from __future__ import annotations

import os

import httpx

PICSUM_URL = "https://picsum.photos"


async def _dl_url(client: httpx.AsyncClient, url: str, vid_id: str, tmpdir: str, ext: str, referer: str = "") -> dict:
    """Download a URL to a file."""
    try:
        headers = {"Referer": referer} if referer else {}
        r = await client.get(url, headers=headers, timeout=30)
        if r.status_code == 200 and len(r.content) > 1024:
            fp = os.path.join(tmpdir, f"tiktok_{vid_id}.{ext}")
            with open(fp, "wb") as f:
                f.write(r.content)
            return {"file_path": fp, "status": "downloaded", "tmpdir": tmpdir}
    except Exception:
        pass
    return {"file_path": None, "status": "failed", "tmpdir": tmpdir}