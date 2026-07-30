"""Video processing/transform functions — segment processing, assembly, overlays, encoding."""
from __future__ import annotations

import os
import shutil
import subprocess

from ..utils import _get_duration, _fmt_srt
from services.repurpose.presets import COLOR_PRESETS, OVERLAY_POSITIONS


def _process_segment(
    ffmpeg: str,
    seg: dict, idx: int, work_dir: str,
    target_w: int, target_h: int, target_fps: int,
    speed_range: tuple,
    color_preset: str,
) -> str | None:
    """Process a single segment: extract, reframe, speed adjust, color grade."""
    output_path = os.path.join(work_dir, f"seg_{idx:03d}.mp4")
    source = seg["source"]
    start = seg["start"]
    end = seg["end"]
    speed = seg.get("speed", 1.0)
    speed = max(speed_range[0], min(speed_range[1], speed))

    filters = []

    filters.append(
        f"scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,"
        f"pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:color=black"
    )

    if abs(speed - 1.0) > 0.05:
        filters.append(f"setpts={1/speed}*PTS")

    color_filter = COLOR_PRESETS.get(color_preset, "")
    if color_filter:
        filters.append(color_filter)

    filters.append(f"fps={target_fps}")

    vf = ",".join(filters)

    af_filters = []
    if abs(speed - 1.0) > 0.05:
        af_filters.append(f"atempo={speed}")

    af = ",".join(af_filters) if af_filters else None

    cmd = [
        ffmpeg, "-y",
        "-ss", str(start),
        "-i", source,
        "-t", str(end - start),
        "-vf", vf,
        "-c:v", "libx264", "-crf", "20",
        "-preset", "fast",
        "-c:a", "aac", "-b:a", "128k",
    ]
    if af:
        cmd.extend(["-af", af])

    cmd.append(output_path)

    try:
        subprocess.run(cmd, capture_output=True, timeout=120, check=True)
        if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
            return output_path
    except Exception as e:
        print(f"    ⚠️ Segment {idx} failed: {e}")
    return None


def _assemble_with_transitions(
    ffmpeg: str, ffprobe: str, paths: list[str], work_dir: str, transition: str
) -> str | None:
    """Assemble segments with transitions between them."""
    if transition == "none" or len(paths) <= 1:
        return _simple_concat(ffmpeg, paths, work_dir)

    if transition in ("crossfade", "fade_black"):
        return _assemble_with_xfade(ffmpeg, ffprobe, paths, work_dir, transition)

    return _assemble_with_fades(ffmpeg, ffprobe, paths, work_dir)


def _simple_concat(ffmpeg: str, paths: list[str], work_dir: str) -> str | None:
    """Simple concatenation without transitions."""
    concat_list = os.path.join(work_dir, "concat.txt")
    output_path = os.path.join(work_dir, "assembled.mp4")

    with open(concat_list, "w") as f:
        for p in paths:
            f.write(f"file '{p}'\n")

    cmd = [
        ffmpeg, "-y",
        "-f", "concat", "-safe", "0",
        "-i", concat_list,
        "-c:v", "libx264", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        output_path,
    ]

    try:
        subprocess.run(cmd, capture_output=True, timeout=300, check=True)
        return output_path if os.path.exists(output_path) else None
    except Exception:
        return None


