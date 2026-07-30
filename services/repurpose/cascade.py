"""Content Repurpose Engine — production-grade content remixing & re-purposing.

Cascade: main orchestration, RepurposeEngine class, constants.

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
    from services.repurpose.cascade import RepurposeEngine
    engine = RepurposeEngine()
    result = engine.repurpose(sources=["url1", "url2"], ...)
"""
from __future__ import annotations

import json
import os
import random
import time
from typing import Optional

from services.clipper.transcriber import Transcriber
from services.clipper.reframer import Reframer
from services.trends.seo_generator import SEOGenerator


from services.platform_presets import PLATFORM_PRESETS
from services.repurpose.presets import TRANSITION_PRESETS
from .utils import _cleanup_temp, _fmt_srt, _get_duration, _is_sentence_end
from .providers.download import _download_video
from .providers.music import _remix_audio
from .providers.reka import (
    _classify_segment,
    _detect_scenes,
    _equal_chunks,
    _get_text_for_range,
    _transcript_based_segments,
)
from .providers.social import _generate_metadata
from .providers.video import (
    _add_subtitles,
    _add_text_overlay,
    _add_watermark,
    _assemble_with_transitions,
    _final_encode,
    _generate_thumbnail,
    _process_segment,
)



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
                seg_path = _process_segment(
                    self.ffmpeg, seg, i, work_dir, target_w, target_h,
                    target_fps, speed_range, color_preset,
                )
                if seg_path:
                    processed_paths.append(seg_path)

            if not processed_paths:
                return {"success": False, "error": "No segments could be processed"}

            # ── Step 6: Assemble with transitions ──
            print(f"  🔗 Assembling {len(processed_paths)} segments...")
            assembled = _assemble_with_transitions(
                self.ffmpeg, self.ffprobe, processed_paths, work_dir, transition_style,
            )
            if not assembled:
                return {"success": False, "error": "Assembly failed"}

            # ── Step 7: Add text overlays ──
            if overlay_text:
                print(f"  🖼️ Adding text overlay...")
                overlaid = _add_text_overlay(
                    self.ffmpeg, assembled, overlay_text, overlay_position,
                    target_w, target_h, work_dir,
                )
            else:
                overlaid = assembled

            # ── Step 8: Add watermark ──
            if watermark_text or watermark_image:
                print(f"  💧 Adding watermark...")
                watermarked = _add_watermark(
                    self.ffmpeg, overlaid, watermark_text, watermark_image,
                    target_w, target_h, work_dir,
                )
            else:
                watermarked = overlaid

            # ── Step 9: Add subtitles ──
            if add_subtitles:
                print(f"  📝 Adding subtitles ({subtitle_style})...")
                subtitled = _add_subtitles(
                    self.ffmpeg, watermarked, selected, subtitle_style,
                    target_w, target_h, work_dir,
                )
            else:
                subtitled = watermarked

            # ── Step 10: Remix audio ──
            if bgm_path or voiceover_path:
                print(f"  🎵 Remixing audio...")
                remixed = _remix_audio(
                    self.ffmpeg, subtitled, bgm_path, bgm_volume,
                    voiceover_path, work_dir,
                )
            else:
                remixed = subtitled

            # ── Step 11: Final encode ──
            print(f"  🎞️ Final encoding...")
            final_path = os.path.join(work_dir, f"repurpose_{job_id}.mp4")
            _final_encode(
                self.ffmpeg, remixed, final_path, target_w, target_h, target_fps,
            )

            # ── Step 12: Generate thumbnail ──
            print(f"  🖼️ Generating thumbnail...")
            thumbnail_path = _generate_thumbnail(
                self.ffmpeg, final_path, selected, work_dir, target_w, target_h,
            )

            # ── Step 13: Generate metadata ──
            print(f"  📋 Generating metadata...")
            metadata = _generate_metadata(self.seo, selected, niche, platform, language)

            # Cleanup temp files
            _cleanup_temp(work_dir, final_path, thumbnail_path)

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
                video_path = _download_video(source, src_dir)
            else:
                video_path = source

            if not video_path or not os.path.exists(video_path):
                return None

            duration = _get_duration(self.ffprobe, video_path)
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

        scenes = _detect_scenes(self.ffmpeg, self.ffprobe, video_path)

        if not scenes or len(scenes) < 3:
            scenes = _transcript_based_segments(transcript, duration)

        if not scenes:
            scenes = _equal_chunks(duration, target_duration)

        segments = []
        transcript_segments = transcript.get("segments", [])

        for scene in scenes:
            start = scene["start"]
            end = scene["end"]
            seg_dur = end - start

            if seg_dur < 2 or seg_dur > 45:
                continue

            text = _get_text_for_range(transcript_segments, start, end)
            seg_type = _classify_segment(text, start, duration)

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

    def _score_segments(self, segments: list[dict], niche: str) -> list[dict]:
        """Score segments by engagement potential."""
        type_scores = {
            "hook": 35, "example": 20, "explanation": 10,
            "reaction": 25, "cta": 15, "transition": 5,
        }

        for seg in segments:
            score = 50

            score += type_scores.get(seg.get("type", ""), 0)

            dur = seg.get("duration", 0)
            if 8 <= dur <= 20:
                score += 20
            elif 5 <= dur <= 30:
                score += 10

            text_len = len(seg.get("text", ""))
            if text_len > 80:
                score += 15
            elif text_len > 30:
                score += 8

            if seg.get("start", 0) < 10:
                score += 10

            score += random.randint(-5, 10)

            seg["score"] = max(0, min(100, score))

        return sorted(segments, key=lambda s: s["score"], reverse=True)

    def _select_segments(self, scored: list[dict], target_duration: int) -> list[dict]:
        """Select best segments with source diversity and speed optimization."""
        selected = []
        current_dur = 0
        sources_used = set()
        last_source = -1

        hooks = [s for s in scored if s.get("type") == "hook"]
        if hooks:
            hook = hooks[0]
            selected.append(hook)
            current_dur += hook["duration"]
            sources_used.add(hook["source_idx"])
            last_source = hook["source_idx"]

        for seg in scored:
            if current_dur >= target_duration:
                break
            if seg in selected:
                continue

            if seg["source_idx"] == last_source and len(sources_used) > 1:
                continue

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


# CLI entry point
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m services.repurpose.cascade <url1> <url2> [options]")
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