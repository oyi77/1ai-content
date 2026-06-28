#!/usr/bin/env python3
"""
Content Regeneration Engine — Anti-copyright content remixing.

Workflow:
1. Download N source videos from same category
2. Split each into segments (scenes/shots)
3. Mashup segments from multiple sources into ONE new video (1-5 min)
4. Add text overlays, transitions, new audio
5. Re-render with completely new metadata (title, caption, hashtags, thumbnail)

This creates derivative content that is structurally different from any single source,
avoiding copyright detection while leveraging proven viral content patterns.

Usage:
    from services.regenerator.engine import ContentRegenerator
    regen = ContentRegenerator()
    result = regen.regenerate(
        sources=["url1", "url2", "url3"],
        target_duration=180,  # 3 minutes
        niche="tech tips",
        style="educational"
    )
"""

import os
import json
import time
import shutil
import subprocess
import random
from pathlib import Path
from typing import Optional

from services.clipper.transcriber import Transcriber
from services.clipper.reframer import Reframer
from services.trends.seo_generator import SEOGenerator


# ── Segment types for intelligent mixing ──
SEGMENT_TYPES = {
    "hook": {"duration_range": (3, 8), "priority": 1, "description": "Attention-grabbing opener"},
    "explanation": {"duration_range": (10, 30), "priority": 2, "description": "Core content/explanation"},
    "example": {"duration_range": (8, 20), "priority": 3, "description": "Visual example or demo"},
    "reaction": {"duration_range": (3, 10), "priority": 4, "description": "Reaction or emotion"},
    "cta": {"duration_range": (3, 8), "priority": 5, "description": "Call to action"},
    "transition": {"duration_range": (1, 3), "priority": 0, "description": "Transition beat"},
}

# ── Overlay presets ──
OVERLAY_PRESETS = {
    "educational": {
        "text_position": "bottom",
        "font_size": 36,
        "bg_opacity": 0.7,
        "text_color": "white",
        "bg_color": "black",
        "style": "clean",
    },
    "viral": {
        "text_position": "center",
        "font_size": 48,
        "bg_opacity": 0.5,
        "text_color": "yellow",
        "bg_color": "black",
        "style": "bold",
    },
    "storytelling": {
        "text_position": "bottom",
        "font_size": 32,
        "bg_opacity": 0.8,
        "text_color": "white",
        "bg_color": "#1a1a2e",
        "style": "cinematic",
    },
    "minimal": {
        "text_position": "bottom",
        "font_size": 28,
        "bg_opacity": 0.6,
        "text_color": "white",
        "bg_color": "transparent",
        "style": "minimal",
    },
}


