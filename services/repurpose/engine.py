#!/usr/bin/env python3
"""
Content Repurpose Engine — Production-grade content remixing & re-purposing.

Capabilities:
- Scene detection via FFmpeg for intelligent segmentation
- Dynamic text overlays with positioning, animation, and branding
- Audio remixing: new BGM, voiceover, volume balancing
- Transitions: crossfade, fade-through-black, wipe, zoom
- Speed manipulation: slow-mo highlights, speed-up filler
- Color grading: cinematic, warm, cool, vibrant, vintage
- Watermark/branding overlay
- Platform-specific output (TikTok 9:16, IG 4:5, YouTube 16:9)
- Batch processing multiple jobs
- New metadata generation (title, caption, hashtags, thumbnail)

Usage:
    from services.repurpose.engine import RepurposeEngine
    engine = RepurposeEngine()
    result = engine.repurpose(sources=["url1", "url2"], ...)
"""

import os
import json
import time
import shutil
import subprocess
import random
import re
from pathlib import Path
from typing import Optional

from services.clipper.transcriber import Transcriber
from services.clipper.reframer import Reframer
from services.trends.seo_generator import SEOGenerator


# ── Platform presets ──
PLATFORM_PRESETS = {
    "tiktok": {"width": 1080, "height": 1920, "fps": 30, "max_duration": 180, "aspect": "9:16"},
    "instagram_reels": {"width": 1080, "height": 1920, "fps": 30, "max_duration": 90, "aspect": "9:16"},
    "instagram_feed": {"width": 1080, "height": 1350, "fps": 30, "max_duration": 60, "aspect": "4:5"},
    "youtube_shorts": {"width": 1080, "height": 1920, "fps": 30, "max_duration": 60, "aspect": "9:16"},
    "youtube": {"width": 1920, "height": 1080, "fps": 30, "max_duration": 600, "aspect": "16:9"},
    "square": {"width": 1080, "height": 1080, "fps": 30, "max_duration": 60, "aspect": "1:1"},
}

# ── Color grading presets (FFmpeg LUT-style filters) ──
COLOR_PRESETS = {
    "none": "",
    "cinematic": "eq=contrast=1.1:brightness=0.05:saturation=0.9,curves=m='0/0 0.25/0.20 0.5/0.45 0.75/0.8 1/1'",
    "warm": "eq=contrast=1.05:brightness=0.03:saturation=1.15,colorbalance=rs=0.1:gs=0.05:bs=-0.05",
    "cool": "eq=contrast=1.05:brightness=0.02:saturation=0.9,colorbalance=rs=-0.05:gs=0:bs=0.1",
    "vibrant": "eq=contrast=1.15:brightness=0.02:saturation=1.4",
    "vintage": "eq=contrast=0.9:brightness=0.05:saturation=0.7,colorbalance=rs=0.1:gs=0.05:bs=-0.1",
    "dark_moody": "eq=contrast=1.2:brightness=-0.05:saturation=0.8",
    "bright_clean": "eq=contrast=1.05:brightness=0.08:saturation=1.1",
}

# ── Transition presets ──
TRANSITION_PRESETS = {
    "crossfade": {"duration": 0.5, "filter": "xfade"},
    "fade_black": {"duration": 0.8, "filter": "fade"},
    "wipe_left": {"duration": 0.5, "filter": "wipeleft"},
    "wipe_right": {"duration": 0.5, "filter": "wiperight"},
    "wipe_up": {"duration": 0.5, "filter": "wipeup"},
    "zoom_in": {"duration": 0.6, "filter": "circlecrop"},
    "none": {"duration": 0, "filter": "none"},
}

# ── Overlay positioning presets ──
OVERLAY_POSITIONS = {
    "top_center": {"x": "(w-text_w)/2", "y": "50"},
    "top_left": {"x": "50", "y": "50"},
    "top_right": {"x": "w-text_w-50", "y": "50"},
    "center": {"x": "(w-text_w)/2", "y": "(h-text_h)/2"},
    "bottom_center": {"x": "(w-text_w)/2", "y": "h-text_h-80"},
    "bottom_left": {"x": "50", "y": "h-text_h-50"},
    "lower_third": {"x": "(w-text_w)/2", "y": "h*0.72"},
}

