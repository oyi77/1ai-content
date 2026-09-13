"""Methods carved verbatim out of ``services/repurpose/engine.py``."""

from .engine import (
    Optional,
)

from . import engine as _facade

class RepurposeEngineMixin2:
    def _score_segments(self, segments: list[dict], niche: str) -> list[dict]:
        """Score segments by engagement potential."""
        type_scores = {
            "hook": 35, "example": 20, "explanation": 10,
            "reaction": 25, "cta": 15, "transition": 5,
        }

        for seg in segments:
            score = 50

            # Type bonus
            score += type_scores.get(seg.get("type", ""), 0)

            # Duration sweet spot (8-20 seconds)
            dur = seg.get("duration", 0)
            if 8 <= dur <= 20:
                score += 20
            elif 5 <= dur <= 30:
                score += 10

            # Text richness
            text_len = len(seg.get("text", ""))
            if text_len > 80:
                score += 15
            elif text_len > 30:
                score += 8

            # Position bonus (first 10% = hook territory)
            if seg.get("start", 0) < 10:
                score += 10

            # Random variety
            score += _facade.random.randint(-5, 10)

            seg["score"] = max(0, min(100, score))

        return sorted(segments, key=lambda s: s["score"], reverse=True)
    def _select_segments(self, scored: list[dict], target_duration: int) -> list[dict]:
        """Select best segments with source diversity and speed optimization."""
        selected = []
        current_dur = 0
        sources_used = set()
        last_source = -1

        # Always start with a hook
        hooks = [s for s in scored if s.get("type") == "hook"]
        if hooks:
            hook = hooks[0]
            selected.append(hook)
            current_dur += hook["duration"]
            sources_used.add(hook["source_idx"])
            last_source = hook["source_idx"]

        # Fill with best segments
        for seg in scored:
            if current_dur >= target_duration:
                break
            if seg in selected:
                continue

            # Prefer different source
            if seg["source_idx"] == last_source and len(sources_used) > 1:
                continue

            # Speed optimization: long segments can be sped up
            seg_dur = seg["duration"]
            effective_dur = seg_dur

            if seg_dur > 15 and seg.get("type") == "explanation":
                speed = min(1.3, target_duration / max(1, current_dur + seg_dur))
                seg["speed"] = max(0.8, speed)
                effective_dur = seg_dur / seg["speed"]

            if current_dur + effective_dur > target_duration + 15:
                continue

            selected.append(seg)
            current_dur += effective_dur
            sources_used.add(seg["source_idx"])
            last_source = seg["source_idx"]

        return selected
    def _process_segment(
        self, seg: dict, idx: int, work_dir: str,
        target_w: int, target_h: int, target_fps: int,
        speed_range: tuple,
        color_preset: str,
    ) -> Optional[str]:
        """Process a single segment: extract, reframe, speed adjust, color grade."""
        output_path = _facade.os.path.join(work_dir, f"seg_{idx:03d}.mp4")
        source = seg["source"]
        start = seg["start"]
        end = seg["end"]
        speed = seg.get("speed", 1.0)
        speed = max(speed_range[0], min(speed_range[1], speed))

        # Build FFmpeg filter chain
        filters = []

        # Scale & pad to target resolution
        filters.append(
            f"scale={target_w}:{target_h}:force_original_aspect_ratio=decrease,"
            f"pad={target_w}:{target_h}:(ow-iw)/2:(oh-ih)/2:color=black"
        )

        # Speed adjustment
        if abs(speed - 1.0) > 0.05:
            filters.append(f"setpts={1/speed}*PTS")

        # Color grading
        color_filter = _facade.COLOR_PRESETS.get(color_preset, "")
        if color_filter:
            filters.append(color_filter)

        # Frame rate
        filters.append(f"fps={target_fps}")

        vf = ",".join(filters)

        # Audio speed adjustment
        af_filters = []
        if abs(speed - 1.0) > 0.05:
            af_filters.append(f"atempo={speed}")

        af = ",".join(af_filters) if af_filters else None

        cmd = [
            self.ffmpeg, "-y",
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
            _facade.subprocess.run(cmd, capture_output=True, timeout=120, check=True)
            if _facade.os.path.exists(output_path) and _facade.os.path.getsize(output_path) > 1000:
                return output_path
        except Exception as e:
            print(f"    ⚠️ Segment {idx} failed: {e}")
        return None
    def _assemble_with_transitions(self, paths: list[str], work_dir: str, transition: str) -> Optional[str]:
        """Assemble segments with transitions between them."""
        if transition == "none" or len(paths) <= 1:
            return self._simple_concat(paths, work_dir)

        output_path = _facade.os.path.join(work_dir, "assembled.mp4")
        concat_list = _facade.os.path.join(work_dir, "concat.txt")

        # For crossfade transitions, use xfade filter
        if transition in ("crossfade", "fade_black"):
            return self._assemble_with_xfade(paths, work_dir, transition)

        # For simple transitions, just concat with fade in/out on each segment
        return self._assemble_with_fades(paths, work_dir)
    def _simple_concat(self, paths: list[str], work_dir: str) -> Optional[str]:
        """Simple concatenation without transitions."""
        concat_list = _facade.os.path.join(work_dir, "concat.txt")
        output_path = _facade.os.path.join(work_dir, "assembled.mp4")

        with open(concat_list, "w") as f:
            for p in paths:
                f.write(f"file '{p}'\n")

        cmd = [
            self.ffmpeg, "-y",
            "-f", "concat", "-safe", "0",
            "-i", concat_list,
            "-c:v", "libx264", "-crf", "20",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            output_path,
        ]

        try:
            _facade.subprocess.run(cmd, capture_output=True, timeout=300, check=True)
            return output_path if _facade.os.path.exists(output_path) else None
        except Exception:
            return None
    def _assemble_with_xfade(self, paths: list[str], work_dir: str, transition: str) -> Optional[str]:
        """Assemble with xfade transitions (requires re-encoding)."""
        if len(paths) < 2:
            return self._simple_concat(paths, work_dir)

        output_path = _facade.os.path.join(work_dir, "assembled.mp4")

        # Build complex filter graph for xfade
        inputs = []
        for p in paths:
            inputs.extend(["-i", p])

        # For simplicity with many segments, fall back to fade-based concat
        if len(paths) > 6:
            return self._assemble_with_fades(paths, work_dir)

        # Build xfade chain
        n = len(paths)
        filter_parts = []
        fade_dur = 0.5

        # Get durations
        durations = [self._get_duration(p) for p in paths]

        # First two clips
        offset = durations[0] - fade_dur
        filter_parts.append(f"[0:v][1:v]xfade=transition={transition}:duration={fade_dur}:offset={offset}[v1]")

        for i in range(2, n):
            prev_label = f"v{i-1}"
            curr_label = f"v{i}"
            offset = sum(durations[:i]) - fade_dur * (i - 1)
            filter_parts.append(
                f"[{prev_label}][{i}:v]xfade=transition={transition}:duration={fade_dur}:offset={offset}[{curr_label}]"
            )

        # Audio crossfade
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
            self.ffmpeg, "-y",
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
            _facade.subprocess.run(cmd, capture_output=True, timeout=300, check=True)
            return output_path if _facade.os.path.exists(output_path) else None
        except Exception:
            # Fallback to simple concat
            return self._simple_concat(paths, work_dir)
    def _assemble_with_fades(self, paths: list[str], work_dir: str) -> Optional[str]:
        """Assemble with fade-in/out on each segment."""
        # Add fade to each segment first
        faded_paths = []
        for i, p in enumerate(paths):
            faded = _facade.os.path.join(work_dir, f"faded_{i:03d}.mp4")
            dur = self._get_duration(p)
            fade_in = min(0.3, dur / 4)
            fade_out = min(0.3, dur / 4)
            fade_start = max(0, dur - fade_out)

            cmd = [
                self.ffmpeg, "-y", "-i", p,
                "-vf", f"fade=in:0:d={fade_in},fade=out:st={fade_start}:d={fade_out}",
                "-af", f"afade=in:0:d={fade_in},afade=out:st={fade_start}:d={fade_out}",
                "-c:v", "libx264", "-crf", "20",
                "-c:a", "aac", "-b:a", "128k",
                faded,
            ]
            try:
                _facade.subprocess.run(cmd, capture_output=True, timeout=60, check=True)
                if _facade.os.path.exists(faded):
                    faded_paths.append(faded)
                else:
                    faded_paths.append(p)
            except Exception:
                faded_paths.append(p)

        return self._simple_concat(faded_paths, work_dir)
    def _add_text_overlay(
        self, video_path: str, text: str, position: str,
        width: int, height: int, work_dir: str
    ) -> str:
        """Add dynamic text overlay to video."""
        output_path = _facade.os.path.join(work_dir, "overlaid.mp4")
        pos = _facade.OVERLAY_POSITIONS.get(position, _facade.OVERLAY_POSITIONS["lower_third"])

        # Escape special characters for FFmpeg
        safe_text = text.replace("'", "'\\''").replace(":", "\\:")

        # Font size based on resolution
        font_size = max(24, int(width * 0.04))

        # Background box for readability
        filter_str = (
            f"drawtext=text='{safe_text}':"
            f"fontcolor=white:fontsize={font_size}:"
            f"x={pos['x']}:y={pos['y']}:"
            f"borderw=3:bordercolor=black:"
            f"shadowx=2:shadowy=2:shadowcolor=black@0.5:"
            f"box=1:boxcolor=black@0.6:boxborderw=15"
        )

        cmd = [
            self.ffmpeg, "-y", "-i", video_path,
            "-vf", filter_str,
            "-c:v", "libx264", "-crf", "20",
            "-c:a", "copy",
            output_path,
        ]

        try:
            _facade.subprocess.run(cmd, capture_output=True, timeout=180, check=True)
            return output_path if _facade.os.path.exists(output_path) else video_path
        except Exception:
            return video_path
    def _add_watermark(
        self, video_path: str, text: Optional[str], image: Optional[str],
        width: int, height: int, work_dir: str
    ) -> str:
        """Add watermark (text or image) to video."""
        output_path = _facade.os.path.join(work_dir, "watermarked.mp4")

        if image and _facade.os.path.exists(image):
            # Image watermark
            wm_size = max(40, int(height * 0.04))
            filter_str = (
                f"[0:v][1:v]overlay=W-w-30:H-h-30:format=auto,format=yuv420p"
            )
            cmd = [
                self.ffmpeg, "-y",
                "-i", video_path,
                "-i", image,
                "-filter_complex", filter_str,
                "-c:v", "libx264", "-crf", "20",
                "-c:a", "copy",
                output_path,
            ]
        elif text:
            # Text watermark
            safe_text = text.replace("'", "'\\''").replace(":", "\\:")
            font_size = max(18, int(width * 0.025))
            filter_str = (
                f"drawtext=text='{safe_text}':"
                f"fontcolor=white@0.6:fontsize={font_size}:"
                f"x=w-tw-30:y=h-th-30:"
                f"borderw=1:bordercolor=black@0.3"
            )
            cmd = [
                self.ffmpeg, "-y", "-i", video_path,
                "-vf", filter_str,
                "-c:v", "libx264", "-crf", "20",
                "-c:a", "copy",
                output_path,
            ]
        else:
            return video_path

        try:
            _facade.subprocess.run(cmd, capture_output=True, timeout=180, check=True)
            return output_path if _facade.os.path.exists(output_path) else video_path
        except Exception:
            return video_path