class ContentRegenerator:
    """
    Content regeneration engine — creates derivative content from multiple sources.
    
    Pipeline:
    1. Download & transcribe source videos
    2. Segment each video into logical chunks
    3. Score and rank segments by engagement potential
    4. Assemble best segments into a new video
    5. Add overlays, transitions, new audio
    6. Generate new metadata (title, caption, hashtags, thumbnail)
    """

    def __init__(self):
        self.transcriber = Transcriber(model_size='base', device='cpu', compute_type='int8')
        self.reframer = Reframer()
        self.seo = SEOGenerator()
        self.output_base = '/tmp/regen_output'
        self.ffmpeg = 'ffmpeg'

    def regenerate(
        self,
        sources: list[str],
        target_duration: int = 180,  # seconds
        niche: str = "general",
        style: str = "educational",
        language: str = "id",
        overlay_preset: str = "educational",
        add_subtitles: bool = True,
        add_transitions: bool = True,
        new_audio_prompt: Optional[str] = None,
        output_dir: Optional[str] = None,
    ) -> dict:
        """
        Full content regeneration pipeline.
        
        Args:
            sources: List of video URLs or local paths (3-10 recommended)
            target_duration: Target output duration in seconds (60-300)
            niche: Content niche for SEO metadata
            style: Content style (educational, viral, storytelling, minimal)
            language: Content language (id, en)
            overlay_preset: Overlay style preset
            add_subtitles: Whether to add subtitles
            add_transitions: Whether to add transitions between segments
            new_audio_prompt: Optional prompt for new background music
            output_dir: Custom output directory
            
        Returns:
            {
                "success": True,
                "video_path": "...",
                "thumbnail_path": "...",
                "metadata": { "title": "...", "caption": "...", "hashtags": [...] },
                "segments_used": [...],
                "sources_used": [...],
                "duration": 180,
            }
        """
        job_id = f"regen_{os.getpid()}_{int(time.time())}"
        work_dir = output_dir or os.path.join(self.output_base, job_id)
        os.makedirs(work_dir, exist_ok=True)

        try:
            # ── Step 1: Download & transcribe sources ──
            print(f"  📥 Processing {len(sources)} sources...")
            source_data = []
            for i, source in enumerate(sources[:10]):  # Max 10 sources
                result = self._process_source(source, work_dir, i, language)
                if result:
                    source_data.append(result)

            if not source_data:
                return {"success": False, "error": "No sources could be processed"}

            # ── Step 2: Segment all sources ──
            print(f"  ✂️ Segmenting {len(source_data)} videos...")
            all_segments = []
            for src in source_data:
                segments = self._segment_video(src, target_duration)
                all_segments.extend(segments)

            if not all_segments:
                return {"success": False, "error": "No segments extracted"}

            # ── Step 3: Score & rank segments ──
            print(f"  📊 Scoring {len(all_segments)} segments...")
            scored_segments = self._score_segments(all_segments, niche)

            # ── Step 4: Select best segments for target duration ──
            print(f"  🎯 Selecting segments for {target_duration}s...")
            selected = self._select_segments(scored_segments, target_duration)

            if not selected:
                return {"success": False, "error": "Could not select segments"}

            # ── Step 5: Assemble segments into new video ──
            print(f"  🎬 Assembling {len(selected)} segments...")
            assembled_path = self._assemble_segments(
                selected, work_dir, add_transitions
            )

            if not assembled_path or not os.path.exists(assembled_path):
                return {"success": False, "error": "Assembly failed"}

            # ── Step 6: Add overlays ──
            print(f"  🖼️ Adding overlays ({overlay_preset})...")
            overlay_config = OVERLAY_PRESETS.get(overlay_preset, OVERLAY_PRESETS["educational"])
            overlaid_path = self._add_overlays(
                assembled_path, selected, overlay_config, work_dir
            )

            # ── Step 7: Add subtitles ──
            if add_subtitles:
                print(f"  📝 Adding subtitles...")
                subtitled_path = self._add_subtitles(
                    overlaid_path, selected, work_dir
                )
            else:
                subtitled_path = overlaid_path

            # ── Step 8: Generate thumbnail ──
            print(f"  🖼️ Generating thumbnail...")
            thumbnail_path = self._generate_thumbnail(
                subtitled_path, selected, work_dir
            )

            # ── Step 9: Generate new metadata ──
            print(f"  📋 Generating metadata...")
            metadata = self._generate_metadata(selected, niche, language)

            # ── Step 10: Rename output ──
            final_path = os.path.join(work_dir, f"regen_{job_id}.mp4")
            if subtitled_path != final_path:
                shutil.move(subtitled_path, final_path)

            print(f"  ✅ Content regeneration complete!")

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
                        "start": s.get("start", 0),
                        "end": s.get("end", 0),
                        "score": s.get("score", 0),
                    }
                    for s in selected
                ],
                "sources_used": [s.get("source", "") for s in source_data],
                "duration": target_duration,
                "output_dir": work_dir,
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    # ── Internal Pipeline Steps ──────────────────────────────

    def _process_source(self, source: str, work_dir: str, idx: int, language: str) -> Optional[dict]:
        """Download and transcribe a single source video."""
        src_dir = os.path.join(work_dir, f"source_{idx}")
        os.makedirs(src_dir, exist_ok=True)

        try:
            # Download if URL
            if source.startswith("http"):
                video_path = self._download_video(source, src_dir)
            else:
                video_path = source

            if not video_path or not os.path.exists(video_path):
                return None

            # Get duration
            duration = self._get_duration(video_path)
            if duration < 5:
                return None

            # Transcribe
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
        """Split a video into logical segments based on transcript."""
        video_path = source_data["video_path"]
        duration = source_data["duration"]
        transcript = source_data.get("transcript", {})
        source_idx = source_data["source_idx"]

        segments = []
        transcript_segments = transcript.get("segments", [])

        if not transcript_segments:
            # No transcript — split into equal chunks
            chunk_size = min(15, duration / 3)
            t = 0
            while t < duration:
                end = min(t + chunk_size, duration)
                segments.append({
                    "source_idx": source_idx,
                    "source": video_path,
                    "start": t,
                    "end": end,
                    "duration": end - t,
                    "type": "explanation",
                    "text": "",
                    "score": 0,
                })
                t = end
            return segments

        # With transcript — create segments from speech boundaries
        current_start = 0
        current_text = ""

        for seg in transcript_segments:
            seg_start = seg.get("start", 0)
            seg_end = seg.get("end", 0)
            seg_text = seg.get("text", "").strip()

            current_text += " " + seg_text

            # Create segment every 10-30 seconds or at natural breaks
            elapsed = seg_end - current_start
            if elapsed >= 10 and (elapsed >= 25 or self._is_sentence_end(seg_text)):
                seg_type = self._classify_segment(current_text, current_start, duration)
                segments.append({
                    "source_idx": source_idx,
                    "source": video_path,
                    "start": current_start,
                    "end": seg_end,
                    "duration": elapsed,
                    "type": seg_type,
                    "text": current_text.strip(),
                    "score": 0,
                })
                current_start = seg_end
                current_text = ""

        # Remaining segment
        if current_start < duration - 2:
            remaining = duration - current_start
            segments.append({
                "source_idx": source_idx,
                "source": video_path,
                "start": current_start,
                "end": duration,
                "duration": remaining,
                "type": self._classify_segment(current_text, current_start, duration),
                "text": current_text.strip(),
                "score": 0,
            })

        return segments

    def _classify_segment(self, text: str, start: float, total_duration: float) -> str:
        """Classify a segment by its position and content."""
        text_lower = text.lower()

        # Position-based classification
        if start < 5:
            return "hook"
        if start > total_duration - 15:
            return "cta"

        # Content-based classification
        hook_words = ["tahukah", "pernah", "gimana", "coba", "lihat", "check", "did you know"]
        if any(w in text_lower for w in hook_words):
            return "hook"

        if any(w in text_lower for w in ["contoh", "misalnya", "seperti", "for example"]):
            return "example"

        if any(w in text_lower for w in ["jadi", "artinya", "berarti", "means", "explanation"]):
            return "explanation"

        return "explanation"

    def _is_sentence_end(self, text: str) -> bool:
        """Check if text ends a sentence."""
        text = text.strip()
        return bool(text) and text[-1] in ".!?"

    def _score_segments(self, segments: list[dict], niche: str) -> list[dict]:
        """Score segments by engagement potential."""
        for seg in segments:
            score = 50  # Base score

            # Type bonus
            type_scores = {"hook": 30, "example": 20, "explanation": 10, "reaction": 25, "cta": 15, "transition": 5}
            score += type_scores.get(seg.get("type", ""), 0)

            # Duration bonus (sweet spot: 8-20 seconds)
            dur = seg.get("duration", 0)
            if 8 <= dur <= 20:
                score += 15
            elif 5 <= dur <= 30:
                score += 5

            # Text length bonus (more content = more engaging)
            text_len = len(seg.get("text", ""))
            if text_len > 50:
                score += 10
            elif text_len > 20:
                score += 5

            # Source diversity bonus (prefer mixing sources)
            # Applied later during selection

            # Random factor for variety
            score += random.randint(-5, 10)

            seg["score"] = max(0, min(100, score))

        return sorted(segments, key=lambda s: s["score"], reverse=True)

    def _select_segments(self, scored_segments: list[dict], target_duration: int) -> list[dict]:
        """Select best segments to fill target duration, ensuring source diversity."""
        selected = []
        current_duration = 0
        sources_used = set()
        last_source = -1

        # Always start with a hook
        hooks = [s for s in scored_segments if s.get("type") == "hook"]
        if hooks:
            best_hook = hooks[0]
            selected.append(best_hook)
            current_duration += best_hook["duration"]
            sources_used.add(best_hook["source_idx"])
            last_source = best_hook["source_idx"]

        # Fill with best segments, diversifying sources
        for seg in scored_segments:
            if current_duration >= target_duration:
                break

            if seg in selected:
                continue

            # Prefer different source than last segment
            if seg["source_idx"] == last_source and len(sources_used) > 1:
                # Skip if same source as last, unless it's the only option
                continue

            # Check if adding this segment would exceed target
            if current_duration + seg["duration"] > target_duration + 10:
                continue

            selected.append(seg)
            current_duration += seg["duration"]
            sources_used.add(seg["source_idx"])
            last_source = seg["source_idx"]

        # Sort by start time within each source for logical flow
        # Actually, sort by our assembly order (score-based with source mixing)
        return selected

    def _assemble_segments(self, segments: list[dict], work_dir: str, add_transitions: bool) -> str:
        """Assemble selected segments into a single video."""
        clip_paths = []
        concat_list = os.path.join(work_dir, "concat.txt")

        for i, seg in enumerate(segments):
            clip_path = os.path.join(work_dir, f"segment_{i:03d}.mp4")
            source = seg["source"]
            start = seg["start"]
            end = seg["end"]

            # Extract segment
            cmd = [
                self.ffmpeg, "-y",
                "-ss", str(start),
                "-i", source,
                "-t", str(end - start),
                "-c:v", "libx264", "-crf", "18",
                "-c:a", "aac", "-b:a", "128k",
                "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
                "-r", "30",
                clip_path,
            ]

            try:
                subprocess.run(cmd, capture_output=True, timeout=120, check=True)
                if os.path.exists(clip_path) and os.path.getsize(clip_path) > 0:
                    clip_paths.append(clip_path)
            except Exception as e:
                print(f"    ⚠️ Segment {i} extraction failed: {e}")

        if not clip_paths:
            return ""

        # Write concat list
        with open(concat_list, "w") as f:
            for p in clip_paths:
                f.write(f"file '{p}'\n")

        # Concatenate
        output_path = os.path.join(work_dir, "assembled.mp4")
        cmd = [
            self.ffmpeg, "-y",
            "-f", "concat", "-safe", "0",
            "-i", concat_list,
            "-c:v", "libx264", "-crf", "18",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            output_path,
        ]

        try:
            subprocess.run(cmd, capture_output=True, timeout=300, check=True)
            return output_path if os.path.exists(output_path) else ""
        except Exception as e:
            print(f"    ⚠️ Concatenation failed: {e}")
            return ""

    def _add_overlays(self, video_path: str, segments: list[dict], overlay_config: dict, work_dir: str) -> str:
        """Add text overlays to video."""
        output_path = os.path.join(work_dir, "overlaid.mp4")

        # Simple overlay: add segment type label at top
        # For now, just copy — full overlay implementation needs drawtext filter
        shutil.copy2(video_path, output_path)
        return output_path

    def _add_subtitles(self, video_path: str, segments: list[dict], work_dir: str) -> str:
        """Add subtitles from segment texts."""
        output_path = os.path.join(work_dir, "subtitled.mp4")

        # Generate SRT from segments
        srt_path = os.path.join(work_dir, "subtitles.srt")
        with open(srt_path, "w") as f:
            current_time = 0
            for i, seg in enumerate(segments):
                text = seg.get("text", "").strip()
                if not text:
                    continue
                start = current_time
                end = current_time + seg.get("duration", 10)
                f.write(f"{i+1}\n")
                f.write(f"{self._format_srt_time(start)} --> {self._format_srt_time(end)}\n")
                f.write(f"{text[:100]}\n\n")
                current_time = end

        # Burn subtitles
        try:
            cmd = [
                self.ffmpeg, "-y",
                "-i", video_path,
                "-vf", f"subtitles={srt_path}:force_style='FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2'",
                "-c:v", "libx264", "-crf", "18",
                "-c:a", "copy",
                output_path,
            ]
            subprocess.run(cmd, capture_output=True, timeout=300, check=True)
            return output_path if os.path.exists(output_path) else video_path
        except Exception:
            return video_path

    def _generate_thumbnail(self, video_path: str, segments: list[dict], work_dir: str) -> str:
        """Generate thumbnail from best segment."""
        thumbnail_path = os.path.join(work_dir, "thumbnail.jpg")

        # Extract frame at 25% of video
        try:
            duration = self._get_duration(video_path)
            timestamp = duration * 0.25
            cmd = [
                self.ffmpeg, "-y",
                "-ss", str(timestamp),
                "-i", video_path,
                "-vframes", "1",
                "-q:v", "2",
                thumbnail_path,
            ]
            subprocess.run(cmd, capture_output=True, timeout=30, check=True)
            return thumbnail_path if os.path.exists(thumbnail_path) else ""
        except Exception:
            return ""

    def _generate_metadata(self, segments: list[dict], niche: str, language: str) -> dict:
        """Generate completely new metadata for the regenerated content."""
        # Combine all segment texts
        combined_text = " ".join(seg.get("text", "") for seg in segments if seg.get("text"))

        # Use SEO generator for new metadata
        try:
            title = f"Best {niche} Tips You Need To Know"
            if language == "id":
                title = f"Tips {niche} Terbaik Yang Wajib Kamu Tahu"

            seo = self.seo.generate_seo(title, combined_text[:500], "tiktok", language)
            return {
                "title": seo.get("title", title),
                "caption": seo.get("caption", combined_text[:300]),
                "hashtags": seo.get("hashtags", []),
                "posting_time": seo.get("posting_time", "12:00"),
                "engagement_hooks": seo.get("engagement_hooks", []),
            }
        except Exception:
            return {
                "title": f"Best {niche} Tips",
                "caption": combined_text[:300],
                "hashtags": [f"#{niche.replace(' ', '')}", "#tips", "#viral"],
                "posting_time": "12:00",
                "engagement_hooks": [],
            }

    def _download_video(self, url: str, output_dir: str) -> str:
        """Download video using yt-dlp."""
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
        """Get media duration in seconds."""
        try:
            cmd = [
                "ffprobe",
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                file_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            return float(result.stdout.strip())
        except Exception:
            return 0

    @staticmethod
    def _format_srt_time(seconds: float) -> str:
        """Format seconds to SRT time format (HH:MM:SS,mmm)."""
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        ms = int((seconds % 1) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


# CLI entry point
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m services.regenerator.engine <url1> <url2> [url3] ...")
        print("       --duration 180 --niche 'tech tips' --style educational")
        sys.exit(1)

    # Parse args
    urls = []
    duration = 180
    niche = "general"
    style = "educational"

    i = 1
    while i < len(sys.argv):
        if sys.argv[i] == "--duration":
            duration = int(sys.argv[i + 1])
            i += 2
        elif sys.argv[i] == "--niche":
            niche = sys.argv[i + 1]
            i += 2
        elif sys.argv[i] == "--style":
            style = sys.argv[i + 1]
            i += 2
        else:
            urls.append(sys.argv[i])
            i += 1

    if not urls:
        print("Error: No URLs provided")
        sys.exit(1)

    regen = ContentRegenerator()
    result = regen.regenerate(
        sources=urls,
        target_duration=duration,
        niche=niche,
        style=style,
    )

    print(json.dumps(result, indent=2, default=str))
