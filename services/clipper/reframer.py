#!/usr/bin/env python3
"""
FFmpeg Video Reframer & Subtitle Generator.

Converts landscape video to vertical (9:16) with center crop,
generates karaoke-style ASS subtitles with word-by-word highlighting,
burns subtitles onto video, and generates thumbnails.

Technical notes:
- All FFmpeg calls via subprocess.run (matching composer.py pattern)
- ASS subtitles via pysubs2 library
- CRF 18, libx264, yuv420p for re-encode steps
- Stream copy (-c copy) for fast clip extraction
"""

import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import pysubs2

# ASS style constants
_ASS_FONT = "Arial"
_ASS_FONTSIZE = 48
_ASS_BOLD = True
_ASS_OUTLINE = 3
_ASS_SHADOW = 0
_ASS_MARGINV = 60


class Reframer:
    """FFmpeg-based video reframing and subtitle generation."""

    def __init__(self, ffmpeg_path: str = "ffmpeg"):
        self.ffmpeg = ffmpeg_path
        self.ffprobe = ffmpeg_path.replace("ffmpeg", "ffprobe")
        self._verify_ffmpeg()

    def _verify_ffmpeg(self):
        """Verify ffmpeg binary exists and is executable."""
        if not shutil.which(self.ffmpeg):
            raise RuntimeError(f"ffmpeg not found at {self.ffmpeg}")

    def _run_ffmpeg(self, args: list[str]) -> bool:
        """Run an FFmpeg command with error handling.

        Args:
            args: Full command as list (including 'ffmpeg').

        Returns:
            True on success.

        Raises:
            RuntimeError: On non-zero exit or missing binary.
        """
        try:
            subprocess.run(args, capture_output=True, text=True, check=True)
            return True
        except subprocess.CalledProcessError as e:
            stderr = e.stderr[-500:] if e.stderr else ""
            raise RuntimeError(f"ffmpeg failed (exit {e.returncode}): {stderr}")
        except FileNotFoundError:
            raise RuntimeError(f"ffmpeg not found at {self.ffmpeg}")

    def _get_duration(self, file_path: str) -> float:
        """Get media duration in seconds via ffprobe."""
        result = subprocess.run(
            [
                self.ffprobe,
                "-v", "quiet",
                "-show_entries", "format=duration",
                "-of", "csv=p=0",
                file_path,
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        return float(result.stdout.strip())

    # ── Public API ──────────────────────────────────────────

    def extract_clip(
        self, video_path: str, start: float, end: float, output_path: str
    ) -> str:
        """Extract a time segment from video using stream copy (fast, no re-encode).

        Args:
            video_path: Source video file.
            start: Start time in seconds.
            end: End time in seconds.
            output_path: Destination file path.

        Returns:
            output_path
        """
        self._run_ffmpeg([
            self.ffmpeg,
            "-y",
            "-ss", str(start),
            "-i", video_path,
            "-t", str(end - start),
            "-c", "copy",
            output_path,
        ])
        return output_path

    def reframe_to_vertical(
        self,
        video_path: str,
        output_path: str,
        target_ratio: str = "9:16",
    ) -> str:
        """Convert landscape video to vertical using center crop.

        For 9:16 from 16:9 source, crops to the center 56.25% of width.

        Args:
            video_path: Source video file.
            output_path: Destination file path.
            target_ratio: Aspect ratio string (e.g. '9:16').

        Returns:
            output_path
        """
        # Parse target ratio
        parts = target_ratio.split(":")
        rw, rh = int(parts[0]), int(parts[1])

        # crop filter: keep full height, compute width from ratio
        crop_filter = f"crop=in_h*{rw}/{rh}:in_h"

        self._run_ffmpeg([
            self.ffmpeg,
            "-y",
            "-i", video_path,
            "-vf", crop_filter,
            "-c:v", "libx264",
            "-crf", "18",
            "-preset", "medium",
            "-c:a", "aac",
            "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            output_path,
        ])
        return output_path

    def reframe_to_vertical_with_face(
        self, video_path: str, output_path: str
    ) -> str:
        """Center-crop based on detected face position.

        Simplified implementation: uses the same center crop as
        reframe_to_vertical. A future version can integrate face
        detection (e.g. via mediapipe) to offset the crop window.

        Args:
            video_path: Source video file.
            output_path: Destination file path.

        Returns:
            output_path
        """
        return self.reframe_to_vertical(video_path, output_path, "9:16")

    def generate_karaoke_subtitles(
        self,
        segments: list[dict],
        output_path: str,
        style: str = "default",
    ) -> str:
        """Generate ASS subtitles with word-by-word karaoke highlighting.

        Each word gets its own ``\\k`` tag so the viewer sees words
        light up sequentially.

        Args:
            segments: List of segment dicts, each with:
                - start (float): segment start in seconds
                - end (float): segment end in seconds
                - words (list[dict]): each word has start, end, word
            output_path: Destination .ass file path.
            style: Preset name — 'default', 'hormozi', or 'tiktok'.

        Returns:
            output_path
        """
        subs = pysubs2.SSAFile()

        # Apply style preset
        preset = self._get_style_preset(style)
        default_style = pysubs2.SSAStyle(
            fontname=preset["font"],
            fontsize=preset["fontsize"],
            bold=preset["bold"],
            italic=False,
            primarycolor=preset["primary"],
            outlinecolor=preset["outline"],
            backcolor=preset["shadow"],
            outline=preset["outline_width"],
            shadow=preset["shadow_width"],
            alignment=preset["alignment"],
            marginv=preset["marginv"],
        )
        subs.styles["Default"] = default_style

        for seg in segments:
            words = seg.get("words", [])
            if not words:
                continue

            # Build ASS karaoke text: each word wrapped in \k<dur>
            # \k duration is in centiseconds
            karaoke_parts = []
            for w in words:
                w_start = w["start"]
                w_end = w["end"]
                # Duration for this word in centiseconds (×100)
                dur_cs = max(1, int(round((w_end - w_start) * 100)))
                karaoke_parts.append(f"\\k{dur_cs} {w['word']}")

            karaoke_text = "".join(karaoke_parts).strip()

            # Create dialogue event — start/end in ASS format (H:MM:SS.cc)
            event = pysubs2.SSAEvent(
                start=round(seg["start"] * 1000),
                end=round(seg["end"] * 1000),
                text=karaoke_text,
            )
            subs.events.append(event)

        subs.save(output_path, encoding="utf-8-sig")
        return output_path
    def burn_subtitles(
        self, video_path: str, subtitle_path: str, output_path: str
    ) -> str:
        """Burn ASS subtitles onto video using FFmpeg subtitles filter (requires libass)."""
        # Copy subtitle to /tmp with simple name to avoid path escaping issues
        import shutil
        simple_sub = os.path.join(tempfile.gettempdir(), f"subs_{os.getpid()}.ass")
        shutil.copy2(subtitle_path, simple_sub)
        try:
            vf = f"subtitles={simple_sub}"
            self._run_ffmpeg([
                self.ffmpeg, "-y",
                "-i", video_path,
                "-vf", vf,
                "-c:v", "libx264", "-crf", "18", "-preset", "medium",
                "-c:a", "copy", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                output_path,
            ])
        finally:
            if os.path.exists(simple_sub):
                os.unlink(simple_sub)
        return output_path

    def generate_thumbnail(
        self,
        video_path: str,
        timestamp: float,
        output_path: str,
        title: str = "",
    ) -> str:
        """Extract a frame at timestamp, optionally add dark overlay + title.

        Args:
            video_path: Source video file.
            timestamp: Time in seconds to extract the frame.
            output_path: Destination image file path (e.g. .jpg or .png).
            title: Optional title text drawn on the thumbnail.

        Returns:
            output_path
        """
        if title:
            # Escape text for drawtext: colons, backslashes, single quotes
            safe_title = (
                title
                .replace("\\", "\\\\")
                .replace(":", "\\:")
                .replace("'", "\\'")
            )
            # Dark semi-transparent overlay + title text centered
            vf = (
                "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.4:t=fill,"
                f"drawtext=text='{safe_title}'"
                ":fontsize=42:fontcolor=white:borderw=3:bordercolor=black"
                ":x=(w-text_w)/2:y=(h-text_h)/2"
            )
            self._run_ffmpeg([
                self.ffmpeg,
                "-y",
                "-ss", str(timestamp),
                "-i", video_path,
                "-vf", vf,
                "-frames:v", "1",
                output_path,
            ])
        else:
            self._run_ffmpeg([
                self.ffmpeg,
                "-y",
                "-ss", str(timestamp),
                "-i", video_path,
                "-frames:v", "1",
                output_path,
            ])
        return output_path

    # ── Private helpers ─────────────────────────────────────

    @staticmethod
    def _get_style_preset(name: str) -> dict:
        """Return ASS style parameters for a named preset.

        Presets:
            default  — white text, black outline, bottom-center
            hormozi  — yellow text, black background box, bottom-center
            tiktok   — white text, no outline, bold, bottom-center
        """
        presets = {
            "default": {
                "font": _ASS_FONT,
                "fontsize": _ASS_FONTSIZE,
                "bold": True,
                "primary": pysubs2.Color(255, 255, 255, 0),       # white
                "outline": pysubs2.Color(0, 0, 0, 0),             # black outline
                "shadow": pysubs2.Color(0, 0, 0, 128),            # semi-transparent
                "outline_width": 3,
                "shadow_width": 0,
                "alignment": 2,  # bottom-center
                "marginv": _ASS_MARGINV,
            },
            "hormozi": {
                "font": _ASS_FONT,
                "fontsize": 52,
                "bold": True,
                "primary": pysubs2.Color(255, 255, 0, 0),         # yellow
                "outline": pysubs2.Color(0, 0, 0, 0),             # black
                "shadow": pysubs2.Color(0, 0, 0, 0),              # black bg
                "outline_width": 4,
                "shadow_width": 3,
                "alignment": 2,
                "marginv": _ASS_MARGINV,
            },
            "tiktok": {
                "font": _ASS_FONT,
                "fontsize": 50,
                "bold": True,
                "primary": pysubs2.Color(255, 255, 255, 0),       # white
                "outline": pysubs2.Color(0, 0, 0, 0),             # no visible outline
                "shadow": pysubs2.Color(0, 0, 0, 0),
                "outline_width": 0,
                "shadow_width": 0,
                "alignment": 2,  # bottom-center
                "marginv": _ASS_MARGINV,
            },
        }
        if name not in presets:
            raise ValueError(
                f"Unknown style preset '{name}'. Choose from: {', '.join(presets)}"
            )
        return presets[name]


# CLI entry point
if __name__ == "__main__":
    import sys

    def _usage():
        print("Usage: reframer.py <command> [args...]")
        print()
        print("Commands:")
        print("  extract  <video> <start> <end> <output>")
        print("  crop     <video> <output> [ratio]")
        print("  subs     <segments.json> <output.ass> [style]")
        print("  burn     <video> <subs.ass> <output>")
        print("  thumb    <video> <timestamp> <output> [title]")

    if len(sys.argv) < 2:
        _usage()
        sys.exit(1)

    cmd = sys.argv[1]
    r = Reframer()

    try:
        if cmd == "extract":
            r.extract_clip(sys.argv[2], float(sys.argv[3]), float(sys.argv[4]), sys.argv[5])
        elif cmd == "crop":
            ratio = sys.argv[4] if len(sys.argv) > 4 else "9:16"
            r.reframe_to_vertical(sys.argv[2], sys.argv[3], ratio)
        elif cmd == "subs":
            import json
            with open(sys.argv[2]) as f:
                segs = json.load(f)
            style = sys.argv[4] if len(sys.argv) > 4 else "default"
            r.generate_karaoke_subtitles(segs, sys.argv[3], style)
        elif cmd == "burn":
            r.burn_subtitles(sys.argv[2], sys.argv[3], sys.argv[4])
        elif cmd == "thumb":
            title = sys.argv[5] if len(sys.argv) > 5 else ""
            r.generate_thumbnail(sys.argv[2], float(sys.argv[3]), sys.argv[4], title)
        else:
            _usage()
            sys.exit(1)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