def _assemble_with_xfade(
    ffmpeg: str, ffprobe: str, paths: list[str], work_dir: str, transition: str
) -> str | None:
    """Assemble with xfade transitions (requires re-encoding)."""
    if len(paths) < 2:
        return _simple_concat(ffmpeg, paths, work_dir)

    output_path = os.path.join(work_dir, "assembled.mp4")

    inputs = []
    for p in paths:
        inputs.extend(["-i", p])

    if len(paths) > 6:
        return _assemble_with_fades(ffmpeg, ffprobe, paths, work_dir)

    n = len(paths)
    filter_parts = []
    fade_dur = 0.5

    durations = [_get_duration(ffprobe, p) for p in paths]

    offset = durations[0] - fade_dur
    filter_parts.append(
        f"[0:v][1:v]xfade=transition={transition}:duration={fade_dur}:offset={offset}[v1]"
    )

    for i in range(2, n):
        prev_label = f"v{i-1}"
        curr_label = f"v{i}"
        offset = sum(durations[:i]) - fade_dur * (i - 1)
        filter_parts.append(
            f"[{prev_label}][{i}:v]xfade=transition={transition}:duration={fade_dur}:offset={offset}[{curr_label}]"
        )

    for i in range(1, n):
        prev = f"a{i-1}" if i > 1 else "0:a"
        curr_label = f"a{i}"
        offset = sum(durations[:i]) - fade_dur * (i - 1)
        filter_parts.append(
            f"[{prev}][{i}:a]acrossfade=d={fade_dur}[{curr_label}]"
        )

    final_v = f"v{n-1}"
    final_a = f"a{n-1}"
    filter_complex = ";".join(filter_parts)

    cmd = [
        ffmpeg, "-y",
        *inputs,
        "-filter_complex", filter_complex,
        "-map", f"[{final_v}]",
        "-map", f"[{final_a}]",
        "-c:v", "libx264", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        output_path,
    ]

    try:
        subprocess.run(cmd, capture_output=True, timeout=300, check=True)
        return output_path if os.path.exists(output_path) else None
    except Exception:
        return _simple_concat(ffmpeg, paths, work_dir)


def _assemble_with_fades(
    ffmpeg: str, ffprobe: str, paths: list[str], work_dir: str,
) -> str | None:
    """Assemble with fade-in/out on each segment."""
    faded_paths = []
    for i, p in enumerate(paths):
        faded = os.path.join(work_dir, f"faded_{i:03d}.mp4")
        dur = _get_duration(ffprobe, p)
        fade_in = min(0.3, dur / 4)
        fade_out = min(0.3, dur / 4)
        fade_start = max(0, dur - fade_out)

        cmd = [
            ffmpeg, "-y", "-i", p,
            "-vf", f"fade=in:0:d={fade_in},fade=out:st={fade_start}:d={fade_out}",
            "-af", f"afade=in:0:d={fade_in},afade=out:st={fade_start}:d={fade_out}",
            "-c:v", "libx264", "-crf", "20",
            "-c:a", "aac", "-b:a", "128k",
            faded,
        ]
        try:
            subprocess.run(cmd, capture_output=True, timeout=60, check=True)
            if os.path.exists(faded):
                faded_paths.append(faded)
            else:
                faded_paths.append(p)
        except Exception:
            faded_paths.append(p)

    return _simple_concat(ffmpeg, faded_paths, work_dir)


def _add_text_overlay(
    ffmpeg: str,
    video_path: str, text: str, position: str,
    width: int, height: int, work_dir: str,
) -> str:
    """Add dynamic text overlay to video."""
    output_path = os.path.join(work_dir, "overlaid.mp4")
    pos = OVERLAY_POSITIONS.get(position, OVERLAY_POSITIONS["lower_third"])

    safe_text = text.replace("'", "'\\\\''").replace(":", "\\\\:")

    font_size = max(24, int(width * 0.04))

    filter_str = (
        f"drawtext=text='{safe_text}':"
        f"fontcolor=white:fontsize={font_size}:"
        f"x={pos['x']}:y={pos['y']}:"
        f"borderw=3:bordercolor=black:"
        f"shadowx=2:shadowy=2:shadowcolor=black@0.5:"
        f"box=1:boxcolor=black@0.6:boxborderw=15"
    )

    cmd = [
        ffmpeg, "-y", "-i", video_path,
        "-vf", filter_str,
        "-c:v", "libx264", "-crf", "20",
        "-c:a", "copy",
        output_path,
    ]

    try:
        subprocess.run(cmd, capture_output=True, timeout=180, check=True)
        return output_path if os.path.exists(output_path) else video_path
    except Exception:
        return video_path


