"""
Shared helpers for router modules — ffprobe helpers and processed-videos DB path.

Extracted from services.api to break circular import:
  services.api → services.routers.download → services.api
"""

import asyncio
import json
import os
import subprocess

_PROCESSED_VIDEOS_DB = os.path.join(
    os.environ.get("DATA_DIR", "/tmp"), "processed_videos.db"
)


async def _run_subprocess(cmd: list[str], **kwargs):
    """Run subprocess in thread pool to avoid blocking the event loop."""
    return await asyncio.to_thread(lambda: subprocess.run(cmd, **kwargs))


async def _probe_video(file_path: str) -> dict:
    """Run ffprobe and return structured video metadata."""
    try:
        probe = await _run_subprocess(
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


async def _probe_field(file_path: str, field: str, stream_index: int = 0) -> str:
    """Probe a specific ffprobe field (e.g. pix_fmt) from the first video stream."""
    try:
        probe = await _run_subprocess(
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
