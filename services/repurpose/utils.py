"""Shared helpers for the Repurpose Engine — ffprobe, cleanup, SRT formatting."""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path


def _get_duration(ffprobe: str, file_path: str) -> float:
    """Get media duration via ffprobe."""
    try:
        cmd = [
            ffprobe, "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return float(result.stdout.strip())
    except Exception:
        return 0


def _cleanup_temp(work_dir: str, keep_path: str, thumbnail_path: str):
    """Remove intermediate temp files, keep final output."""
    for f in Path(work_dir).glob("seg_*.mp4"):
        if str(f) != keep_path:
            f.unlink(missing_ok=True)
    for f in Path(work_dir).glob("faded_*.mp4"):
        f.unlink(missing_ok=True)
    for f in Path(work_dir).glob("source_*"):
        if f.is_dir():
            shutil.rmtree(f, ignore_errors=True)


def _fmt_srt(seconds: float) -> str:
    """Format seconds to SRT timestamp."""
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    ms = int((seconds % 1) * 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def _is_sentence_end(text: str) -> bool:
    """Check if text ends with sentence-ending punctuation."""
    text = text.strip()
    return bool(text) and text[-1] in ".!?"