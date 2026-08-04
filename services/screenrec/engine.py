"""Screen-recording engine: capture the X display (or a region) as MP4 via ffmpeg x11grab.

Pure builder + capture wrapper. The builder performs no I/O (unit-testable);
``capture`` runs ffmpeg and optionally muxes TTS narration on top.
"""
import os
import subprocess
import tempfile
import time

from typing import List, Optional


class ScreenRecEngine:
    """Record an X11 display/region to an MP4 (``ffmpeg -f x11grab``)."""

    def __init__(self, ffmpeg: str = "ffmpeg", output_base: Optional[str] = None):
        self.ffmpeg = ffmpeg
        self.output_base = output_base

    def build_ffmpeg_cmd(
        self,
        duration: int,
        fps: int = 15,
        region: Optional[str] = None,
        output_path: Optional[str] = None,
        display: Optional[str] = None,
    ) -> List[str]:
        """Build the x11grab ffmpeg command (pure — no subprocess).

        Args:
            duration: capture length in seconds (``-t``).
            fps: frame rate (``-framerate``).
            region: ``"WxH+X+Y"`` capture area; ``None`` = default size
                (env ``SCREENREC_SIZE`` or ``1280x720``) at offset +0,0.
            output_path: destination file; ``None`` = literal ``"-"``.
            display: X display; defaults to env ``DISPLAY`` or ``":100"``.
        """
        display = display or os.environ.get("DISPLAY", ":100")
        if region:
            parts = region.split("+")
            size = parts[0]
            if len(parts) >= 3:
                offset = f"+{parts[1]},{parts[2]}"
            else:
                offset = "+0,0"
        else:
            size = os.environ.get("SCREENREC_SIZE", "1280x720")
            offset = "+0,0"
        return [
            self.ffmpeg,
            "-y",
            "-f",
            "x11grab",
            "-video_size",
            size,
            "-framerate",
            str(fps),
            "-i",
            f"{display}{offset}",
            "-t",
            str(duration),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(output_path or "-"),
        ]

    def capture(
        self,
        duration: int = 10,
        region: Optional[str] = None,
        fps: int = 15,
        narration: Optional[str] = None,
        voice: Optional[str] = None,
        allow_headless: bool = False,
        output_dir: Optional[str] = None,
    ) -> dict:
        """Record the screen for ``duration`` seconds and return the MP4 path.

        Headless guard: refuses to run when no X display is available unless
        ``allow_headless`` is set (the ffmpeg run itself will then fail and
        surface as a RuntimeError).

        When ``narration`` is given, TTS audio is synthesized via
        :class:`services.tts.engine.TTSEngine` and muxed onto the video
        (``-shortest``).
        """
        if not os.environ.get("DISPLAY") and not allow_headless:
            return {
                "success": False,
                "error": "No X display available (set DISPLAY or allow_headless=True)",
            }

        base = output_dir or self.output_base or tempfile.mkdtemp(prefix="screenrec_")
        os.makedirs(base, exist_ok=True)
        ts = int(time.time() * 1000)
        raw_path = os.path.join(base, f"screen_rec_{ts}.mp4")

        cmd = self.build_ffmpeg_cmd(duration, fps=fps, region=region, output_path=raw_path)
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise RuntimeError(
                f"Screen capture failed: {(result.stderr or '')[-500:]}"
            )

        final_path = raw_path

        if narration:
            from services.di import get_tts  # lazy — avoid import cycle at module load

            tts = get_tts().synthesize(text=narration, voice=voice or None)
            if not tts.get("success"):
                raise RuntimeError(f"Narration TTS failed: {tts.get('error', 'unknown')}")
            audio_path = tts["audio_path"]
            final_path = os.path.join(base, f"screen_rec_{ts}_narration.mp4")
            mux = [
                self.ffmpeg,
                "-y",
                "-i",
                raw_path,
                "-i",
                audio_path,
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-shortest",
                final_path,
            ]
            res = subprocess.run(mux, capture_output=True, text=True)
            if res.returncode != 0:
                raise RuntimeError(f"Narration mux failed: {(res.stderr or '')[-500:]}")
            os.remove(raw_path)

        return {
            "success": True,
            "video_path": final_path,
            "duration": duration,
            "fps": fps,
            "narration": bool(narration),
            "region": region,
        }
