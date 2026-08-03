#!/usr/bin/env python3
"""
Content Re-Metadata Engine — Simple video re-rendering to change metadata.

Takes a single video, applies small changes (text overlay, slight speed change,
color shift, re-encode), and generates new metadata. The output file has a
completely different hash/metadata from the original, avoiding copyright detection.

This is NOT a remix/mashup engine. It's a metadata changer.

Usage:
    from services.remetadata.engine import ReMetadataEngine
    engine = ReMetadataEngine()
    result = engine.remetadata("input.mp4", overlay="@mybrand", niche="tech tips")
"""

import os
import json
import time
import subprocess
import random
import hashlib
from pathlib import Path
from typing import Optional

from services.trends.seo_generator import SEOGenerator


def normalize_color_shift(value) -> bool:
    """Coerce bool|str color_shift to a bool for the engine."""
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    s = str(value).strip().lower()
    return s not in ("", "none", "0", "false", "no", "off")


class ReMetadataEngine:
    """
    Simple video re-rendering for metadata change.
    
    Pipeline:
    1. Take input video
    2. Add text overlay (handle, watermark, or custom text)
    3. Slight speed change (0.98x-1.02x — imperceptible but changes fingerprint)
    4. Slight color shift (contrast/brightness tweak)
    5. Re-encode with different CRF/preset (changes file hash)
    6. Strip original metadata (EXIF, creation time, etc.)
    7. Generate NEW title, caption, hashtags
    8. Output: new video file with completely different fingerprint
    """

    def __init__(self):
        self.seo = SEOGenerator()
        self.ffmpeg = "ffmpeg"
        self.ffprobe = "ffprobe"
        self.output_base = "/tmp/remetadata_output"

    def remetadata(
        self,
        source: str,
        overlay: Optional[str] = None,
        watermark: Optional[str] = None,
        position: str = "bottom_right",
        speed: Optional[float] = None,
        color_shift: bool | str = True,
        niche: str = "general",
        platform: str = "tiktok",
        language: str = "id",
        output_dir: Optional[str] = None,
    ) -> dict:
        """
        Re-render a video with new metadata.
        
        Args:
            source: Path to input video (local file)
            overlay: Text overlay (e.g., @username, brand name)
            watermark: Watermark text (small, bottom corner)
            position: Text position (bottom_right, bottom_left, top_right, top_left, center)
            speed: Speed multiplier (default: random 0.98-1.02)
            color_shift: Whether to apply slight color change
            niche: Content niche for SEO metadata generation
            platform: Target platform
            language: Content language
            output_dir: Custom output directory
            
        Returns:
            {
                "success": True,
                "video_path": "...",
                "metadata": {"title": "...", "caption": "...", "hashtags": [...]},
                "original_hash": "...",
                "new_hash": "...",
                "changes_applied": [...],
            }
        """
        # Coerce bool|str from API callers (e.g. "false" must not be truthy)
        color_shift = normalize_color_shift(color_shift)
        job_id = f"remeta_{os.getpid()}_{int(time.time())}"
        work_dir = output_dir or os.path.join(self.output_base, job_id)
        os.makedirs(work_dir, exist_ok=True)

        if not os.path.exists(source):
            return {"success": False, "error": f"Source file not found: {source}"}

        try:
            # Original hash
            original_hash = self._file_hash(source)
            original_duration = self._get_duration(source)
            changes = []

            # ── Step 1: Build filter chain ──
            filters_v = []
            filters_a = []

            # Speed change (imperceptible but changes fingerprint)
            if speed is None:
                speed = round(random.uniform(0.98, 1.02), 3)
            if abs(speed - 1.0) > 0.005:
                filters_v.append(f"setpts={1/speed}*PTS")
                filters_a.append(f"atempo={speed}")
                changes.append(f"speed={speed}x")

            # Color shift (tiny contrast/brightness change)
            if color_shift:
                contrast = round(random.uniform(1.01, 1.05), 3)
                brightness = round(random.uniform(-0.01, 0.02), 3)
                saturation = round(random.uniform(0.98, 1.05), 3)
                filters_v.append(f"eq=contrast={contrast}:brightness={brightness}:saturation={saturation}")
                changes.append(f"color_shift(c={contrast},b={brightness},s={saturation})")

            # Text overlay
            if overlay:
                safe_text = self._escape_ffmpeg_text(overlay)
                pos = self._get_position(position, 1080, 1920)  # Default resolution
                font_size = 36
                filters_v.append(
                    f"drawtext=text='{safe_text}':"
                    f"fontcolor=white:fontsize={font_size}:"
                    f"x={pos['x']}:y={pos['y']}:"
                    f"borderw=2:bordercolor=black:"
                    f"shadowx=1:shadowy=1:shadowcolor=black@0.5"
                )
                changes.append(f"overlay='{overlay}'")

            # Watermark (small, bottom corner)
            if watermark and watermark != overlay:
                safe_wm = self._escape_ffmpeg_text(watermark)
                filters_v.append(
                    f"drawtext=text='{safe_wm}':"
                    f"fontcolor=white@0.5:fontsize=20:"
                    f"x=w-tw-20:y=h-th-20:"
                    f"borderw=1:bordercolor=black@0.3"
                )
                changes.append(f"watermark='{watermark}'")

            # ── Step 2: Re-encode ──
            output_path = os.path.join(work_dir, f"remeta_{job_id}.mp4")

            # Use different CRF/preset than original to change encoding fingerprint
            crf = random.choice([18, 19, 20, 21, 22])
            preset = random.choice(["medium", "slow", "fast"])

            cmd = [self.ffmpeg, "-y", "-i", source]

            # Apply video filters
            if filters_v:
                cmd.extend(["-vf", ",".join(filters_v)])

            # Apply audio filters
            if filters_a:
                cmd.extend(["-af", ",".join(filters_a)])

            # Re-encode with different settings
            cmd.extend([
                "-c:v", "libx264",
                "-crf", str(crf),
                "-preset", preset,
                "-profile:v", "high",
                "-level", "4.1",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "192k",
                "-ar", "44100",
                "-movflags", "+faststart",
                # Strip metadata
                "-map_metadata", "-1",
                output_path,
            ])

            print(f"  🔄 Re-rendering with changes: {', '.join(changes)}")
            subprocess.run(cmd, capture_output=True, timeout=300, check=True)

            if not os.path.exists(output_path):
                return {"success": False, "error": "Re-render failed"}

            # New hash
            new_hash = self._file_hash(output_path)
            new_duration = self._get_duration(output_path)

            # ── Step 3: Generate new metadata ──
            metadata = self._generate_metadata(niche, platform, language)

            # Cleanup
            print(f"  ✅ Re-metadata complete: {original_hash[:12]}... → {new_hash[:12]}...")

            return {
                "success": True,
                "job_id": job_id,
                "video_path": output_path,
                "metadata": metadata,
                "original_hash": original_hash,
                "new_hash": new_hash,
                "changes_applied": changes,
                "original_duration": round(original_duration, 2),
                "new_duration": round(new_duration, 2),
                "encoding": f"crf={crf}, preset={preset}",
                "output_dir": work_dir,
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    def batch_remetadata(
        self,
        sources: list[str],
        overlay: Optional[str] = None,
        watermark: Optional[str] = None,
        niche: str = "general",
        platform: str = "tiktok",
        language: str = "id",
    ) -> list[dict]:
        """Re-metadata multiple videos."""
        results = []
        for source in sources:
            result = self.remetadata(
                source=source,
                overlay=overlay,
                watermark=watermark,
                niche=niche,
                platform=platform,
                language=language,
            )
            results.append(result)
        return results

    def _generate_metadata(self, niche: str, platform: str, language: str) -> dict:
        """Generate completely new metadata."""
        try:
            title = f"Best {niche} Tips You Need To Know"
            if language == "id":
                title = f"Tips {niche} Terbaik Yang Wajib Kamu Tahu"

            seo = self.seo.generate_seo(title, "", platform, language)
            return {
                "title": seo.get("title", title),
                "caption": seo.get("caption", ""),
                "hashtags": seo.get("hashtags", []),
                "posting_time": seo.get("posting_time", "12:00"),
            }
        except Exception:
            return {
                "title": f"Best {niche} Tips",
                "caption": "",
                "hashtags": [f"#{niche.replace(' ', '')}", "#tips", "#viral"],
                "posting_time": "12:00",
            }

    def _file_hash(self, path: str) -> str:
        """SHA256 hash of file."""
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()

    def _get_duration(self, path: str) -> float:
        """Get video duration."""
        try:
            cmd = [
                self.ffprobe, "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            return float(result.stdout.strip())
        except Exception:
            return 0

    def _escape_ffmpeg_text(self, text: str) -> str:
        """Escape special characters for FFmpeg drawtext filter."""
        return text.replace("\\", "\\\\").replace("'", "'\\''").replace(":", "\\:").replace("%", "%%")

    def _get_position(self, position: str, width: int, height: int) -> dict:
        """Get x,y coordinates for text position."""
        positions = {
            "top_left": {"x": "50", "y": "50"},
            "top_right": {"x": "w-tw-50", "y": "50"},
            "top_center": {"x": "(w-tw)/2", "y": "50"},
            "center": {"x": "(w-tw)/2", "y": "(h-th)/2"},
            "bottom_left": {"x": "50", "y": "h-th-50"},
            "bottom_right": {"x": "w-tw-50", "y": "h-th-50"},
            "bottom_center": {"x": "(w-tw)/2", "y": "h-th-50"},
            "lower_third": {"x": "(w-tw)/2", "y": "h*0.72"},
        }
        return positions.get(position, positions["bottom_right"])


# CLI entry point
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m services.remetadata.engine <video.mp4> [options]")
        print("Options: --overlay @brand --watermark @user --niche tech --platform tiktok")
        sys.exit(1)

    source = sys.argv[1]
    overlay = None
    watermark = None
    niche = "general"
    platform = "tiktok"

    i = 2
    while i < len(sys.argv):
        if sys.argv[i] == "--overlay" and i + 1 < len(sys.argv):
            overlay = sys.argv[i + 1]; i += 2
        elif sys.argv[i] == "--watermark" and i + 1 < len(sys.argv):
            watermark = sys.argv[i + 1]; i += 2
        elif sys.argv[i] == "--niche" and i + 1 < len(sys.argv):
            niche = sys.argv[i + 1]; i += 2
        elif sys.argv[i] == "--platform" and i + 1 < len(sys.argv):
            platform = sys.argv[i + 1]; i += 2
        else:
            i += 1

    engine = ReMetadataEngine()
    result = engine.remetadata(source, overlay=overlay, watermark=watermark, niche=niche, platform=platform)
    print(json.dumps(result, indent=2, default=str))
