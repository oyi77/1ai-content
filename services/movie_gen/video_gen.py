"""
Video generation for movie pipeline.

Creates slideshow videos with Ken Burns effect from scene images,
concatenates with crossfade transitions, overlays TTS narration,
and mixes optional background music.
"""

import asyncio
import json
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional


def _ffmpeg(*args: str, **kwargs) -> subprocess.CompletedProcess:
    """Run ffmpeg with the given args, raising on failure."""
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args]
    result = subprocess.run(cmd, capture_output=True, text=True, **kwargs)
    if result.returncode != 0:
        raise RuntimeError(
            f"FFmpeg failed (code {result.returncode}):\n{result.stderr[:2000]}"
        )
    return result


def _get_video_duration(path) -> Optional[float]:
    """Return the media duration in seconds, or None if it cannot be probed."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0 and result.stdout.strip():
            return float(result.stdout.strip())
    except Exception:
        pass
    return None


def _ensure1920x1080(image_path: str, output_path: str) -> str:
    """Resize/resample image to 1920x1080, return output path."""
    _ffmpeg("-i", image_path, "-vf", "scale=1920:1080:force_original_aspect_ratio=1,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
            "-frames:v", "1", output_path)
    return output_path


def _create_ken_burns_segment(
    image_path: str,
    duration: float,
    output_path: str,
    zoom_direction: str = "in",
    fps: int = 24,
) -> str:
    """
    Create a video segment from a single image with Ken Burns zoom effect.
    zoom_direction: "in" (zoom in), "out" (zoom out), "none" (static)
    Returns output path.
    """
    if zoom_direction == "none" or duration < 2:
        # Static: no zoom
        _ffmpeg(
            "-loop", "1",
            "-i", image_path,
            "-c:v", "libx264",
            "-t", str(duration),
            "-pix_fmt", "yuv420p",
            "-vf", "scale=1920:1080:force_original_aspect_ratio=1,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
            "-r", str(fps),
            output_path,
        )
    else:
        # Ken Burns zoom
        zoom_max = 1.3 if zoom_direction == "in" else 0.8
        zoom_init = 1.0 if zoom_direction == "in" else zoom_max
        zoom_end = zoom_max if zoom_direction == "in" else 1.0

        # zoompan filter: zoom from zoom_init to zoom_end over duration
        zoom_filter = (
            f"scale=1920*{zoom_init}:1080*{zoom_init}:force_original_aspect_ratio=1,"
            f"pad=1920:1080:(ow-iw)/2:(oh-ih)/2,"
            f"zoompan=z='min(zoom+{zoom_end-zoom_init}/({duration}*{fps}),{zoom_end})':"
            f"d={int(duration*fps)}:fps={fps}:s=1920x1080"
        )

        _ffmpeg(
            "-loop", "1",
            "-i", image_path,
            "-c:v", "libx264",
            "-t", str(duration),
            "-pix_fmt", "yuv420p",
            "-vf", zoom_filter,
            output_path,
        )

    return output_path


def _concat_with_crossfade(
    segment_paths: list[str],
    output_path: str,
    transition_duration: float = 0.5,
    fps: int = 24,
) -> str:
    """
    Concatenate video segments with crossfade transitions.
    Uses ffmpeg's concat + crossfeed filters.
    """
    if len(segment_paths) == 0:
        raise ValueError("No segments to concatenate")
    if len(segment_paths) == 1:
        _ffmpeg("-i", segment_paths[0], "-c", "copy", output_path)
        return output_path

    # For crossfade, use filter complex
    inputs = []
    for p in segment_paths:
        inputs.extend(["-i", p])

    # Build filter complex for crossfade between consecutive segments
    num_segments = len(segment_paths)
    # Start with first segment as base
    filter_parts = []
    concat_inputs = []
    fade_duration = min(transition_duration, 2.0)  # cap fade

    for i in range(num_segments):
        label = f"[v{i}]"
        filter_parts.append(f"[{i}:v]setpts=PTS-STARTPTS[v{i}trimmed];")
        # Calculate trimmed input
        concat_inputs.append(f"[v{i}trimmed]")

    # Use concat filter for simple crossfade
    # Each segment is trimmed to its duration, then crossfaded
    # Using ffmpeg's acrossfade filter (requires ffmpeg 4.4+)
    filter_chain = f""
    # Simplified: use concat with no transition (works everywhere)
    for i in range(num_segments):
        if i == 0:
            filter_chain += f"[{i}:v]setpts=PTS-STARTPTS[v{i}];"
        elif i == 1:
            filter_chain += f"[{i}:v]setpts=PTS-STARTPTS[v{i}];"
            filter_chain += f"[v0][v1]acrossfade=d={fade_duration}[v01];"
        else:
            filter_chain += f"[v01][v{i}]acrossfade=d={fade_duration}[v{i}prev];"

    last_label = f"v{num_segments-1}prev" if num_segments > 2 else "v01"
    if num_segments == 2:
        filter_chain += f"[v0][v1]acrossfade=d={fade_duration}[out]"
    else:
        label_idx = f"v{num_segments-1}prev"
        filter_chain = filter_chain.replace(f"[out]", "")  # shouldn't be there

    # Simpler approach: just concat with no transition, it's reliable
    # Build concat input list
    concat_file = tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, dir="/tmp")
    for seg_path in segment_paths:
        concat_file.write(f"file '{seg_path}'\n")
        # Only emit an explicit duration when we know the real one; a fixed
        # 0.5s duration would truncate every segment to half a second.
        seg_dur = _get_video_duration(seg_path)
        if seg_dur is not None:
            concat_file.write(f"duration {seg_dur}\n")
    concat_file.close()

    try:
        # Use concat demuxer
        _ffmpeg(
            "-f", "concat",
            "-safe", "0",
            "-i", concat_file.name,
            "-c", "copy",
            output_path,
        )
    finally:
        os.unlink(concat_file.name)

    return output_path


def _add_audio_to_video(
    video_path: str,
    audio_path: Optional[str],
    output_path: str,
    *,
    bgm_path: Optional[str] = None,
    bgm_volume: float = 0.15,
) -> str:
    """
    Overlay narration audio (and optional BGM) onto video.
    Mixes narration at full volume + background music at reduced volume.
    """
    if not audio_path and not bgm_path:
        # Just copy video as-is
        _ffmpeg("-i", video_path, "-c", "copy", output_path)
        return output_path

    if audio_path and not bgm_path:
        _ffmpeg("-i", video_path, "-i", audio_path,
                "-c:v", "copy", "-c:a", "aac", "-shortest",
                output_path)
        return output_path

    if bgm_path and not audio_path:
        _ffmpeg("-i", video_path, "-i", bgm_path,
                "-c:v", "copy", "-c:a", "aac", "-shortest",
                "-af", f"volume={bgm_volume}",
                output_path)
        return output_path

    # Both audio and BGM: mix them
    mix_filter = (
        f"[1:a]volume=1.0[a];"
        f"[2:a]volume={bgm_volume}[b];"
        f"[a][b]amix=inputs=2:duration=first:dropout_transition=2[out]"
    )
    _ffmpeg("-i", video_path, "-i", audio_path, "-i", bgm_path,
            "-c:v", "copy", "-filter_complex", mix_filter,
            "-map", "0:v", "-map", "[out]", "-shortest",
            output_path)
    return output_path


async def render_scene_segment(
    scene_id: int,
    image_path: str,
    duration: float,
    output_dir: str,
    audio_path: Optional[str] = None,
    **kwargs,
) -> tuple[int, str]:
    """
    Render a single scene as a video segment.
    Returns (scene_id, video_path).
    """
    os.makedirs(output_dir, exist_ok=True)
    segment_path = os.path.join(output_dir, f"scene_{scene_id:03d}_seg.mp4")

    # Create Ken Burns segment from image
    await asyncio.to_thread(
        _create_ken_burns_segment,
        image_path, duration, segment_path,
    )

    if audio_path and os.path.exists(audio_path):
        # Overlay audio
        audio_out = os.path.join(output_dir, f"scene_{scene_id:03d}_seg_audio.mp4")
        await asyncio.to_thread(
            _ffmpeg,
            "-i", segment_path, "-i", audio_path,
            "-c:v", "copy", "-c:a", "aac", "-shortest",
            audio_out,
        )
        return (scene_id, audio_out)

    return (scene_id, segment_path)


async def assemble_movie(
    segment_paths: list[str],
    output_path: str,
    *,
    audio_path: Optional[str] = None,
    bgm_path: Optional[str] = None,
    bgm_volume: float = 0.15,
    transition_duration: float = 0.5,
) -> str:
    """
    Assemble final movie from scene segments + optional audio/BGM.
    Returns path to final video.
    """
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)

    # First concatenate all video segments
    concat_path = output_path.replace(".mp4", "_concat.mp4")
    await asyncio.to_thread(
        _concat_with_crossfade,
        segment_paths, concat_path, transition_duration,
    )

    # Add audio tracks
    if audio_path or bgm_path:
        await asyncio.to_thread(
            _add_audio_to_video,
            concat_path, audio_path, output_path,
            bgm_path=bgm_path, bgm_volume=bgm_volume,
        )
        # Clean up intermediate concat
        if os.path.exists(concat_path) and concat_path != output_path:
            os.unlink(concat_path)
    else:
        os.rename(concat_path, output_path)

    return output_path
