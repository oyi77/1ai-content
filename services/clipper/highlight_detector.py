#!/usr/bin/env python3
"""
Highlight Detector — LLM-powered viral moment detection for video transcripts.

Analyzes full transcripts with word-level timestamps to identify the most
engaging, shareable segments. Each clip is scored on hook strength, emotional
peak, information density, and surprise factor.

Usage:
    from services.clipper.highlight_detector import HighlightDetector
    detector = HighlightDetector()
    result = detector.detect_highlights(transcript, num_clips=5, platform="tiktok")
    metadata = detector.generate_clip_metadata(result["clips"][0], platform="tiktok")
"""

import json
import os
import re
import httpx
from typing import Optional

OMNIRoute_URL = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")

PLATFORM_DEFAULTS: dict[str, dict] = {
    "tiktok": {"clip_duration": 60, "max_title": 100, "hashtag_count": 6},
    "youtube": {"clip_duration": 60, "max_title": 70, "hashtag_count": 8},
    "instagram": {"clip_duration": 30, "max_title": 100, "hashtag_count": 10},
    "facebook": {"clip_duration": 60, "max_title": 80, "hashtag_count": 5},
}


class HighlightDetector:
    """LLM-powered viral moment detection for video transcripts."""

    def __init__(self) -> None:
        self.omniroute_url: str = OMNIRoute_URL

    # ── LLM CALL ──────────────────────────────────────────────────

    def _call_llm(self, prompt: str, max_tokens: int = 2000) -> str:
        """Call OmniRoute LLM for highlight analysis."""
        try:
            resp = httpx.post(
                f"{self.omniroute_url}/chat/completions",
                json={
                    "model": "auto/best-chat",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": 0.7,
                },
                timeout=120,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"⚠️ LLM call failed: {e}")
            return ""

    # ── HIGHLIGHT DETECTION ───────────────────────────────────────

    def detect_highlights(
        self,
        transcript: dict,
        num_clips: int = 5,
        clip_duration: int = 60,
        platform: str = "tiktok",
    ) -> dict:
        """Identify the most viral moments in a transcript using LLM analysis.

        Args:
            transcript: Transcript dict from Transcriber with segments and word timestamps.
                Expected shape: {"segments": [{"start": float, "end": float, "text": str,
                "words": [{"word": str, "start": float, "end": float}]}]}
            num_clips: Number of clips to extract (default 5).
            clip_duration: Target clip length in seconds (30 for shorts, 60 for standard).
            platform: Target platform — tiktok, youtube, instagram, facebook.

        Returns:
            dict with keys: success, clips[], total_clips.
            Each clip: {start, end, score, hook_text, title, description, virality_reason}.
        """
        platform = platform.lower()
        segments = transcript.get("segments", [])
        if not segments:
            return {"success": False, "error": "No segments in transcript", "clips": [], "total_clips": 0}

        # Build flat word list with timestamps for precise snapping
        words = self._extract_words(segments)
        if not words:
            return {"success": False, "error": "No word-level timestamps in transcript", "clips": [], "total_clips": 0}

        full_text = " ".join(w["word"] for w in words)
        total_duration = words[-1]["end"] if words else 0

        # Build a timestamped text block so the LLM can reference actual times
        timestamped = self._build_timestamped_text(words)

        prompt = f"""You are a viral content analyst specializing in short-form video clips.

Below is a full video transcript with word-level timestamps (in seconds).
Identify the {num_clips} best segments to clip as standalone {platform} videos.
Each clip should be approximately {clip_duration} seconds long.

TRANSCRIPT WITH TIMESTAMPS:
{timestamped}

TOTAL VIDEO DURATION: {total_duration:.1f} seconds

SCORING CRITERIA (rate each 1-10):
- hook_strength: Does the opening grab attention in the first 3 seconds?
- emotional_peak: Does it evoke strong emotion (awe, anger, laughter, surprise)?
- information_density: Is there a high ratio of interesting content per second?
- surprise_factor: Does it contain unexpected twists, revelations, or counter-intuitive claims?

SELECTION RULES:
- Clips MUST start and end at natural sentence boundaries (use word timestamps).
- Each clip should work as a standalone video that makes sense without context.
- Prefer clips with a strong opening hook (question, bold claim, shocking fact).
- Avoid overlap — clips should cover different moments.
- clip start/end times MUST use exact word timestamps from the transcript.
- Clips MUST NOT exceed the video's total duration ({total_duration:.1f}s).

Return ONLY valid JSON (no markdown, no explanation):
{{
  "clips": [
    {{
      "start": 12.5,
      "end": 72.3,
      "score": 8.5,
      "hook_strength": 9,
      "emotional_peak": 8,
      "information_density": 7,
      "surprise_factor": 9,
      "hook_text": "The exact opening words of this clip",
      "title": "Catchy title for this clip",
      "description": "Short description of why this is engaging",
      "virality_reason": "Why this specific moment would go viral"
    }}
  ]
}}"""

        llm_response = self._call_llm(prompt, max_tokens=3000)
        if not llm_response:
            return {"success": False, "error": "LLM call failed", "clips": [], "total_clips": 0}

        try:
            json_match = re.search(r'\{[\s\S]*\}', llm_response)
            if not json_match:
                return {"success": False, "error": "No JSON found in response", "clips": [], "total_clips": 0, "raw": llm_response}
            data = json.loads(json_match.group())
        except json.JSONDecodeError:
            return {"success": False, "error": "Invalid JSON from LLM", "clips": [], "total_clips": 0, "raw": llm_response}

        raw_clips = data.get("clips", [])
        clips = []
        for clip in raw_clips:
            # Snap start/end to nearest word boundaries
            start = self._snap_to_word(clip.get("start", 0), words, snap="start")
            end = self._snap_to_word(clip.get("end", start + clip_duration), words, snap="end")
            # Clamp to video bounds
            start = max(0.0, start)
            end = min(end, total_duration)
            if end <= start:
                continue

            # Compute composite score from sub-scores
            hook = clip.get("hook_strength", 5)
            emotion = clip.get("emotional_peak", 5)
            density = clip.get("information_density", 5)
            surprise = clip.get("surprise_factor", 5)
            composite = round((hook * 0.35 + emotion * 0.25 + surprise * 0.25 + density * 0.15), 1)

            clips.append({
                "start": round(start, 2),
                "end": round(end, 2),
                "score": clip.get("score", composite),
                "hook_strength": hook,
                "emotional_peak": emotion,
                "information_density": density,
                "surprise_factor": surprise,
                "hook_text": clip.get("hook_text", ""),
                "title": clip.get("title", ""),
                "description": clip.get("description", ""),
                "virality_reason": clip.get("virality_reason", ""),
            })

        # Sort by score descending, take top num_clips
        clips.sort(key=lambda c: c["score"], reverse=True)
        clips = clips[:num_clips]

        return {
            "success": True,
            "clips": clips,
            "total_clips": len(clips),
        }

    # ── CLIP METADATA ─────────────────────────────────────────────

    def generate_clip_metadata(
        self,
        clip: dict,
        platform: str = "tiktok",
    ) -> dict:
        """Generate SEO metadata for a highlight clip.

        Args:
            clip: Clip dict from detect_highlights (has title, description, hook_text, etc.).
            platform: Target platform — tiktok, youtube, instagram, facebook.

        Returns:
            dict with keys: title, description, hashtags, caption, cover_text.
        """
        platform = platform.lower()
        defaults = PLATFORM_DEFAULTS.get(platform, PLATFORM_DEFAULTS["tiktok"])

        prompt = f"""You are a social media SEO specialist for {platform.upper()}.

Generate optimized metadata for this video clip:

TITLE: {clip.get("title", "")}
DESCRIPTION: {clip.get("description", "")}
HOOK: {clip.get("hook_text", "")}
VIRALITY REASON: {clip.get("virality_reason", "")}
SCORE: {clip.get("score", 0)}

PLATFORM: {platform}
MAX TITLE LENGTH: {defaults["max_title"]} characters

Generate:
1. title — optimized for {platform} (max {defaults["max_title"]} chars, use power words, numbers, curiosity gaps)
2. description — engaging description with keywords (2-3 sentences)
3. hashtags — exactly {defaults["hashtag_count"]} relevant hashtags (include trending + niche)
4. caption — on-screen caption text for the first 3 seconds (short, punchy, ALL CAPS ok)
5. cover_text — text overlay for thumbnail/cover image (2-5 words, bold statement)

Return ONLY valid JSON (no markdown, no explanation):
{{
  "title": "...",
  "description": "...",
  "hashtags": ["#tag1", "#tag2"],
  "caption": "...",
  "cover_text": "..."
}}"""

        llm_response = self._call_llm(prompt, max_tokens=1000)
        if not llm_response:
            return {
                "success": False,
                "error": "LLM call failed",
                "title": clip.get("title", ""),
                "description": clip.get("description", ""),
                "hashtags": [],
                "caption": clip.get("hook_text", ""),
                "cover_text": "",
            }

        try:
            json_match = re.search(r'\{[\s\S]*\}', llm_response)
            if not json_match:
                return {"success": False, "error": "No JSON in response", "title": clip.get("title", ""), "description": clip.get("description", ""), "hashtags": [], "caption": clip.get("hook_text", ""), "cover_text": ""}
            data = json.loads(json_match.group())
        except json.JSONDecodeError:
            return {"success": False, "error": "Invalid JSON from LLM", "title": clip.get("title", ""), "description": clip.get("description", ""), "hashtags": [], "caption": clip.get("hook_text", ""), "cover_text": ""}

        # Enforce hashtag format
        hashtags = data.get("hashtags", [])
        hashtags = [h if h.startswith("#") else f"#{h}" for h in hashtags]

        return {
            "success": True,
            "title": data.get("title", clip.get("title", "")),
            "description": data.get("description", clip.get("description", "")),
            "hashtags": hashtags[:defaults["hashtag_count"]],
            "caption": data.get("caption", clip.get("hook_text", "")),
            "cover_text": data.get("cover_text", ""),
        }

    # ── INTERNAL HELPERS ──────────────────────────────────────────

    def _extract_words(self, segments: list) -> list[dict]:
        """Extract flat word list with timestamps from transcript segments."""
        words = []
        for seg in segments:
            seg_words = seg.get("words", [])
            if seg_words:
                for w in seg_words:
                    words.append({
                        "word": w.get("word", w.get("text", "")),
                        "start": w.get("start", 0.0),
                        "end": w.get("end", 0.0),
                    })
            else:
                # Fall back to segment-level text with segment timestamps
                text = seg.get("text", "").strip()
                if text:
                    words.append({
                        "word": text,
                        "start": seg.get("start", 0.0),
                        "end": seg.get("end", 0.0),
                    })
        return words

    def _build_timestamped_text(self, words: list[dict], interval: float = 5.0) -> str:
        """Build transcript text with periodic timestamps for LLM reference.

        Inserts [MM:SS] markers every `interval` seconds so the LLM can
        reference approximate positions in the video.
        """
        lines: list[str] = []
        next_marker = 0.0
        current_line: list[str] = []

        for w in words:
            t = w["start"]
            if t >= next_marker:
                if current_line:
                    lines.append(" ".join(current_line))
                    current_line = []
                mins = int(t) // 60
                secs = int(t) % 60
                lines.append(f"\n[{mins:02d}:{secs:02d}]")
                next_marker = t + interval
            current_line.append(w["word"])

        if current_line:
            lines.append(" ".join(current_line))

        return " ".join(lines)

    def _snap_to_word(self, time: float, words: list[dict], snap: str = "start") -> float:
        """Snap a time value to the nearest word boundary."""
        if not words:
            return time

        best = words[0]
        best_dist = abs(time - (best["start"] if snap == "start" else best["end"]))

        for w in words:
            t = w["start"] if snap == "start" else w["end"]
            dist = abs(time - t)
            if dist < best_dist:
                best = w
                best_dist = dist

        return best["start"] if snap == "start" else best["end"]


# CLI entry point
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python highlight_detector.py <transcript.json> [num_clips] [platform]")
        print("  transcript.json: Path to transcript JSON with word timestamps")
        print("  num_clips: Number of clips to extract (default 5)")
        print("  platform: tiktok, youtube, instagram, facebook (default tiktok)")
        sys.exit(1)

    transcript_path = sys.argv[1]
    n_clips = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    plat = sys.argv[3] if len(sys.argv) > 3 else "tiktok"

    with open(transcript_path) as f:
        transcript_data = json.load(f)

    detector = HighlightDetector()
    result = detector.detect_highlights(transcript_data, num_clips=n_clips, platform=plat)
    print(json.dumps(result, indent=2, ensure_ascii=False))

    if result.get("success"):
        print(f"\n🎯 Found {result['total_clips']} highlights")
        for i, clip in enumerate(result["clips"], 1):
            print(f"  {i}. [{clip['start']:.1f}s - {clip['end']:.1f}s] score={clip['score']} — {clip['title']}")
