"""Download helpers specific to repurpose — yt-dlp video download."""
from __future__ import annotations

import os
import subprocess


def _download_video(url: str, output_dir: str) -> str:
    """Download video via yt-dlp."""
    output_path = os.path.join(output_dir, "source.mp4")
    try:
        cmd = [
            "yt-dlp",
            "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
            "--merge-output-format", "mp4",
            "-o", output_path,
            "--no-playlist",
            "--socket-timeout", "30",
            url,
        ]
        subprocess.run(cmd, capture_output=True, timeout=180, check=True)
        return output_path if os.path.exists(output_path) else ""
    except Exception as e:
        print(f"    ⚠️ Download failed: {e}")
        return ""