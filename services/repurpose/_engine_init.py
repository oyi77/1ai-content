"""Methods carved verbatim out of ``services/repurpose/engine.py``."""

from .engine import (
    Optional,
)

from . import engine as _facade

class RepurposeEngineMixin:
    def __init__(self):
        self.transcriber = _facade.Transcriber(model_size='base', device='cpu', compute_type='int8')
        self.reframer = _facade.Reframer()
        self.seo = _facade.SEOGenerator()
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
        job_id = f"repurpose_{_facade.os.getpid()}_{int(_facade.time.time())}"
        work_dir = output_dir or _facade.os.path.join(self.output_base, job_id)
        _facade.os.makedirs(work_dir, exist_ok=True)

        preset = _facade.PLATFORM_PRESETS.get(platform, _facade.PLATFORM_PRESETS["tiktok"])
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
            final_path = _facade.os.path.join(work_dir, f"repurpose_{job_id}.mp4")
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
        src_dir = _facade.os.path.join(work_dir, f"source_{idx}")
        _facade.os.makedirs(src_dir, exist_ok=True)

        try:
            if source.startswith("http"):
                video_path = self._download_video(source, src_dir)
            else:
                video_path = source

            if not video_path or not _facade.os.path.exists(video_path):
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
            result = _facade.subprocess.run(cmd, capture_output=True, text=True, timeout=60)

            # Parse scene timestamps from showinfo output
            scenes = []
            for line in result.stderr.split("\n"):
                if "pts_time:" in line:
                    match = _facade.re.search(r"pts_time:(\d+\.?\d*)", line)
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

        if start < 5 or any(w in text_lower for w in _facade.HOOK_KEYWORDS):
            return "hook"
        if start > total_duration - 15 or any(w in text_lower for w in _facade.CTA_KEYWORDS):
            return "cta"
        if any(w in text_lower for w in _facade.EXAMPLE_KEYWORDS):
            return "example"
        return "explanation"
    def _is_sentence_end(self, text: str) -> bool:
        text = text.strip()
        return bool(text) and text[-1] in ".!?"
