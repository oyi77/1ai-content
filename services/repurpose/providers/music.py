"""Music/audio processing functions — remixing, volume balancing, voiceover."""
from __future__ import annotations

import os
import subprocess


def _remix_audio(
    ffmpeg: str,
    video_path: str,
    bgm_path: str | None,
    bgm_volume: float,
    voiceover_path: str | None,
    work_dir: str,
) -> str:
    """Remix audio: mix video audio with BGM and/or voiceover."""
    output_path = os.path.join(work_dir, "audio_remixed.mp4")

    inputs = ["-i", video_path]
    filter_parts = []

    if bgm_path and os.path.exists(bgm_path):
        inputs.extend(["-i", bgm_path])
        bgm_idx = len(inputs) // 2 - 1
        filter_parts.append(
            f"[0:a]volume=1.0[orig];"
            f"[{bgm_idx}:a]volume={bgm_volume},aloop=loop=-1:size=2e+09[bgm];"
            f"[orig][bgm]amix=inputs=2:duration=shortest[aout]"
        )
    elif voiceover_path and os.path.exists(voiceover_path):
        inputs.extend(["-i", voiceover_path])
        vo_idx = len(inputs) // 2 - 1
        filter_parts.append(
            f"[0:a]volume=0.3[orig];"
            f"[{vo_idx}:a]volume=1.0[vo];"
            f"[orig][vo]amix=inputs=2:duration=shortest[aout]"
        )
    else:
        return video_path

    filter_complex = ";".join(filter_parts)

    cmd = [
        ffmpeg, "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", "0:v",
        "-map", "[aout]",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "192k",
        output_path,
    ]

    try:
        subprocess.run(cmd, capture_output=True, timeout=300, check=True)
        return output_path if os.path.exists(output_path) else video_path
    except Exception:
        return video_path