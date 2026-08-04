#!/usr/bin/env python3
"""
Subtitles Engine — Burn subtitle segments onto a video with ffmpeg drawtext.

Pure builder (``build_ffmpeg_cmd``) plus an executor (``burn``). The builder
never touches the filesystem or subprocesses, so it is safe to unit-test
without ffmpeg installed. ``burn`` runs the built command and raises
``RuntimeError`` on a non-zero exit (router wraps it into a 500).

Segments are ``{"start": float, "end": float, "text": str, "style"?: str}``.
Per-segment ``style`` overrides the request-level style; unknown styles fall
back to the ``default`` preset.
"""
import subprocess
from pathlib import Path
from typing import List, Optional, Union

FONTFILE = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def _escape_drawtext(text: str) -> str:
    """Escape a string for use inside ffmpeg drawtext ``text='...'``.

    Order matters: backslashes first so the escapes introduced below are not
    themselves doubled. Single quotes become ``'\\''`` (close/reopen quote
    idiom); commas and colons get a backslash prefix because they are filter
    separators.
    """
    text = text.replace("\\", "\\\\")
    text = text.replace("'", "'\\''")
    text = text.replace(",", "\\,")
    text = text.replace(":", "\\:")
    return text


class SubtitlesEngine:
    """Burn timed subtitle segments onto a video file."""

    STYLE_PRESETS: dict = {
        "default": {
            "fontcolor": "white",
            "box": "1",
            "boxcolor": "black@0.5",
            "boxborderw": "8",
            "y": "h-th-80",
            "x": "(w-text_w)/2",
        },
        "outline": {
            "borderw": "3",
            "bordercolor": "black",
        },
        "highlight": {
            "boxcolor": "yellow@0.6",
            "fontcolor": "black",
        },
        "caption": {
            "y": "h*0.6",
        },
    }

    def __init__(self, ffmpeg: str = "ffmpeg", output_base: Optional[str] = None):
        self.ffmpeg = ffmpeg
        self.output_base = output_base  # explicit default output path; else <input stem>_captioned.mp4

    # ── helpers ──────────────────────────────────────────────────

    @staticmethod
    def _preset_params(style: str) -> dict:
        """Merge a style's extras onto the ``default`` preset (unknown -> default)."""
        params = dict(SubtitlesEngine.STYLE_PRESETS["default"])
        extras = SubtitlesEngine.STYLE_PRESETS.get(style)
        if extras:
            params.update(extras)
        return params

    @staticmethod
    def _effective_font_size(style: str, font_size: int) -> int:
        if style == "caption":
            return int(font_size * 1.2)
        return font_size

    def _default_output_path(self, video_path: str) -> str:
        if self.output_base:
            return self.output_base
        src = Path(video_path)
        return str(src.with_name(src.stem + "_captioned.mp4"))

    # ── pure builder ─────────────────────────────────────────────

    def build_ffmpeg_cmd(
        self,
        video_path: str,
        segments: List[dict],
        style: str = "default",
        font_size: int = 24,
        output_path: Optional[str] = None,
    ) -> List[str]:
        """Build the full ffmpeg argv without executing anything.

        One ``drawtext`` filter per segment, joined with ``,`` inside ``-vf``.
        """
        filters = []
        for seg in segments:
            seg_style = seg.get("style") or style
            params = self._preset_params(seg_style)
            fs = self._effective_font_size(seg_style, font_size)
            params_str = ":".join(f"{k}={v}" for k, v in params.items())
            text = _escape_drawtext(seg["text"])
            start = f"{seg['start']:g}"
            end = f"{seg['end']:g}"
            filters.append(
                "drawtext="
                f"text='{text}':"
                f"enable='between(t,{start},{end})':"
                f"fontsize={fs}:"
                f"fontfile={FONTFILE}:"
                f"{params_str}"
            )
        out = output_path or self._default_output_path(video_path)
        return [
            self.ffmpeg,
            "-y",
            "-i",
            video_path,
            "-vf",
            ",".join(filters),
            "-c:a",
            "copy",
            "-c:v",
            "libx264",
            out,
        ]

    # ── executor ─────────────────────────────────────────────────

    def burn(
        self,
        video_path: str,
        segments: List[dict],
        style: str = "default",
        font_size: int = 24,
        output_dir: Optional[str] = None,
    ) -> dict:
        """Burn the segments with ffmpeg and return the result summary."""
        if not segments:
            return {"success": False, "error": "no subtitle segments provided"}

        if not Path(video_path).is_file():
            return {"success": False, "error": f"input video not found: {video_path}"}

        if output_dir:
            out_dir = Path(output_dir)
            out_dir.mkdir(parents=True, exist_ok=True)
            output_path = str(out_dir / (Path(video_path).stem + "_captioned.mp4"))
        else:
            output_path = None

        cmd = self.build_ffmpeg_cmd(
            video_path,
            segments,
            style=style,
            font_size=font_size,
            output_path=output_path,
        )

        proc = subprocess.run(cmd, capture_output=True, text=True)
        if proc.returncode != 0:
            raise RuntimeError((proc.stderr or "")[-500:])

        return {
            "success": True,
            "output_path": cmd[-1],
            "segments": len(segments),
            "style": style,
            "ffmpeg_cmd": cmd,
        }
