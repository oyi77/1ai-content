"""Download via Vidbee API (async yt-dlp wrapper)."""
from __future__ import annotations

import asyncio
import os
import subprocess

import httpx

from ..cascade import VIDBEE_URL


async def dl_vidbee(client: httpx.AsyncClient, url: str, vid_id: str, tmpdir: str) -> dict:
    """Download video via Vidbee API (async yt-dlp wrapper)."""
    try:
        r = await client.post(
            f"{VIDBEE_URL}/rpc/downloads/create",
            json={"json": {"url": url, "type": "video"}},
            timeout=10,
        )
        if r.status_code != 200:
            return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}
        task = r.json().get("json", {}).get("download", {})
        task_id = task.get("id", "")
        if not task_id:
            return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}
        # Poll for completion (max ~10s)
        for _ in range(10):
            await asyncio.sleep(1)
            try:
                hist = await client.post(f"{VIDBEE_URL}/rpc/history/list", json={"json": {}}, timeout=5)
                if hist.status_code == 200:
                    items = hist.json().get("json", {}).get("history", [])
                    for item in items:
                        if item.get("id") == task_id:
                            st = item.get("status", "")
                            if st == "completed" and item.get("savedFileName"):
                                saved = item.get("savedFileName", "")
                                host_path = os.path.join(tmpdir, f"{vid_id}.mp4")
                                container_path = f"/data/downloads/{saved}"
                                try:
                                    subprocess.run(["docker", "cp", f"vidbee-api-1:{container_path}", host_path], capture_output=True, timeout=10)
                                    if os.path.exists(host_path) and os.path.getsize(host_path) > 10000:
                                        return {"file_path": host_path, "file_type": "video", "status": "downloaded", "tmpdir": tmpdir}
                                except Exception:
                                    pass
                            if st in ("error", "failed"):
                                return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}
            except Exception:
                continue
    except Exception:
        pass
    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir}