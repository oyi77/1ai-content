#!/usr/bin/env python3
"""
FFmpeg Video Composition Engine — Assemble faceless videos from scenes.

Supports:
- Ken Burns (zoom/pan) effect on static images
- Scene composition (video + audio)
- A/B split scenes (two clips with transition)
- Caption/subtitle overlay via drawtext
- Multi-scene stitching with xfade transitions
- Background music mixing with auto-loop

Technical notes:
- Resolution format: 'WxH' string (e.g. '1080x1920')
- Default portrait: 1080x1920 (9:16)
- Default landscape: 1920x1080 (16:9)
- CRF 23, libx264 medium, yuv420p, AAC 192k
- xfade for transitions; concat demuxer for 'none'
"""

import os
import subprocess
import shutil
import tempfile
from pathlib import Path
from typing import Optional


class FacelessComposer:
    """FFmpeg-based video composition engine for faceless content."""

    def __init__(self, ffmpeg_path: str = "ffmpeg"):
        self.ffmpeg = ffmpeg_path
        self.ffprobe = ffmpeg_path.replace("ffmpeg", "ffprobe")
        self._verify_ffmpeg()

    def _verify_ffmpeg(self):
        """Verify ffmpeg binary exists and is executable."""
        if not shutil.which(self.ffmpeg):
            raise RuntimeError(f"ffmpeg not found at {self.ffmpeg}")

    def _get_duration(self, file_path: str) -> float:
        """Get duration of media file in seconds via ffprobe."""
        cmd = [
            self.ffprobe, "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            file_path,
        ]
        result = subprocess.run(cmd, capture_output=True, check=True, text=True)
        return float(result.stdout.strip())

    def _parse_resolution(self, resolution: str) -> tuple[int, int]:
        """Parse 'WxH' resolution string to (width, height) tuple."""
        parts = resolution.split("x")
        if len(parts) != 2:
            raise ValueError(f"Invalid resolution format: {resolution} (expected 'WxH')")
        return int(parts[0]), int(parts[1])

    def _escape_drawtext(self, text: str) -> str:
        """Escape text for FFmpeg drawtext filter."""
        text = text.replace("\\", "\\\\\\\\")
        text = text.replace("'", "\u2019")
        text = text.replace(":", "\\\\:")
        text = text.replace("[", "\\\\[")
        text = text.replace("]", "\\\\]")
        text = text.replace(";", "\\\\;")
        text = text.replace(",", "\\\\,")
        text = text.replace("\n", "\\\\n")
        return text

    # ── Public API ──────────────────────────────────────────

    def apply_ken_burns(
        self,
        image_path: str,
        duration: float,
        output_path: str,
        effect: str = "zoom_in",
        resolution: str = "1080x1920",
    ) -> str:
        """
        Apply Ken Burns (zoom/pan) effect to a static image.

        Args:
            image_path: Path to input image
            duration: Duration in seconds
            output_path: Path to output video
            effect: 'zoom_in', 'zoom_out', 'pan_left', 'pan_right', 'pan_up'
            resolution: Output resolution as 'WxH' string

        Returns:
            output_path
        """
        width, height = self._parse_resolution(resolution)
        fps = 30
        total_frames = int(duration * fps)

        effects = {
            "zoom_in": (
                "z='min(zoom+0.0015,1.5)'",
                "x='iw/2-(iw/zoom/2)'",
                "y='ih/2-(ih/zoom/2)'",
            ),
            "zoom_out": (
                "z='if(eq(on,1),1.5,max(zoom-0.0015,1.0))'",
                "x='iw/2-(iw/zoom/2)'",
                "y='ih/2-(ih/zoom/2)'",
            ),
            "pan_left": (
                "z='1.2'",
                "x='iw*0.2*(1-on/{nf})'",
                "y='ih/2-(ih/zoom/2)'",
            ),
            "pan_right": (
                "z='1.2'",
                "x='iw*0.2*(on/{nf})'",
                "y='ih/2-(ih/zoom/2)'",
            ),
            "pan_up": (
                "z='1.2'",
                "x='iw/2-(iw/zoom/2)'",
                "y='ih*0.2*(1-on/{nf})'",
            ),
        }

        if effect not in effects:
            raise ValueError(f"Unknown effect '{effect}'. Supported: {list(effects.keys())}")

        z_expr, x_expr, y_expr = effects[effect]
        z_expr = z_expr.format(nf=total_frames)
        x_expr = x_expr.format(nf=total_frames)
        y_expr = y_expr.format(nf=total_frames)

        cmd = [
            self.ffmpeg, "-y",
            "-loop", "1", "-i", image_path,
            "-vf",
            f"scale={width*2}:{height*2},"
            f"zoompan={z_expr}:{x_expr}:{y_expr}:d={total_frames}:s={width}x{height}:fps={fps}",
            "-t", str(duration),
            "-c:v", "libx264", "-preset", "fast",
            "-crf", "23", "-pix_fmt", "yuv420p",
            output_path,
        ]
        self._run_ffmpeg(cmd)
        return output_path

    def compose_scene(
        self,
        video_path: str,
        audio_path: str,
        output_path: str,
        resolution: str = "1080x1920",
    ) -> str:
        """
        Combine video/image + audio into a scene.

        Scales video to target resolution and syncs duration to audio
        using -shortest flag.

        Args:
            video_path: Path to video or image file
            audio_path: Path to audio file
            output_path: Path to output file
            resolution: Output resolution as 'WxH'

        Returns:
            output_path
        """
        width, height = self._parse_resolution(resolution)

        cmd = [
            self.ffmpeg, "-y",
            "-i", video_path,
            "-i", audio_path,
            "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                   f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1",
            "-c:v", "libx264", "-preset", "medium",
            "-crf", "23", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            "-movflags", "+faststart",
            output_path,
        ]
        self._run_ffmpeg(cmd)
        return output_path

    def compose_scene_ab_split(
        self,
        video_a: str,
        video_b: str,
        audio_path: str,
        output_path: str,
        resolution: str = "1080x1920",
    ) -> str:
        """
        A/B split: play video_a for first half, video_b for second half.

        Uses FFmpeg trim + concat with xfade transition between halves.
        Syncs final duration to audio.

        Args:
            video_a: Path to first video
            video_b: Path to second video
            audio_path: Path to audio file
            output_path: Path to output file
            resolution: Output resolution as 'WxH'

        Returns:
            output_path
        """
        width, height = self._parse_resolution(resolution)
        audio_dur = self._get_duration(audio_path)
        half_dur = audio_dur / 2.0
        trans_dur = min(0.5, half_dur * 0.2)

        cmd = [
            self.ffmpeg, "-y",
            "-i", video_a,
            "-i", video_b,
            "-i", audio_path,
            "-filter_complex",
            (
                f"[0:v]trim=0:{half_dur},setpts=PTS-STARTPTS,"
                f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1[a];"
                f"[1:v]trim=0:{half_dur},setpts=PTS-STARTPTS,"
                f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1[b];"
                f"[a][b]xfade=transition=fade:duration={trans_dur}:offset={half_dur - trans_dur}[v]"
            ),
            "-map", "[v]", "-map", "2:a",
            "-c:v", "libx264", "-preset", "medium",
            "-crf", "23", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-t", str(audio_dur),
            "-movflags", "+faststart",
            output_path,
        ]
        self._run_ffmpeg(cmd)
        return output_path

    def add_captions(
        self,
        video_path: str,
        captions: list[dict],
        output_path: str,
        font_size: int = 24,
        font_color: str = "white",
        bg_opacity: float = 0.6,
    ) -> str:
        """
        Burn subtitles onto video using FFmpeg drawtext filter.

        Args:
            video_path: Path to input video
            captions: List of {text, start, end} dicts (times in seconds)
            output_path: Path to output video
            font_size: Caption font size
            font_color: Caption text color
            bg_opacity: Background box opacity (0.0-1.0)

        Returns:
            output_path

        Note:
            Requires FFmpeg compiled with --enable-libfreetype.
        """
        if not captions:
            raise ValueError("No captions provided")

        box_color_alpha = int(bg_opacity * 255)

        # Get video dimensions for bottom 20% positioning
        cmd = [
            self.ffprobe, "-v", "quiet",
            "-show_entries", "stream=width,height",
            "-select_streams", "v:0",
            "-of", "csv=p=0:s=x",
            video_path,
        ]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            dims = result.stdout.strip().split("x")
            vid_h = int(dims[1])
        except (subprocess.CalledProcessError, ValueError, IndexError):
            vid_h = 1920  # fallback portrait default

        caption_y = int(vid_h * 0.8)

        # Build filter chain — one drawtext per caption
        filters = []
        for cap in captions:
            text = self._escape_drawtext(cap["text"])
            start = cap["start"]
            end = cap["end"]
            filters.append(
                f"drawtext=text='{text}'"
                f":fontsize={font_size}"
                f":fontcolor={font_color}"
                f":x=(w-text_w)/2"
                f":y={caption_y}"
                f":box=1"
                f":boxcolor=black@{box_color_alpha}"
                f":boxborderw=8"
                f":enable='between(t,{start},{end})'"
            )

        vf = ",".join(filters)

        cmd = [
            self.ffmpeg, "-y",
            "-i", video_path,
            "-vf", vf,
            "-c:v", "libx264", "-preset", "medium",
            "-crf", "23", "-pix_fmt", "yuv420p",
            "-c:a", "copy",
            "-movflags", "+faststart",
            output_path,
        ]
        self._run_ffmpeg(cmd)
        return output_path

    def stitch_scenes(
        self,
        scene_paths: list[str],
        output_path: str,
        transition: str = "fade",
        transition_duration: float = 0.5,
    ) -> str:
        """
        Concatenate multiple scenes with transitions between them.

        Args:
            scene_paths: List of paths to scene video files
            output_path: Path to output video
            transition: 'fade', 'slide', 'wipe', or 'none'
            transition_duration: Duration of each transition in seconds

        Returns:
            output_path
        """
        if not scene_paths:
            raise ValueError("No scenes provided")
        if len(scene_paths) == 1:
            shutil.copy2(scene_paths[0], output_path)
            return output_path

        if transition == "none":
            return self._concat_scenes(scene_paths, output_path)

        # Get durations of all scenes
        durations = [self._get_duration(p) for p in scene_paths]
        total_dur = sum(durations)
        trans_dur = transition_duration
        n = len(scene_paths)
        total_trans = (n - 1) * trans_dur

        if total_trans >= total_dur:
            # Transitions would consume all video time — fall back to concat
            return self._concat_scenes(scene_paths, output_path)

        xfade_map = {
            "fade": "fade",
            "slide": "slideleft",
            "wipe": "wipeleft",
        }
        xfade_effect = xfade_map.get(transition, "fade")

        cmd = [self.ffmpeg, "-y"]
        for path in scene_paths:
            cmd.extend(["-i", path])

        # Video: normalize fps, then chain xfade transitions
        v_norm_segments = []
        v_norm_labels = []
        norm_fps = 30
        for i in range(n):
            norm_label = f"vn{i}"
            v_norm_segments.append(
                f"[{i}:v]fps={norm_fps},setpts=PTS-STARTPTS[{norm_label}]"
            )
            v_norm_labels.append(norm_label)

        v_segments = []
        v_prev_label = v_norm_labels[0]
        accum = durations[0]
        for i in range(1, n):
            v_out = f"vx{i}" if i < n - 1 else "vout"
            offset = accum - trans_dur
            v_segments.append(
                f"[{v_prev_label}][{v_norm_labels[i]}]xfade=transition={xfade_effect}"
                f":duration={trans_dur}:offset={offset}[{v_out}]"
            )
            v_prev_label = v_out
            accum += durations[i] - trans_dur

        # Audio: normalize channel layouts, then chain acrossfade transitions
        a_norm_segments = []
        a_norm_labels = []
        for i in range(n):
            norm_label = f"an{i}"
            a_norm_segments.append(
                f"[{i}:a]aformat=channel_layouts=stereo:sample_rates=44100[{norm_label}]"
            )
            a_norm_labels.append(norm_label)

        a_segments = []
        a_prev_label = a_norm_labels[0]
        for i in range(1, n):
            a_out = f"ax{i}" if i < n - 1 else "aout"
            a_segments.append(
                f"[{a_prev_label}][{a_norm_labels[i]}]acrossfade=d={trans_dur}"
                f":c1=tri:c2=tri[{a_out}]"
            )
            a_prev_label = a_out

        filter_complex = ";".join(v_norm_segments + v_segments + a_norm_segments + a_segments)

        cmd.extend([
            "-filter_complex", filter_complex,
            "-map", "[vout]", "-map", "[aout]",
            "-c:v", "libx264", "-preset", "medium",
            "-crf", "23", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k",
            "-movflags", "+faststart",
            output_path,
        ])
        self._run_ffmpeg(cmd)
        return output_path

    def add_bgm(
        self,
        video_path: str,
        bgm_path: str,
        output_path: str,
        bgm_volume: float = 0.15,
    ) -> str:
        """
        Mix background music with video's existing audio.

        BGM is looped if shorter than video, and mixed at lower volume
        (default 15%) so narration stays dominant.

        Args:
            video_path: Path to input video (with audio)
            bgm_path: Path to background music file
            output_path: Path to output video
            bgm_volume: BGM volume multiplier (0.0-1.0)

        Returns:
            output_path
        """
        video_dur = self._get_duration(video_path)
        bgm_loops = max(1, int(video_dur / self._get_duration(bgm_path)) + 1)

        cmd = [
            self.ffmpeg, "-y",
            "-i", video_path,
            "-stream_loop", str(bgm_loops), "-i", bgm_path,
            "-filter_complex",
            f"[0:a]volume=1.0[orig];"
            f"[1:a]volume={bgm_volume},atrim=0:{video_dur}[bgm];"
            f"[orig][bgm]amix=inputs=2:duration=first:dropout_transition=2[a]",
            "-map", "0:v", "-map", "[a]",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            "-movflags", "+faststart",
            output_path,
        ]
        self._run_ffmpeg(cmd)
        return output_path

    # ── Private helpers ─────────────────────────────────────

    def _run_ffmpeg(self, args: list[str]) -> bool:
        """
        Run an FFmpeg command with error handling.

        Args:
            args: Full command as list of strings (including 'ffmpeg')

        Returns:
            True on success

        Raises:
            RuntimeError: If ffmpeg exits with non-zero status
        """
        try:
            result = subprocess.run(args, capture_output=True, text=True, check=True)
            return True
        except subprocess.CalledProcessError as e:
            stderr = e.stderr[-500:] if e.stderr else ""
            raise RuntimeError(f"ffmpeg failed (exit {e.returncode}): {stderr}")
        except FileNotFoundError:
            raise RuntimeError(f"ffmpeg not found at {self.ffmpeg}")

    def _concat_scenes(self, scene_paths: list[str], output_path: str) -> str:
        """Concatenate scenes without transitions using concat demuxer."""
        with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
            for path in scene_paths:
                f.write(f"file '{path}'\n")
            concat_file = f.name

        try:
            cmd = [
                self.ffmpeg, "-y",
                "-f", "concat", "-safe", "0",
                "-i", concat_file,
                "-c:v", "libx264", "-preset", "medium",
                "-crf", "23", "-pix_fmt", "yuv420p",
                "-c:a", "aac", "-b:a", "192k",
                "-movflags", "+faststart",
                output_path,
            ]
            self._run_ffmpeg(cmd)
        finally:
            os.unlink(concat_file)

        return output_path


# CLI entry point
if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python -m services.faceless.composer <command> [args...]")
        print("Commands: ken_burns, compose, ab_split, captions, stitch, bgm")
        sys.exit(1)

    command = sys.argv[1]
    composer = FacelessComposer()

    if command == "ken_burns" and len(sys.argv) >= 5:
        result = composer.apply_ken_burns(sys.argv[2], float(sys.argv[3]), sys.argv[4])
        print(json.dumps({"success": True, "output": result}))
    elif command == "compose" and len(sys.argv) >= 5:
        result = composer.compose_scene(sys.argv[2], sys.argv[3], sys.argv[4])
        print(json.dumps({"success": True, "output": result}))
    elif command == "stitch" and len(sys.argv) >= 4:
        scenes = sys.argv[2:-1]
        result = composer.stitch_scenes(scenes, sys.argv[-1])
        print(json.dumps({"success": True, "output": result}))
    else:
        print(f"Unknown or incomplete command: {command}")
        sys.exit(1)
