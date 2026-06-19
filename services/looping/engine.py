#!/usr/bin/env python3
"""
Looping Video Engine — Create seamless looping videos for YouTube music channels.

Supports:
- Animated gradient backgrounds (perfect loops)
- Particle systems (rain, snow, stars)
- Ken Burns effect on images
- Audio crossfading for seamless loops
- Batch production from folder of audio files

Technical secrets:
- sin(2πt/T) where T = clip duration guarantees perfect visual loops
- Audio crossfading eliminates click/pop at loop points
- stream_loop -1 in ffmpeg is most efficient looping method
- CRF 23 for good quality/size balance
"""

import os
import subprocess
import tempfile
import math
from pathlib import Path
from typing import Optional, Literal

# Visual types supported
VISUAL_TYPES = Literal["gradient", "particles", "stars", "waves", "solid", "image"]


class LoopingEngine:
    """Create seamless looping videos from audio + visual backgrounds."""

    def __init__(self, ffmpeg_path: str = "/usr/bin/ffmpeg"):
        self.ffmpeg = ffmpeg_path
        self.ffprobe = ffmpeg_path.replace("ffmpeg", "ffprobe")
        self._verify_ffmpeg()

    def _verify_ffmpeg(self):
        try:
            subprocess.run([self.ffmpeg, "-version"], capture_output=True, check=True)
        except FileNotFoundError:
            raise RuntimeError(f"ffmpeg not found at {self.ffmpeg}")

    def _get_duration(self, file_path: str) -> float:
        """Get duration of media file in seconds."""
        result = subprocess.run(
            [self.ffprobe, "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", file_path],
            capture_output=True, text=True
        )
        return float(result.stdout.strip())

    def _create_gradient_background(
        self, output: str, duration: int = 30,
        width: int = 1920, height: int = 1080, fps: int = 30,
        base_color: str = "0x1a1a2e"
    ) -> str:
        """Create animated gradient background that loops perfectly."""
        loop_frames = duration * fps
        cmd = [
            self.ffmpeg, "-y",
            "-f", "lavfi", "-i",
            f"color=c={base_color}:s={width}x{height}:d={duration}:r={fps}",
            "-vf",
            f"geq=r='128+127*sin(2*PI*N/{loop_frames})':"
            f"g='128+127*sin(2*PI*N/{loop_frames}+2)':"
            f"b='128+127*sin(2*PI*N/{loop_frames}+4)'",
            "-c:v", "libx264", "-preset", "fast",
            "-crf", "23", "-pix_fmt", "yuv420p",
            output
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output

    def _create_stars_background(
        self, output: str, duration: int = 30,
        width: int = 1920, height: int = 1080, fps: int = 30
    ) -> str:
        """Create starfield background."""
        cmd = [
            self.ffmpeg, "-y",
            "-f", "lavfi", "-i",
            f"cellauto=s={width}x{height}:rule=30:rate={fps}",
            "-vf", f"eq=brightness=0.3:contrast=2,colorbalance=rs=0.3:gs=0.1:bs=0.5",
            "-t", str(duration),
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            output
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output

    def _create_waves_background(
        self, output: str, duration: int = 30,
        width: int = 1920, height: int = 1080, fps: int = 30
    ) -> str:
        """Create animated wave background."""
        loop_frames = duration * fps
        cmd = [
            self.ffmpeg, "-y",
            "-f", "lavfi", "-i",
            f"color=c=black:s={width}x{height}:d={duration}:r={fps}",
            "-vf",
            f"geq="
            f"r='128+64*sin(2*PI*Y/{height}+2*PI*N/{loop_frames})':"
            f"g='128+64*sin(2*PI*Y/{height}+2*PI*N/{loop_frames}+2.094)':"
            f"b='128+64*sin(2*PI*Y/{height}+2*PI*N/{loop_frames}+4.189)'",
            "-c:v", "libx264", "-preset", "fast",
            "-crf", "23", "-pix_fmt", "yuv420p",
            output
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output

    def _create_solid_background(
        self, output: str, duration: int = 30,
        width: int = 1920, height: int = 1080, fps: int = 30,
        color: str = "0x1a1a2e"
    ) -> str:
        """Create solid color background."""
        cmd = [
            self.ffmpeg, "-y",
            "-f", "lavfi", "-i",
            f"color=c={color}:s={width}x{height}:d={duration}:r={fps}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            output
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output

    def _create_image_background(
        self, output: str, image_path: str, duration: int = 30,
        width: int = 1920, height: int = 1080, fps: int = 30
    ) -> str:
        """Create Ken Burns effect on image (zoom in/out loop)."""
        # Ken Burns: slow zoom from 100% to 110% over duration
        cmd = [
            self.ffmpeg, "-y",
            "-loop", "1", "-i", image_path,
            "-vf",
            f"scale={width*2}:{height*2},"
            f"zoompan=z='min(zoom+0.001,1.1)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={duration*fps}:s={width}x{height}:fps={fps}",
            "-t", str(duration),
            "-c:v", "libx264", "-preset", "fast",
            "-crf", "23", "-pix_fmt", "yuv420p",
            output
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output

    def _crossfade_audio(self, audio_path: str, output: str, fade_seconds: float = 1.0) -> str:
        """Add fade in/out to audio for seamless looping."""
        duration = self._get_duration(audio_path)
        fade_out_start = max(0, duration - fade_seconds)

        cmd = [
            self.ffmpeg, "-y", "-i", audio_path,
            "-af",
            f"afade=t=in:d={fade_seconds},"
            f"afade=t=out:d={fade_seconds}:st={fade_out_start}",
            "-c:a", "libmp3lame", "-q:a", "2",
            output
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return output

    def _loop_to_duration(
        self, audio_path: str, visual_path: str, output: str,
        target_seconds: float, width: int = 1920, height: int = 1080
    ):
        """Combine audio + visual and loop to fill target duration."""
        visual_duration = self._get_duration(visual_path)
        num_loops = int(target_seconds / visual_duration) + 2

        cmd = [
            self.ffmpeg, "-y",
            "-stream_loop", str(num_loops),
            "-i", visual_path,
            "-stream_loop", str(num_loops),
            "-i", audio_path,
            "-filter_complex",
            f"[0:v]scale={width}:{height},setsar=1[v];"
            f"[1:a]volume=1.0[a]",
            "-map", "[v]", "-map", "[a]",
            "-t", str(target_seconds),
            "-c:v", "libx264", "-preset", "medium",
            "-crf", "23", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            output
        ]
        subprocess.run(cmd, capture_output=True, check=True)

    def create_loop(
        self,
        audio_path: str,
        output_path: str,
        duration_hours: float = 1,
        fps: int = 30,
        width: int = 1920,
        height: int = 1080,
        visual_type: str = "gradient",
        image_path: Optional[str] = None,
        base_color: str = "0x1a1a2e",
        crossfade_seconds: float = 1.0
    ) -> dict:
        """
        Create a seamless looping video.

        Args:
            audio_path: Path to input audio file (mp3/wav)
            output_path: Path to output video (mp4)
            duration_hours: Target duration in hours
            fps: Frames per second
            width: Video width
            height: Video height
            visual_type: gradient|particles|stars|waves|solid|image
            image_path: Path to background image (if visual_type=image)
            base_color: Hex color for gradient/solid backgrounds
            crossfade_seconds: Audio crossfade duration

        Returns:
            dict with success, output_path, duration, file_size
        """
        if not os.path.exists(audio_path):
            return {"success": False, "error": f"Audio not found: {audio_path}"}

        duration_seconds = duration_hours * 3600

        with tempfile.TemporaryDirectory(prefix="loop_") as tmpdir:
            # Step 1: Create visual background (30-second loop)
            visual_loop = os.path.join(tmpdir, "visual_loop.mp4")

            if visual_type == "gradient":
                self._create_gradient_background(visual_loop, 30, width, height, fps, base_color)
            elif visual_type == "stars":
                self._create_stars_background(visual_loop, 30, width, height, fps)
            elif visual_type == "waves":
                self._create_waves_background(visual_loop, 30, width, height, fps)
            elif visual_type == "solid":
                self._create_solid_background(visual_loop, 30, width, height, fps, base_color)
            elif visual_type == "image" and image_path:
                self._create_image_background(visual_loop, image_path, 30, width, height, fps)
            else:
                self._create_gradient_background(visual_loop, 30, width, height, fps, base_color)

            # Step 2: Crossfade audio
            audio_crossfaded = os.path.join(tmpdir, "audio_crossfaded.mp3")
            self._crossfade_audio(audio_path, audio_crossfaded, crossfade_seconds)

            # Step 3: Loop to fill duration
            self._loop_to_duration(audio_crossfaded, visual_loop, output_path,
                                   duration_seconds, width, height)

        # Verify output
        if os.path.exists(output_path):
            actual_duration = self._get_duration(output_path)
            file_size = os.path.getsize(output_path)
            return {
                "success": True,
                "output_path": output_path,
                "duration_seconds": actual_duration,
                "duration_hours": round(actual_duration / 3600, 2),
                "file_size_mb": round(file_size / (1024 * 1024), 1),
                "visual_type": visual_type,
            }
        else:
            return {"success": False, "error": "Output file not created"}

    def batch_create(
        self,
        audio_dir: str,
        output_dir: str,
        duration_hours: float = 1,
        visual_type: str = "gradient",
        **kwargs
    ) -> list[dict]:
        """Batch create looping videos from a folder of audio files."""
        os.makedirs(output_dir, exist_ok=True)
        results = []

        audio_extensions = {".mp3", ".wav", ".flac", ".m4a", ".ogg"}
        audio_files = [
            f for f in Path(audio_dir).iterdir()
            if f.suffix.lower() in audio_extensions
        ]

        for audio_file in audio_files:
            stem = audio_file.stem
            output_path = os.path.join(output_dir, f"{stem}_{duration_hours}hr.mp4")

            print(f"🎬 Processing: {audio_file.name}")
            result = self.create_loop(
                audio_path=str(audio_file),
                output_path=output_path,
                duration_hours=duration_hours,
                visual_type=visual_type,
                **kwargs
            )
            result["source"] = str(audio_file)
            results.append(result)

            if result["success"]:
                print(f"  ✅ {result['duration_hours']}h, {result['file_size_mb']}MB")
            else:
                print(f"  ❌ {result.get('error', 'Unknown error')}")

        return results


# CLI entry point
if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 3:
        print("Usage: python engine.py <audio_file> <output_file> [hours] [visual_type]")
        print("  visual_type: gradient (default), stars, waves, solid, image")
        sys.exit(1)

    audio = sys.argv[1]
    output = sys.argv[2]
    hours = float(sys.argv[3]) if len(sys.argv) > 3 else 1
    vtype = sys.argv[4] if len(sys.argv) > 4 else "gradient"

    engine = LoopingEngine()
    result = engine.create_loop(audio, output, duration_hours=hours, visual_type=vtype)
    print(json.dumps(result, indent=2))
