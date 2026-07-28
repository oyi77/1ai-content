"""Download via yt-dlp subprocess with impersonation."""
from __future__ import annotations

import asyncio
import os
import sys

from loguru import logger

from ..cascade import TIKTOK_PROXY


async def dl_ytdlp(url: str, vid_id: str, tmpdir: str, cookies_path: str | None = None) -> dict:
    """Download video via yt-dlp subprocess. Uses impersonation for TikTok."""
    _ytdlp_bin = os.path.join(os.path.dirname(sys.executable), "yt-dlp") if hasattr(sys, "executable") else "yt-dlp"
    if not os.path.exists(_ytdlp_bin):
        _ytdlp_bin = "yt-dlp"

    def _build_cmd(cookies_src: str | None = None) -> list[str]:
        """Build yt-dlp cmd with optional cookies source (file path or --cookies-from-browser)."""
        cmd = [_ytdlp_bin, "--no-check-certificates", "--no-warnings"]
        cmd += ["--impersonate", "Chrome-133"]
        if cookies_src and os.path.exists(cookies_src) and ".txt" in cookies_src:
            cmd += ["--cookies", cookies_src]
        elif cookies_src and cookies_src.startswith("--cookies-from-browser"):
            cmd += cookies_src.split()
        if TIKTOK_PROXY:
            cmd += ["--proxy", TIKTOK_PROXY]
        cmd += ["-f", "bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc]+bestaudio/best[ext=mp4]/best", "-o", os.path.join(tmpdir, f"{vid_id}.mp4"), url]
        return cmd

    async def _run(cmd: list[str]) -> dict:
        """Run yt-dlp subprocess with 20s timeout."""
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            out_path = cmd[cmd.index("-o") + 1] if "-o" in cmd else os.path.join(tmpdir, f"{vid_id}.mp4")
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=20)
            if proc.returncode == 0 and os.path.exists(out_path) and os.path.getsize(out_path) > 10000:
                return {"file_path": out_path, "file_type": "video", "status": "downloaded", "tmpdir": tmpdir}
            if os.path.exists(out_path):
                ftype = "audio" if b"audio" in (stderr or b"") else "unknown"
                os.remove(out_path)
                return {"file_path": None, "file_type": ftype, "status": "failed", "tmpdir": tmpdir, "error": f"ytdlp_returned_{ftype}", "_stderr": stderr}
            return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "ytdlp_failed", "_stderr": stderr}
        except asyncio.TimeoutError:
            return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "ytdlp_timeout"}
        except FileNotFoundError:
            return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "ytdlp_not_installed"}
        except Exception as e:
            return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": f"ytdlp_{type(e).__name__}"}

    # Try 1: with cookies file
    cmd = _build_cmd(cookies_path)
    r = await _run(cmd)
    if r["status"] == "downloaded":
        return r

    # Try 2..N: if failed and looks like TikTok blocking -> retry with browser cookies
    stderr = r.get("_stderr", b"") if isinstance(r.get("_stderr"), bytes) else b""
    blocked_keywords = [b"Your IP address is blocked", b"impersonation", b"cookies", b"403", b"Forbidden", b"Sign in"]
    if any(kw.lower() in stderr.lower() for kw in blocked_keywords):
        _browsers = []
        for _b in ("chromium", "vivaldi", "firefox"):
            _cookie_db = os.path.expanduser(f"~/.config/{_b}/Default/Cookies") if _b != "firefox" else None
            if _cookie_db and os.path.exists(_cookie_db):
                _browsers.append(_b)
        if not _browsers:
            logger.warning("[ytdlp] stderr suggests blocking but no browser cookie DB found — skipping retry")
        for browser in _browsers:
            logger.info(f"[ytdlp] File cookies blocked, retrying with --cookies-from-browser {browser}")
            r = await _run(_build_cmd(f"--cookies-from-browser {browser}"))
            if r["status"] == "downloaded":
                return r

    return {"file_path": None, "file_type": "none", "status": "failed", "tmpdir": tmpdir, "error": "ytdlp_all_methods_failed", "_stderr": stderr}