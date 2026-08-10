#!/usr/bin/env python3
"""
Clipper Engine — Auto-clipper orchestrator.

Pipeline: URL → Download → Transcribe → Detect Highlights → Extract Clips → Reframe → Subtitles → MP4s

Converts long-form videos into multiple viral short-form clips.
"""

import os
import shutil
import subprocess
import json
import time
from pathlib import Path
from typing import Optional

from services.clipper.transcriber import Transcriber
from services.clipper.highlight_detector import HighlightDetector
from services.clipper.reframer import Reframer


class ClipperEngine:
    """Auto-clipper: long-form video → multiple viral short-form clips."""

    def __init__(self):
        self.transcriber = Transcriber(model_size='base', device='cpu', compute_type='int8')
        self.detector = HighlightDetector()
        self.reframer = Reframer()
        self.output_base = '/tmp/clipper_output'
        self.ffmpeg = 'ffmpeg'

    def clip_video(
        self,
        source: str,
        num_clips: int = 5,
        clip_duration: int = 60,
        platform: str = 'tiktok',
        language: Optional[str] = None,
        reframe_vertical: bool = True,
        add_subtitles: bool = True,
        add_thumbnails: bool = True,
        *,
        progress_cb=None,
        cancel_check=None,
    ) -> dict:
        """Full pipeline: source URL/path → multiple viral clips."""
        job_id = f"clip_{int(time.time())}"
        work_dir = os.path.join(self.output_base, job_id)
        os.makedirs(work_dir, exist_ok=True)

        try:
            # Step 1: Get video file
            print(f"  📥 Getting video: {source}")
            video_path = self._resolve_video(source, work_dir)
            if not video_path or not os.path.exists(video_path):
                return {'success': False, 'error': f'Could not get video: {source}'}

            if progress_cb:
                progress_cb(15, 'Video resolved')
            if cancel_check and cancel_check():
                return {'success': False, 'error': 'cancelled', 'cancelled': True}

            # Step 2: Transcribe
            print(f"  📝 Transcribing video...")
            transcript = self.transcriber.transcribe_from_video(video_path, language)
            if not transcript.get('success'):
                return {'success': False, 'error': 'Transcription failed'}

            print(f"  ✅ Transcribed {len(transcript.get('segments', []))} segments, "
                  f"language: {transcript.get('language', '?')}")

            if progress_cb:
                progress_cb(40, 'Transcription complete')
            if cancel_check and cancel_check():
                return {'success': False, 'error': 'cancelled', 'cancelled': True}

            # Step 3: Detect highlights
            print(f"  🔍 Detecting {num_clips} viral moments...")
            highlights = self.detector.detect_highlights(
                transcript, num_clips=num_clips,
                clip_duration=clip_duration, platform=platform,
            )
            if not highlights.get('success'):
                return {'success': False, 'error': 'Highlight detection failed'}

            clips_data = highlights.get('clips', [])
            print(f"  ✅ Found {len(clips_data)} highlight clips")

            if progress_cb:
                progress_cb(60, 'Highlights detected')
            if cancel_check and cancel_check():
                return {'success': False, 'error': 'cancelled', 'cancelled': True}

            # Step 4: Process each clip
            results = []
            for i, clip in enumerate(clips_data):
                if cancel_check and cancel_check():
                    return {'success': False, 'error': 'cancelled', 'cancelled': True}
                print(f"\n  🎬 Clip {i+1}/{len(clips_data)}: {clip.get('title', 'Untitled')}")
                clip_result = self._process_clip(
                    video_path=video_path,
                    transcript=transcript,
                    clip=clip,
                    clip_index=i,
                    work_dir=work_dir,
                    platform=platform,
                    reframe_vertical=reframe_vertical,
                    add_subtitles=add_subtitles,
                    add_thumbnails=add_thumbnails,
                )
                results.append(clip_result)

            if progress_cb:
                progress_cb(90, 'Clips extracted')
            if cancel_check and cancel_check():
                return {'success': False, 'error': 'cancelled', 'cancelled': True}

            # Step 5: Copy final clips to output
            final_clips = []
            for r in results:
                if r.get('success') and r.get('clip_path'):
                    dest = os.path.join(self.output_base, f'{job_id}_clip{r["index"]:02d}.mp4')
                    shutil.copy2(r['clip_path'], dest)
                    r['final_path'] = dest
                    final_clips.append(r)

            success_count = sum(1 for r in final_clips if r.get('success'))

            if progress_cb:
                progress_cb(100, 'Complete')

            return {
                'success': success_count > 0,
                'job_id': job_id,
                'source': source,
                'platform': platform,
                'total_clips': len(clips_data),
                'successful_clips': success_count,
                'language': transcript.get('language', 'unknown'),
                'duration': transcript.get('duration', 0),
                'clips': final_clips,
            }

        except Exception as e:
            return {'success': False, 'error': str(e)}

    def _process_clip(
        self, video_path: str, transcript: dict, clip: dict,
        clip_index: int, work_dir: str, platform: str,
        reframe_vertical: bool, add_subtitles: bool, add_thumbnails: bool,
    ) -> dict:
        """Process a single clip: extract → reframe → subtitle → thumbnail."""
        start = clip.get('start', 0)
        end = clip.get('end', start + 60)
        clip_path = os.path.join(work_dir, f'clip_{clip_index:02d}_raw.mp4')

        # Extract clip
        print(f"    ✂️ Extracting {start:.1f}s - {end:.1f}s...")
        self.reframer.extract_clip(video_path, start, end, clip_path)
        if not os.path.exists(clip_path):
            return {'success': False, 'index': clip_index, 'error': 'Extraction failed'}

        current_path = clip_path

        # Reframe to vertical
        if reframe_vertical and platform in ('tiktok', 'instagram', 'youtube'):
            vertical_path = os.path.join(work_dir, f'clip_{clip_index:02d}_vertical.mp4')
            print(f"    📐 Reframing to 9:16...")
            self.reframer.reframe_to_vertical(current_path, vertical_path)
            if os.path.exists(vertical_path):
                current_path = vertical_path

        # Generate and burn subtitles
        if add_subtitles:
            # Find transcript segments that overlap with this clip
            clip_segments = self._get_clip_segments(transcript, start, end)
            if clip_segments:
                ass_path = os.path.join(work_dir, f'clip_{clip_index:02d}.ass')
                sub_path = os.path.join(work_dir, f'clip_{clip_index:02d}_sub.mp4')
                print(f"    📝 Generating karaoke subtitles ({len(clip_segments)} segments)...")
                self.reframer.generate_karaoke_subtitles(clip_segments, ass_path, style='tiktok')
                self.reframer.burn_subtitles(current_path, ass_path, sub_path)
                if os.path.exists(sub_path):
                    current_path = sub_path

        # Generate thumbnail
        thumbnail_path = ''
        if add_thumbnails:
            thumbnail_path = os.path.join(work_dir, f'clip_{clip_index:02d}_thumb.jpg')
            print(f"    🖼️ Generating thumbnail...")
            self.reframer.generate_thumbnail(
                current_path, 1.0, thumbnail_path,
                title=clip.get('title', ''),
            )

        # Get metadata
        clip_meta = self.detector.generate_clip_metadata(clip, platform)

        file_size = os.path.getsize(current_path) if os.path.exists(current_path) else 0

        return {
            'success': True,
            'index': clip_index,
            'clip_path': current_path,
            'thumbnail_path': thumbnail_path if os.path.exists(thumbnail_path) else '',
            'start': start,
            'end': end,
            'duration': end - start,
            'score': clip.get('score', 0),
            'hook_text': clip.get('hook_text', ''),
            'virality_reason': clip.get('virality_reason', ''),
            'title': clip_meta.get('title', clip.get('title', '')),
            'description': clip_meta.get('description', ''),
            'hashtags': clip_meta.get('hashtags', []),
            'caption': clip_meta.get('caption', ''),
            'file_size_mb': round(file_size / 1024 / 1024, 2),
        }

    def _get_clip_segments(self, transcript: dict, start: float, end: float) -> list[dict]:
        """Get transcript segments that overlap with clip time range."""
        segments = transcript.get('segments', [])
        clip_segments = []
        for seg in segments:
            seg_start = seg.get('start', 0)
            seg_end = seg.get('end', 0)
            # Check overlap
            if seg_end > start and seg_start < end:
                # Adjust to clip-relative timestamps
                adjusted = {
                    'start': max(0, seg_start - start),
                    'end': min(end - start, seg_end - start),
                    'text': seg.get('text', ''),
                    'words': [],
                }
                for w in seg.get('words', []):
                    w_start = w.get('start', 0)
                    w_end = w.get('end', 0)
                    if w_end > start and w_start < end:
                        adjusted['words'].append({
                            'start': max(0, w_start - start),
                            'end': min(end - start, w_end - start),
                            'word': w.get('word', ''),
                        })
                clip_segments.append(adjusted)
        return clip_segments

    def _resolve_video(self, source: str, work_dir: str) -> str:
        """Resolve video source — URL or local path."""
        if os.path.exists(source):
            return source

        # YouTube URL — download with yt-dlp
        if 'youtube.com' in source or 'youtu.be' in source or 'tiktok.com' in source:
            output_path = os.path.join(work_dir, 'source.mp4')
            cmd = [
                'yt-dlp', '-f', 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
                '--merge-output-format', 'mp4',
                '-o', output_path,
                source,
            ]
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                if result.returncode == 0 and os.path.exists(output_path):
                    return output_path
                # Try without format filter
                cmd_simple = ['yt-dlp', '-f', 'mp4', '-o', output_path, source]
                subprocess.run(cmd_simple, capture_output=True, text=True, timeout=300)
                if os.path.exists(output_path):
                    return output_path
            except Exception as e:
                print(f"    ⚠️ yt-dlp failed: {e}")

        return ''