# ── Segment classification keywords ──
HOOK_KEYWORDS = [
    "tahukah", "pernah", "gimana", "coba", "lihat", "check", "wait",
    "did you know", "have you ever", "watch this", "check this out",
    "you won't believe", "here's why", "this is crazy",
]
CTA_KEYWORDS = [
    "follow", "like", "share", "comment", "subscribe", "save",
    "ikuti", "like", "share", "komen", "subscribe", "simpan",
    "link di bio", "check link", "link in bio",
]
EXAMPLE_KEYWORDS = [
    "contoh", "misalnya", "seperti", "for example", "such as",
    "here's how", "begini caranya", "seperti ini",
]


class RepurposeEngine:
    """
    Production-grade content repurposing engine.
    
    Pipeline:
    1. Download & transcribe sources
    2. Scene-detect & segment intelligently
    3. Score segments by engagement potential
    4. Select best segments with source diversity
    5. Apply speed manipulation (slow-mo highlights, speed-up filler)
    6. Assemble with transitions
    7. Apply color grading
    8. Add dynamic text overlays
    9. Add watermark/branding
    10. Remix audio (new BGM + voiceover + volume balance)
    11. Reframe to target platform
    12. Generate new metadata + thumbnail
    """

    def __init__(self):
        self.transcriber = Transcriber(model_size='base', device='cpu', compute_type='int8')
        self.reframer = Reframer()
        self.seo = SEOGenerator()
        self.output_base = '/tmp/repurpose_output'
        self.ffmpeg = 'ffmpeg'
        self.ffprobe = 'ffprobe'

    def repurpose(
        self,
        sources: list[str],
        target_duration: int = 180,
        platform: str = "tiktok",
        niche: str = "general",
        style: str = "educational",
        language: str = "id",
        color_preset: str = "cinematic",
        transition_style: str = "crossfade",
        overlay_text: Optional[str] = None,
        overlay_position: str = "lower_third",
        watermark_text: Optional[str] = None,
        watermark_image: Optional[str] = None,
        bgm_path: Optional[str] = None,
        bgm_volume: float = 0.15,
        voiceover_path: Optional[str] = None,
        speed_range: tuple = (0.8, 1.5),
        add_subtitles: bool = True,
        subtitle_style: str = "karaoke",
        output_dir: Optional[str] = None,
    ) -> dict:
        """
        Full content repurposing pipeline.
        
        Args:
            sources: List of video URLs or local paths (2-10)
            target_duration: Target output duration in seconds
            platform: Target platform (tiktok, instagram_reels, youtube_shorts, etc.)
            niche: Content niche for SEO metadata
            style: Content style (educational, viral, storytelling, minimal)
            language: Content language (id, en)
            color_preset: Color grading (none, cinematic, warm, cool, vibrant, vintage, dark_moody, bright_clean)
            transition_style: Transition type (crossfade, fade_black, wipe_left, wipe_right, zoom_in, none)
            overlay_text: Custom overlay text (e.g., brand name, handle)
            overlay_position: Overlay position (top_center, center, bottom_center, lower_third, etc.)
            watermark_text: Watermark text (e.g., @username)
            watermark_image: Path to watermark image
            bgm_path: Path to background music file
            bgm_volume: Background music volume (0.0-1.0, default 0.15)
            voiceover_path: Path to voiceover audio file
            speed_range: Min/max speed multiplier for segments
            add_subtitles: Whether to add subtitles
            subtitle_style: Subtitle style (karaoke, minimal, bold, cinematic)
            output_dir: Custom output directory
            
        Returns:
            {
                "success": True,
                "video_path": "...",
                "thumbnail_path": "...",
                "metadata": {...},
                "segments_used": [...],
                "duration": 180,
                "platform": "tiktok",
            }
        """
        job_id = f"repurpose_{os.getpid()}_{int(time.time())}"
        work_dir = output_dir or os.path.join(self.output_base, job_id)
        os.makedirs(work_dir, exist_ok=True)

        preset = PLATFORM_PRESETS.get(platform, PLATFORM_PRESETS["tiktok"])
        target_w, target_h = preset["width"], preset["height"]
        target_fps = preset["fps"]

        try:
            # ── Step 1: Download & transcribe ──
            print(f"  📥 Processing {len(sources)} sources...")
            source_data = []
            for i, source in enumerate(sources[:10]):
                result = self._process_source(source, work_dir, i, language)
                if result:
                    source_data.append(result)

            if not source_data:
                return {"success": False, "error": "No sources could be processed"}

            # ── Step 2: Scene-detect & segment ──
            print(f"  🎬 Segmenting {len(source_data)} videos...")
            all_segments = []
            for src in source_data:
                segments = self._segment_video(src, target_duration)
                all_segments.extend(segments)

            if not all_segments:
                return {"success": False, "error": "No segments extracted"}

            # ── Step 3: Score segments ──
            print(f"  📊 Scoring {len(all_segments)} segments...")
            scored = self._score_segments(all_segments, niche)

            # ── Step 4: Select best segments ──
            print(f"  🎯 Selecting segments for {target_duration}s...")
            selected = self._select_segments(scored, target_duration)
            if not selected:
                return {"success": False, "error": "Could not select segments"}

            # ── Step 5: Process individual segments ──
            print(f"  ⚡ Processing {len(selected)} segments...")
            processed_paths = []
            for i, seg in enumerate(selected):
                seg_path = self._process_segment(
                    seg, i, work_dir, target_w, target_h, target_fps,
                    speed_range, color_preset,
                )
                if seg_path:
                    processed_paths.append(seg_path)

            if not processed_paths:
                return {"success": False, "error": "No segments could be processed"}

            # ── Step 6: Assemble with transitions ──
            print(f"  🔗 Assembling {len(processed_paths)} segments...")
            assembled = self._assemble_with_transitions(
                processed_paths, work_dir, transition_style
            )
            if not assembled:
                return {"success": False, "error": "Assembly failed"}

            # ── Step 7: Add text overlays ──
            if overlay_text:
                print(f"  🖼️ Adding text overlay...")
                overlaid = self._add_text_overlay(
                    assembled, overlay_text, overlay_position, target_w, target_h, work_dir
                )
            else:
                overlaid = assembled

            # ── Step 8: Add watermark ──
            if watermark_text or watermark_image:
                print(f"  💧 Adding watermark...")
                watermarked = self._add_watermark(
                    overlaid, watermark_text, watermark_image, target_w, target_h, work_dir
                )
            else:
                watermarked = overlaid

            # ── Step 9: Add subtitles ──
            if add_subtitles:
                print(f"  📝 Adding subtitles ({subtitle_style})...")
                subtitled = self._add_subtitles(
                    watermarked, selected, subtitle_style, target_w, target_h, work_dir
                )
            else:
                subtitled = watermarked

            # ── Step 10: Remix audio ──
            if bgm_path or voiceover_path:
                print(f"  🎵 Remixing audio...")
                remixed = self._remix_audio(
                    subtitled, bgm_path, bgm_volume, voiceover_path, work_dir
                )
            else:
                remixed = subtitled

            # ── Step 11: Final encode ──
            print(f"  🎞️ Final encoding...")
            final_path = os.path.join(work_dir, f"repurpose_{job_id}.mp4")
            self._final_encode(remixed, final_path, target_w, target_h, target_fps)

            # ── Step 12: Generate thumbnail ──
            print(f"  🖼️ Generating thumbnail...")
            thumbnail_path = self._generate_thumbnail(final_path, selected, work_dir, target_w, target_h)

            # ── Step 13: Generate metadata ──
            print(f"  📋 Generating metadata...")
            metadata = self._generate_metadata(selected, niche, platform, language)

            # Cleanup temp files
            self._cleanup_temp(work_dir, final_path, thumbnail_path)

            print(f"  ✅ Content repurpose complete!")

            return {
                "success": True,
                "job_id": job_id,
                "video_path": final_path,
                "thumbnail_path": thumbnail_path,
                "metadata": metadata,
                "segments_used": [
                    {
                        "source_idx": s.get("source_idx", 0),
                        "type": s.get("type", "unknown"),
                        "start": round(s.get("start", 0), 2),
                        "end": round(s.get("end", 0), 2),
                        "duration": round(s.get("duration", 0), 2),
                        "score": s.get("score", 0),
                        "speed": s.get("speed", 1.0),
                    }
                    for s in selected
                ],
                "sources_used": [s.get("source", "") for s in source_data],
                "duration": target_duration,
                "platform": platform,
                "output_dir": work_dir,
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    def batch_repurpose(
        self,
        jobs: list[dict],
    ) -> list[dict]:
        """Process multiple repurpose jobs sequentially."""
        results = []
        for job in jobs:
            result = self.repurpose(**job)
            results.append(result)
        return results

    # ═══════════════════════════════════════════════════════════
    # INTERNAL PIPELINE
    # ═══════════════════════════════════════════════════════════

    def _process_source(self, source: str, work_dir: str, idx: int, language: str) -> Optional[dict]:
        """Download and transcribe a single source."""
        src_dir = os.path.join(work_dir, f"source_{idx}")
        os.makedirs(src_dir, exist_ok=True)

        try:
            if source.startswith("http"):
                video_path = self._download_video(source, src_dir)
            else:
                video_path = source

            if not video_path or not os.path.exists(video_path):
                return None

            duration = self._get_duration(video_path)
            if duration < 3:
                return None

            transcript = self.transcriber.transcribe(video_path, language=language)

            return {
                "source": source,
                "video_path": video_path,
                "duration": duration,
                "transcript": transcript,
                "source_idx": idx,
            }
        except Exception as e:
            print(f"    ⚠️ Source {idx} failed: {e}")
            return None

    def _segment_video(self, source_data: dict, target_duration: int) -> list[dict]:
        """Segment video using scene detection + transcript boundaries."""
        video_path = source_data["video_path"]
        duration = source_data["duration"]
        transcript = source_data.get("transcript", {})
        source_idx = source_data["source_idx"]

        # Try scene detection via FFmpeg
        scenes = self._detect_scenes(video_path)

        # If scene detection fails, fall back to transcript-based
        if not scenes or len(scenes) < 3:
            scenes = self._transcript_based_segments(transcript, duration)

        # If still no segments, use equal chunks
        if not scenes:
            scenes = self._equal_chunks(duration, target_duration)

        # Enrich with transcript text and classification
        segments = []
        transcript_segments = transcript.get("segments", [])

        for scene in scenes:
            start = scene["start"]
            end = scene["end"]
            seg_dur = end - start

            # Skip very short or very long segments
            if seg_dur < 2 or seg_dur > 45:
                continue

            # Find overlapping transcript text
            text = self._get_text_for_range(transcript_segments, start, end)
            seg_type = self._classify_segment(text, start, duration)

            segments.append({
                "source_idx": source_idx,
                "source": video_path,
                "start": start,
                "end": end,
                "duration": seg_dur,
                "type": seg_type,
                "text": text,
                "score": 0,
                "speed": 1.0,
            })

        return segments

    def _detect_scenes(self, video_path: str) -> list[dict]:
        """Detect scene changes using FFmpeg's scene filter."""
        try:
            cmd = [
                self.ffmpeg, "-i", video_path,
                "-vf", "select='gt(scene,0.3)',showinfo",
                "-vsync", "vfr",
                "-f", "null", "-"
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

            # Parse scene timestamps from showinfo output
            scenes = []
            for line in result.stderr.split("\n"):
                if "pts_time:" in line:
                    match = re.search(r"pts_time:(\d+\.?\d*)", line)
                    if match:
                        scenes.append(float(match.group(1)))

            # Build scene boundaries
            duration = self._get_duration(video_path)
            boundaries = [0] + scenes + [duration]
            return [
                {"start": boundaries[i], "end": boundaries[i + 1]}
                for i in range(len(boundaries) - 1)
            ]
        except Exception:
            return []

    def _transcript_based_segments(self, transcript: dict, duration: float) -> list[dict]:
        """Create segments from transcript sentence boundaries."""
        transcript_segments = transcript.get("segments", [])
        if not transcript_segments:
            return []

        scenes = []
        current_start = 0
        current_text = ""

        for seg in transcript_segments:
            seg_end = seg.get("end", 0)
            seg_text = seg.get("text", "").strip()
            current_text += " " + seg_text

            elapsed = seg_end - current_start
            if elapsed >= 8 and (elapsed >= 20 or self._is_sentence_end(seg_text)):
                scenes.append({"start": current_start, "end": seg_end})
                current_start = seg_end
                current_text = ""

        if current_start < duration - 2:
            scenes.append({"start": current_start, "end": duration})

        return scenes

    def _equal_chunks(self, duration: float, target_duration: int) -> list[dict]:
        """Split into equal chunks as fallback."""
        chunk_size = min(15, duration / max(3, int(duration / 15)))
        chunks = []
        t = 0
        while t < duration:
            end = min(t + chunk_size, duration)
            chunks.append({"start": t, "end": end})
            t = end
        return chunks

    def _get_text_for_range(self, transcript_segments: list[dict], start: float, end: float) -> str:
        """Extract transcript text overlapping with a time range."""
        texts = []
        for seg in transcript_segments:
            seg_start = seg.get("start", 0)
            seg_end = seg.get("end", 0)
            # Check overlap
            if seg_end >= start and seg_start <= end:
                texts.append(seg.get("text", "").strip())
        return " ".join(texts)

    def _classify_segment(self, text: str, start: float, total_duration: float) -> str:
        """Classify segment by position and content."""
        text_lower = text.lower()

        if start < 5 or any(w in text_lower for w in HOOK_KEYWORDS):
            return "hook"
        if start > total_duration - 15 or any(w in text_lower for w in CTA_KEYWORDS):
            return "cta"
        if any(w in text_lower for w in EXAMPLE_KEYWORDS):
            return "example"
        return "explanation"

    def _is_sentence_end(self, text: str) -> bool:
        text = text.strip()
        return bool(text) and text[-1] in ".!?"

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
            score += random.randint(-5, 10)

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
        output_path = os.path.join(work_dir, f"seg_{idx:03d}.mp4")
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
        color_filter = COLOR_PRESETS.get(color_preset, "")
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
            subprocess.run(cmd, capture_output=True, timeout=120, check=True)
            if os.path.exists(output_path) and os.path.getsize(output_path) > 1000:
                return output_path
        except Exception as e:
            print(f"    ⚠️ Segment {idx} failed: {e}")
        return None

    def _assemble_with_transitions(self, paths: list[str], work_dir: str, transition: str) -> Optional[str]:
        """Assemble segments with transitions between them."""
        if transition == "none" or len(paths) <= 1:
            return self._simple_concat(paths, work_dir)

        output_path = os.path.join(work_dir, "assembled.mp4")
        concat_list = os.path.join(work_dir, "concat.txt")

        # For crossfade transitions, use xfade filter
        if transition in ("crossfade", "fade_black"):
            return self._assemble_with_xfade(paths, work_dir, transition)

        # For simple transitions, just concat with fade in/out on each segment
        return self._assemble_with_fades(paths, work_dir)

    def _simple_concat(self, paths: list[str], work_dir: str) -> Optional[str]:
        """Simple concatenation without transitions."""
        concat_list = os.path.join(work_dir, "concat.txt")
        output_path = os.path.join(work_dir, "assembled.mp4")

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
            subprocess.run(cmd, capture_output=True, timeout=300, check=True)
            return output_path if os.path.exists(output_path) else None
        except Exception:
            return None

    def _assemble_with_xfade(self, paths: list[str], work_dir: str, transition: str) -> Optional[str]:
        """Assemble with xfade transitions (requires re-encoding)."""
        if len(paths) < 2:
            return self._simple_concat(paths, work_dir)

        output_path = os.path.join(work_dir, "assembled.mp4")

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
            subprocess.run(cmd, capture_output=True, timeout=300, check=True)
            return output_path if os.path.exists(output_path) else None
        except Exception:
            # Fallback to simple concat
            return self._simple_concat(paths, work_dir)

    def _assemble_with_fades(self, paths: list[str], work_dir: str) -> Optional[str]:
        """Assemble with fade-in/out on each segment."""
        # Add fade to each segment first
        faded_paths = []
        for i, p in enumerate(paths):
            faded = os.path.join(work_dir, f"faded_{i:03d}.mp4")
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
                subprocess.run(cmd, capture_output=True, timeout=60, check=True)
                if os.path.exists(faded):
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
        output_path = os.path.join(work_dir, "overlaid.mp4")
        pos = OVERLAY_POSITIONS.get(position, OVERLAY_POSITIONS["lower_third"])

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
            subprocess.run(cmd, capture_output=True, timeout=180, check=True)
            return output_path if os.path.exists(output_path) else video_path
        except Exception:
            return video_path

    def _add_watermark(
        self, video_path: str, text: Optional[str], image: Optional[str],
        width: int, height: int, work_dir: str
    ) -> str:
        """Add watermark (text or image) to video."""
        output_path = os.path.join(work_dir, "watermarked.mp4")

        if image and os.path.exists(image):
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
            subprocess.run(cmd, capture_output=True, timeout=180, check=True)
            return output_path if os.path.exists(output_path) else video_path
        except Exception:
            return video_path

    def _add_subtitles(
        self, video_path: str, segments: list[dict],
        style: str, width: int, height: int, work_dir: str
    ) -> str:
        """Add subtitles to video."""
        output_path = os.path.join(work_dir, "subtitled.mp4")
        srt_path = os.path.join(work_dir, "subtitles.srt")

        # Generate SRT
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
                f.write(f"{self._fmt_srt(start)} --> {self._fmt_srt(end)}\n")
                f.write(f"{text[:120]}\n\n")
                current_time = end

        # Style-specific subtitle filter
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
                self.ffmpeg, "-y", "-i", video_path,
                "-vf", f"subtitles={srt_path}:force_style='{force_style}'",
                "-c:v", "libx264", "-crf", "20",
                "-c:a", "copy",
                output_path,
            ]
            subprocess.run(cmd, capture_output=True, timeout=300, check=True)
            return output_path if os.path.exists(output_path) else video_path
        except Exception:
            return video_path

    def _remix_audio(
        self, video_path: str,
        bgm_path: Optional[str], bgm_volume: float,
        voiceover_path: Optional[str], work_dir: str
    ) -> str:
        """Remix audio: mix video audio with BGM and/or voiceover."""
        output_path = os.path.join(work_dir, "audio_remixed.mp4")

        inputs = ["-i", video_path]
        filter_parts = []

        if bgm_path and os.path.exists(bgm_path):
            inputs.extend(["-i", bgm_path])
            bgm_idx = len(inputs) // 2 - 1
            # Mix: original audio (full) + BGM (low volume)
            filter_parts.append(
                f"[0:a]volume=1.0[orig];"
                f"[{bgm_idx}:a]volume={bgm_volume},aloop=loop=-1:size=2e+09[bgm];"
                f"[orig][bgm]amix=inputs=2:duration=shortest[aout]"
            )
        elif voiceover_path and os.path.exists(voiceover_path):
            inputs.extend(["-i", voiceover_path])
            vo_idx = len(inputs) // 2 - 1
            # Mix: original audio (reduced) + voiceover (full)
            filter_parts.append(
                f"[0:a]volume=0.3[orig];"
                f"[{vo_idx}:a]volume=1.0[vo];"
                f"[orig][vo]amix=inputs=2:duration=shortest[aout]"
            )
        else:
            return video_path

        filter_complex = ";".join(filter_parts)

        cmd = [
            self.ffmpeg, "-y",
            *inputs,
            "-filter_complex", filter_complex,
            "-map", "0:v",
            "-map", "[aout]",
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            output_path,
        ]

        try:
            subprocess.run(cmd, capture_output=True, timeout=300, check=True)
            return output_path if os.path.exists(output_path) else video_path
        except Exception:
            return video_path

    def _final_encode(self, video_path: str, output_path: str, width: int, height: int, fps: int):
        """Final encode with optimal settings for the target platform."""
        cmd = [
            self.ffmpeg, "-y", "-i", video_path,
            "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:color=black,fps={fps}",
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

    def _generate_thumbnail(self, video_path: str, segments: list[dict], work_dir: str, width: int, height: int) -> str:
        """Generate thumbnail from the best hook segment."""
        thumbnail_path = os.path.join(work_dir, "thumbnail.jpg")

        # Find the hook segment timestamp
        hook_time = 0
        for seg in segments:
            if seg.get("type") == "hook":
                hook_time = seg["start"] + 2
                break

        try:
            cmd = [
                self.ffmpeg, "-y",
                "-ss", str(hook_time),
                "-i", video_path,
                "-vframes", "1",
                "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2",
                "-q:v", "2",
                thumbnail_path,
            ]
            subprocess.run(cmd, capture_output=True, timeout=30, check=True)
            return thumbnail_path if os.path.exists(thumbnail_path) else ""
        except Exception:
            return ""

    def _generate_metadata(self, segments: list[dict], niche: str, platform: str, language: str) -> dict:
        """Generate completely new metadata."""
        combined = " ".join(seg.get("text", "") for seg in segments if seg.get("text"))

        try:
            title = f"Best {niche} Tips You Need To Know"
            if language == "id":
                title = f"Tips {niche} Terbaik Yang Wajib Kamu Tahu"

            seo = self.seo.generate_seo(title, combined[:500], platform, language)
            return {
                "title": seo.get("title", title),
                "caption": seo.get("caption", combined[:300]),
                "hashtags": seo.get("hashtags", []),
                "posting_time": seo.get("posting_time", "12:00"),
                "engagement_hooks": seo.get("engagement_hooks", []),
                "platform": platform,
            }
        except Exception:
            return {
                "title": f"Best {niche} Tips",
                "caption": combined[:300],
                "hashtags": [f"#{niche.replace(' ', '')}", "#tips", "#viral"],
                "posting_time": "12:00",
                "platform": platform,
            }

    def _download_video(self, url: str, output_dir: str) -> str:
        """Download video via yt-dlp."""
        output_path = os.path.join(output_dir, "source.mp4")
        try:
            cmd = [
                "yt-dlp",
                "-f", "bestvideo[height<=1080]+bestaudio/best[height<=1080]",
                "--merge-output-format", "mp4",
                "-o", output_path,
                "--no-playlist",
                "--socket-timeout", "30",
                url,
            ]
            subprocess.run(cmd, capture_output=True, timeout=180, check=True)
            return output_path if os.path.exists(output_path) else ""
        except Exception as e:
            print(f"    ⚠️ Download failed: {e}")
            return ""

    def _get_duration(self, file_path: str) -> float:
        """Get media duration via ffprobe."""
        try:
            cmd = [
                self.ffprobe, "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            return float(result.stdout.strip())
        except Exception:
            return 0

    def _cleanup_temp(self, work_dir: str, keep_path: str, thumbnail_path: str):
        """Remove intermediate temp files, keep final output."""
        for f in Path(work_dir).glob("seg_*.mp4"):
            if str(f) != keep_path:
                f.unlink(missing_ok=True)
        for f in Path(work_dir).glob("faded_*.mp4"):
            f.unlink(missing_ok=True)
        for f in Path(work_dir).glob("source_*"):
            if f.is_dir():
                shutil.rmtree(f, ignore_errors=True)

    @staticmethod
    def _fmt_srt(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        ms = int((seconds % 1) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


# CLI entry point
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m services.repurpose.engine <url1> <url2> [options]")
        print("Options: --duration 180 --platform tiktok --niche 'tech tips' --style educational")
        print("         --color cinematic --transition crossfade --overlay '@mybrand'")
        print("         --watermark '@username' --bgm music.mp3 --subtitles")
        sys.exit(1)

    urls = []
    kwargs = {
        "target_duration": 180,
        "platform": "tiktok",
        "niche": "general",
        "style": "educational",
        "color_preset": "cinematic",
        "transition_style": "crossfade",
        "add_subtitles": True,
    }

    i = 1
    while i < len(sys.argv):
        arg = sys.argv[i]
        if arg == "--duration":
            kwargs["target_duration"] = int(sys.argv[i + 1]); i += 2
        elif arg == "--platform":
            kwargs["platform"] = sys.argv[i + 1]; i += 2
        elif arg == "--niche":
            kwargs["niche"] = sys.argv[i + 1]; i += 2
        elif arg == "--style":
            kwargs["style"] = sys.argv[i + 1]; i += 2
        elif arg == "--color":
            kwargs["color_preset"] = sys.argv[i + 1]; i += 2
        elif arg == "--transition":
            kwargs["transition_style"] = sys.argv[i + 1]; i += 2
        elif arg == "--overlay":
            kwargs["overlay_text"] = sys.argv[i + 1]; i += 2
        elif arg == "--watermark":
            kwargs["watermark_text"] = sys.argv[i + 1]; i += 2
        elif arg == "--bgm":
            kwargs["bgm_path"] = sys.argv[i + 1]; i += 2
        elif arg == "--subtitles":
            kwargs["add_subtitles"] = True; i += 1
        elif arg.startswith("http"):
            urls.append(arg); i += 1
        else:
            i += 1

    engine = RepurposeEngine()
    result = engine.repurpose(sources=urls, **kwargs)
    print(json.dumps(result, indent=2, default=str))