def _add_watermark(
    ffmpeg: str,
    video_path: str, text: str | None, image: str | None,
    width: int, height: int, work_dir: str,
) -> str:
    """Add watermark (text or image) to video."""
    output_path = os.path.join(work_dir, "watermarked.mp4")

    if image and os.path.exists(image):
        wm_size = max(40, int(height * 0.04))
        filter_str = (
            f"[0:v][1:v]overlay=W-w-30:H-h-30:format=auto,format=yuv420p"
        )
        cmd = [
            ffmpeg, "-y",
            "-i", video_path,
            "-i", image,
            "-filter_complex", filter_str,
            "-c:v", "libx264", "-crf", "20",
            "-c:a", "copy",
            output_path,
        ]
    elif text:
        safe_text = text.replace("'", "'\\\\''").replace(":", "\\\\:")
        font_size = max(18, int(width * 0.025))
        filter_str = (
            f"drawtext=text='{safe_text}':"
            f"fontcolor=white@0.6:fontsize={font_size}:"
            f"x=w-tw-30:y=h-th-30:"
            f"borderw=1:bordercolor=black@0.3"
        )
        cmd = [
            ffmpeg, "-y", "-i", video_path,
            "-vf", filter_str,
            "-c:v", "libx264", "-crf", "20",
            "-c:a", "copy",
            output_path,
        ]
    else:
        return video_path

    try:
        subprocess.run(cmd, capture_output=True, timeout=180, check=True)
        return output_path if os.path.exists(output_path) else video_path
    except Exception:
        return video_path


def _add_subtitles(
    ffmpeg: str,
    video_path: str, segments: list[dict],
    style: str, width: int, height: int, work_dir: str,
) -> str:
    """Add subtitles to video."""
    output_path = os.path.join(work_dir, "subtitled.mp4")
    srt_path = os.path.join(work_dir, "subtitles.srt")

    with open(srt_path, "w") as f:
        current_time = 0
        for i, seg in enumerate(segments):
            text = seg.get("text", "").strip()
            if not text:
                current_time += seg.get("duration", 10)
                continue
            start = current_time
            end = current_time + seg.get("duration", 10)
            f.write(f"{i+1}\n")
            f.write(f"{_fmt_srt(start)} --> {_fmt_srt(end)}\n")
            f.write(f"{text[:120]}\n\n")
            current_time = end

    if style == "karaoke":
        force_style = "FontSize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Bold=1"
    elif style == "bold":
        force_style = "FontSize=28,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,Outline=3,Bold=1"
    elif style == "minimal":
        force_style = "FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=1"
    else:
        force_style = "FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2"

    try:
        cmd = [
            ffmpeg, "-y", "-i", video_path,
            "-vf", f"subtitles={srt_path}:force_style='{force_style}'",
            "-c:v", "libx264", "-crf", "20",
            "-c:a", "copy",
            output_path,
        ]
        subprocess.run(cmd, capture_output=True, timeout=300, check=True)
        return output_path if os.path.exists(output_path) else video_path
    except Exception:
        return video_path


def _final_encode(
    ffmpeg: str, video_path: str, output_path: str, width: int, height: int, fps: int,
):
    """Final encode with optimal settings for the target platform."""
    cmd = [
        ffmpeg, "-y", "-i", video_path,
        "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
               f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,fps={fps}",
        "-c:v", "libx264", "-crf", "18",
        "-preset", "medium",
        "-profile:v", "high",
        "-level", "4.1",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k",
        "-ar", "44100",
        "-movflags", "+faststart",
        output_path,
    ]

    try:
        subprocess.run(cmd, capture_output=True, timeout=300, check=True)
    except Exception:
        shutil.copy2(video_path, output_path)


def _generate_thumbnail(
    ffmpeg: str, video_path: str, segments: list[dict], work_dir: str, width: int, height: int,
) -> str:
    """Generate thumbnail from the best hook segment."""
    thumbnail_path = os.path.join(work_dir, "thumbnail.jpg")

    hook_time = 0
    for seg in segments:
        if seg.get("type") == "hook":
            hook_time = seg["start"] + 2
            break

    try:
        cmd = [
            ffmpeg, "-y",
            "-ss", str(hook_time),
            "-i", video_path,
            "-vframes", "1",
            "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,"
                   f"pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
            "-q:v", "2",
            thumbnail_path,
        ]
        subprocess.run(cmd, capture_output=True, timeout=30, check=True)
        return thumbnail_path if os.path.exists(thumbnail_path) else ""
    except Exception:
        return ""