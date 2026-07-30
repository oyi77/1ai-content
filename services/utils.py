"""Shared utilities for router modules — ffprobe helpers and processed-videos DB path.

Extracted from services.routers._shared to provide a canonical public API.
"""

import asyncio
import json
import os
import subprocess

PROCESSED_VIDEOS_DB = os.path.join(
    os.environ.get("DATA_DIR", "/tmp"), "processed_videos.db"
)


async def run_subprocess(cmd: list[str], **kwargs):
    """Run subprocess in thread pool to avoid blocking the event loop."""
    return await asyncio.to_thread(lambda: subprocess.run(cmd, **kwargs))


async def probe_video(file_path: str) -> dict:
    """Run ffprobe and return structured video metadata."""
    try:
        probe = await run_subprocess(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", file_path],
            capture_output=True, text=True, timeout=10,
        )
        if probe.returncode != 0:
            return {}
        meta = json.loads(probe.stdout)
        duration = 0.0
        width = 0
        height = 0
        video_codec = ""
        audio_codec = ""
        for stream in meta.get("streams", []):
            if stream.get("codec_type") == "video":
                width = int(stream.get("width", 0))
                height = int(stream.get("height", 0))
                video_codec = stream.get("codec_name", "").lower()
                duration = float(meta.get("format", {}).get("duration", 0))
            elif stream.get("codec_type") == "audio":
                audio_codec = stream.get("codec_name", "")
        return {
            "duration": duration,
            "width": width,
            "height": height,
            "video_codec": video_codec,
            "audio_codec": audio_codec,
        }
    except Exception:
        return {}


async def probe_field(file_path: str, field: str, stream_index: int = 0) -> str:
    """Probe a specific ffprobe field (e.g. pix_fmt) from the first video stream."""
    try:
        probe = await run_subprocess(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", file_path],
            capture_output=True, text=True, timeout=10,
        )
        if probe.returncode != 0:
            return ""
        meta = json.loads(probe.stdout)
        streams = meta.get("streams", [])
        for s in streams:
            if s.get("codec_type") == "video":
                return s.get(field, "")
        return ""
    except Exception:
        return ""


# ── TikTok cookie helpers ───────────────────────────────────────

TIKTOK_BROWSERS = ["chromium", "vivaldi", "firefox"]
"""Browser names to try, in order, for cookie extraction."""


async def extract_browser_cookies(browser: str, cookies_path: str) -> dict:
    """Try extracting cookies from one browser. Returns result dict."""
    cmd = [
        "yt-dlp",
        "--cookies-from-browser", browser,
        "--cookies", cookies_path,
        "--flat-playlist",
        "--dump-json",
        "https://www.tiktok.com/@_",  # dummy — fails but cookies written before error
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
    except asyncio.TimeoutError:
        return {"browser": browser, "status": "timeout"}
    except FileNotFoundError:
        return {"browser": browser, "status": "not_found"}
    except Exception as e:
        return {"browser": browser, "status": "error", "message": f"{type(e).__name__}: {e}"}

    return {"browser": browser, "status": "ok", "returncode": proc.returncode}


def has_tiktok_cookies(path: str) -> bool:
    """Check if cookie file contains at least one .tiktok.com entry."""
    try:
        with open(path) as f:
            for line in f:
                if line.startswith(".tiktok.com\t"):
                    return True
    except Exception:
        pass
    return False