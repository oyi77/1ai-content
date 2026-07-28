"""Reka video processing functions — scene detection, segmentation, classification."""
from __future__ import annotations

import re
import subprocess

from ..utils import _get_duration, _is_sentence_end


HOOK_KEYWORDS = [
    "tahukah", "pernah", "gimana", "coba", "lihat", "check", "wait",
    "did you know", "have you ever", "watch this", "check this out",
    "you won't believe", "here's why", "this is crazy",
]
CTA_KEYWORDS = [
    "follow", "like", "share", "comment", "subscribe", "save",
    "ikuti", "like", "share", "komen", "subscribe", "simpan",
    "link di bio", "check link", "link in bio",
]
EXAMPLE_KEYWORDS = [
    "contoh", "misalnya", "seperti", "for example", "such as",
    "here's how", "begini caranya", "seperti ini",
]


def _detect_scenes(ffmpeg: str, ffprobe: str, video_path: str) -> list[dict]:
    """Detect scene changes using FFmpeg's scene filter."""
    try:
        cmd = [
            ffmpeg, "-i", video_path,
            "-vf", "select='gt(scene,0.3)',showinfo",
            "-vsync", "vfr",
            "-f", "null", "-",
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

        scenes = []
        for line in result.stderr.split("\n"):
            if "pts_time:" in line:
                match = re.search(r"pts_time:(\d+\.?\d*)", line)
                if match:
                    scenes.append(float(match.group(1)))

        duration = _get_duration(ffprobe, video_path)
        boundaries = [0] + scenes + [duration]
        return [
            {"start": boundaries[i], "end": boundaries[i + 1]}
            for i in range(len(boundaries) - 1)
        ]
    except Exception:
        return []


def _transcript_based_segments(transcript: dict, duration: float) -> list[dict]:
    """Create segments from transcript sentence boundaries."""
    transcript_segments = transcript.get("segments", [])
    if not transcript_segments:
        return []

    scenes = []
    current_start = 0
    current_text = ""

    for seg in transcript_segments:
        seg_end = seg.get("end", 0)
        seg_text = seg.get("text", "").strip()
        current_text += " " + seg_text

        elapsed = seg_end - current_start
        if elapsed >= 8 and (elapsed >= 20 or _is_sentence_end(seg_text)):
            scenes.append({"start": current_start, "end": seg_end})
            current_start = seg_end
            current_text = ""

    if current_start < duration - 2:
        scenes.append({"start": current_start, "end": duration})

    return scenes


def _equal_chunks(duration: float, target_duration: int) -> list[dict]:
    """Split into equal chunks as fallback."""
    chunk_size = min(15, duration / max(3, int(duration / 15)))
    chunks = []
    t = 0
    while t < duration:
        end = min(t + chunk_size, duration)
        chunks.append({"start": t, "end": end})
        t = end
    return chunks


def _get_text_for_range(transcript_segments: list[dict], start: float, end: float) -> str:
    """Extract transcript text overlapping with a time range."""
    texts = []
    for seg in transcript_segments:
        seg_start = seg.get("start", 0)
        seg_end = seg.get("end", 0)
        if seg_end >= start and seg_start <= end:
            texts.append(seg.get("text", "").strip())
    return " ".join(texts)


def _classify_segment(text: str, start: float, total_duration: float) -> str:
    """Classify segment by position and content."""
    text_lower = text.lower()

    if start < 5 or any(w in text_lower for w in HOOK_KEYWORDS):
        return "hook"
    if start > total_duration - 15 or any(w in text_lower for w in CTA_KEYWORDS):
        return "cta"
    if any(w in text_lower for w in EXAMPLE_KEYWORDS):
        return "example"
    return "explanation"