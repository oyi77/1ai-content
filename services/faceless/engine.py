#!/usr/bin/env python3
"""
Faceless Video Engine — Orchestrator

Full pipeline: Topic → Script → Stock Footage → TTS → Compose → MP4

Supports:
- Educational, story, product, listicle, motivational styles
- TikTok (9:16), YouTube Shorts (9:16), Instagram Reels (9:16), Facebook (16:9)
- Ken Burns motion, A/B split visuals, auto-captions
- Batch production from clone plans
"""

import os
import json
import shutil
import tempfile
from pathlib import Path
from typing import Optional
from concurrent.futures import ThreadPoolExecutor

from services.faceless.script_engine import ScriptEngine
from services.faceless.stock_engine import StockEngine
from services.faceless.composer import FacelessComposer
from services.tts.engine import TTSEngine


from services.platform_presets import PLATFORM_PRESETS as _CANONICAL_PRESETS
 
 
_PLATFORM_KEY_MAP = {
    "tiktok": "tiktok",
    "youtube": "youtube_shorts",
    "instagram": "instagram_feed",
    "facebook": "facebook",
}
 
 
def _get_faceless_presets() -> dict:
    """Build faceless platform presets from canonical source."""
    presets = {}
    for faceless_key, canonical_key in _PLATFORM_KEY_MAP.items():
        c = _CANONICAL_PRESETS[canonical_key]
        presets[faceless_key] = {
            "resolution": f"{c['width']}x{c['height']}",
            "max_duration": c["max_duration"],
            "orientation": "portrait" if c["width"] < c["height"] else "landscape",
        }
    return presets
 
 
PLATFORM_PRESETS = _get_faceless_presets()


class FacelessEngine:
    """Orchestrate the full faceless video production pipeline."""

    def __init__(self):
        self.script_engine = ScriptEngine()
        self.stock_engine = StockEngine()
        self.composer = FacelessComposer()
        self.tts_engine = TTSEngine()
        self.output_base = '/tmp/faceless_output'

    def generate_video(
        self,
        topic: str,
        style: str = 'educational',
        platform: str = 'tiktok',
        language: str = 'id',
        num_scenes: int = 6,
        use_ab_split: bool = True,
        add_captions: bool = True,
        bgm_path: Optional[str] = None,
    ) -> dict:
        """Full pipeline: topic → script → stock → TTS → compose → MP4."""
        preset = PLATFORM_PRESETS.get(platform, PLATFORM_PRESETS['tiktok'])
        resolution = preset['resolution']

        # Create working directory
        job_id = f"faceless_{os.getpid()}_{int(__import__('time').time())}"
        work_dir = os.path.join(self.output_base, job_id)
        os.makedirs(work_dir, exist_ok=True)

        try:
            # Step 1: Generate script
            print(f"  📝 Generating script for: {topic}")
            script = self.script_engine.generate_script(
                topic=topic, style=style, num_scenes=num_scenes,
                language=language, platform=platform,
            )
            if not script.get('success'):
                return {'success': False, 'error': script.get('error', 'Script generation failed')}

            scenes = script.get('scenes', [])
            if not scenes:
                return {'success': False, 'error': 'No scenes generated'}

            # Step 2: Generate TTS for each scene
            print(f"  🎙️ Generating voiceovers for {len(scenes)} scenes...")
            for i, scene in enumerate(scenes):
                text = scene.get('narration_text', '')
                if not text:
                    continue
                audio_path = os.path.join(work_dir, f'scene_{i:02d}_voice.mp3')
                try:
                    voice = 'id-ID-GadisNeural' if language == 'id' else 'en-US-JennyNeural'
                    result = self.tts_engine.synthesize(text, voice=voice, output_path=audio_path)
                    if result.get('success') and os.path.exists(audio_path):
                        scene['audio_path'] = audio_path
                        scene['audio_duration'] = result.get('duration', scene.get('duration_seconds', 10))
                    else:
                        scene['audio_path'] = ''
                        scene['audio_duration'] = scene.get('duration_seconds', 10)
                except Exception as e:
                    print(f"    ⚠️ TTS failed for scene {i}: {e}")
                    scene['audio_path'] = ''
                    scene['audio_duration'] = scene.get('duration_seconds', 10)

            # Step 3: Search & download stock footage
            print(f"  🎬 Searching stock footage...")
            all_keywords = []
            for scene in scenes:
                keywords = scene.get('visual_keywords', ['nature'])
                all_keywords.extend(keywords[:2])

            stock_dir = os.path.join(work_dir, 'stock')
            stock_results = self.stock_engine.search_and_download(
                all_keywords, stock_dir, count_per_query=2 if use_ab_split else 1,
                orientation=preset['orientation'],
            )

            # Step 4: Compose each scene
            print(f"  🎞️ Composing {len(scenes)} scenes...")
            scene_paths = []
            for i, scene in enumerate(scenes):
                scene_output = os.path.join(work_dir, f'scene_{i:02d}.mp4')
                audio_path = scene.get('audio_path', '')
                duration = scene.get('audio_duration', 10)
                # Guard against missing/invalid TTS output — composer crashes on '' audio
                if audio_path and not os.path.exists(audio_path):
                    audio_path = ''

                # Get stock footage for this scene
                keywords = scene.get('visual_keywords', ['nature'])
                stock_a = self._find_stock(stock_results, keywords[0] if keywords else 'nature')
                stock_b = self._find_stock(stock_results, keywords[1] if len(keywords) > 1 else keywords[0] if keywords else 'nature')

                if audio_path and use_ab_split and stock_a and stock_b:
                    # A/B split composition
                    self.composer.compose_scene_ab_split(
                        stock_a, stock_b, audio_path, scene_output, resolution=resolution,
                    )
                elif audio_path and stock_a:
                    # Single visual
                    self.composer.compose_scene(stock_a, audio_path, scene_output, resolution=resolution)
                else:
                    # Fallback: Ken Burns on generated color
                    self._create_color_fallback(scene_output, duration, resolution, audio_path)

                if os.path.exists(scene_output):
                    scene_paths.append(scene_output)

            if not scene_paths:
                return {'success': False, 'error': 'No scenes composed'}

            # Step 5: Stitch scenes with transitions
            print(f"  ✂️ Stitching {len(scene_paths)} scenes...")
            raw_output = os.path.join(work_dir, 'raw.mp4')
            self.composer.stitch_scenes(scene_paths, raw_output, transition='fade')

            # Step 6: Add captions
            final_output = os.path.join(work_dir, f'{job_id}.mp4')
            if add_captions:
                print(f"  📝 Adding captions...")
                # Build caption list from scene narrations
                captions = []
                time_offset = 0
                for scene in scenes:
                    text = scene.get('narration_text', '')
                    duration = scene.get('audio_duration', 10)
                    if text:
                        captions.append({
                            'text': text[:100],  # Truncate long text
                            'start': time_offset,
                            'end': time_offset + duration,
                        })
                    time_offset += duration

                self.composer.add_captions(raw_output, captions, final_output)
            else:
                shutil.copy2(raw_output, final_output)

            # Step 7: Add BGM if provided
            if bgm_path and os.path.exists(bgm_path):
                print(f"  🎵 Adding background music...")
                with_bgm = os.path.join(work_dir, f'{job_id}_bgm.mp4')
                self.composer.add_bgm(final_output, bgm_path, with_bgm)
                if os.path.exists(with_bgm):
                    shutil.move(with_bgm, final_output)

            # Copy to final output
            dest = os.path.join(self.output_base, f'{job_id}.mp4')
            shutil.copy2(final_output, dest)

            file_size = os.path.getsize(dest) if os.path.exists(dest) else 0

            return {
                'success': True,
                'video_path': dest,
                'job_id': job_id,
                'title': script.get('title', ''),
                'scenes_count': len(scenes),
                'platform': platform,
                'resolution': resolution,
                'file_size_mb': round(file_size / 1024 / 1024, 2),
                'script': script,
            }

        except Exception as e:
            return {'success': False, 'error': str(e)}
        finally:
            # Cleanup work dir (keep final video)
            pass

    def generate_product_video(
        self,
        product_name: str,
        product_desc: str,
        price: str = '',
        style: str = 'pain_point',
        platform: str = 'tiktok',
        language: str = 'id',
    ) -> dict:
        """Generate a product/e-commerce faceless video."""
        preset = PLATFORM_PRESETS.get(platform, PLATFORM_PRESETS['tiktok'])
        resolution = preset['resolution']

        job_id = f"product_{os.getpid()}_{int(__import__('time').time())}"
        work_dir = os.path.join(self.output_base, job_id)
        os.makedirs(work_dir, exist_ok=True)

        try:
            # Generate product script
            print(f"  🛍️ Generating product script: {product_name}")
            script = self.script_engine.generate_product_script(
                product_name=product_name, product_desc=product_desc,
                price=price, style=style, language=language,
            )
            if not script.get('success'):
                return {'success': False, 'error': script.get('error', 'Script generation failed')}

            scenes = script.get('scenes', [])
            if not scenes:
                return {'success': False, 'error': 'No scenes generated'}

            # Generate TTS
            print(f"  🎙️ Generating voiceovers...")
            for i, scene in enumerate(scenes):
                text = scene.get('narration_text', '')
                if not text:
                    continue
                audio_path = os.path.join(work_dir, f'scene_{i:02d}_voice.mp3')
                try:
                    voice = 'id-ID-GadisNeural' if language == 'id' else 'en-US-JennyNeural'
                    result = self.tts_engine.synthesize(text, voice=voice, output_path=audio_path)
                    if result.get('success') and os.path.exists(audio_path):
                        scene['audio_path'] = audio_path
                        scene['audio_duration'] = result.get('duration', 10)
                    else:
                        scene['audio_path'] = ''
                        scene['audio_duration'] = 10
                except Exception:
                    scene['audio_path'] = ''
                    scene['audio_duration'] = 10

            # Search stock footage
            print(f"  🎬 Searching stock footage...")
            all_keywords = []
            for scene in scenes:
                keywords = scene.get('visual_keywords', [product_name])
                all_keywords.extend(keywords[:2])

            stock_dir = os.path.join(work_dir, 'stock')
            stock_results = self.stock_engine.search_and_download(
                all_keywords, stock_dir, count_per_query=2,
                orientation=preset['orientation'],
            )

            # Compose scenes
            print(f"  🎞️ Composing scenes...")
            scene_paths = []
            for i, scene in enumerate(scenes):
                scene_output = os.path.join(work_dir, f'scene_{i:02d}.mp4')
                audio_path = scene.get('audio_path', '')
                # Guard against missing/invalid TTS output — composer crashes on '' audio
                if audio_path and not os.path.exists(audio_path):
                    audio_path = ''
                keywords = scene.get('visual_keywords', [product_name])
                stock_a = self._find_stock(stock_results, keywords[0] if keywords else product_name)
                stock_b = self._find_stock(stock_results, keywords[1] if len(keywords) > 1 else keywords[0] if keywords else product_name)

                if audio_path and stock_a and stock_b:
                    self.composer.compose_scene_ab_split(stock_a, stock_b, audio_path, scene_output, resolution=resolution)
                elif audio_path and stock_a:
                    self.composer.compose_scene(stock_a, audio_path, scene_output, resolution=resolution)
                else:
                    self._create_color_fallback(scene_output, scene.get('audio_duration', 10), resolution, audio_path)

                if os.path.exists(scene_output):
                    scene_paths.append(scene_output)

            if not scene_paths:
                return {'success': False, 'error': 'No scenes composed'}

            # Stitch + captions
            raw_output = os.path.join(work_dir, 'raw.mp4')
            self.composer.stitch_scenes(scene_paths, raw_output, transition='fade')

            final_output = os.path.join(work_dir, f'{job_id}.mp4')
            captions = []
            time_offset = 0
            for scene in scenes:
                text = scene.get('narration_text', '')
                duration = scene.get('audio_duration', 10)
                if text:
                    captions.append({'text': text[:100], 'start': time_offset, 'end': time_offset + duration})
                time_offset += duration

            self.composer.add_captions(raw_output, captions, final_output)

            dest = os.path.join(self.output_base, f'{job_id}.mp4')
            shutil.copy2(final_output, dest)
            file_size = os.path.getsize(dest) if os.path.exists(dest) else 0

            return {
                'success': True,
                'video_path': dest,
                'job_id': job_id,
                'title': script.get('title', ''),
                'product': product_name,
                'scenes_count': len(scenes),
                'platform': platform,
                'file_size_mb': round(file_size / 1024 / 1024, 2),
                'seo': script.get('seo', {}),
                'script': script,
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def batch_generate(
        self,
        clone_plan: dict,
        platform: str = 'tiktok',
        language: str = 'id',
        max_videos: int = 10,
    ) -> dict:
        """Batch generate videos from a clone plan (output of /clone command)."""
        videos = clone_plan.get('videos', [])[:max_videos]
        if not videos:
            return {'success': False, 'error': 'No videos in clone plan'}

        results = []
        for i, video in enumerate(videos):
            print(f"\n🎬 Batch {i+1}/{len(videos)}: {video.get('title', 'Untitled')}")
            topic = video.get('title', '') + '. ' + video.get('description', '')
            result = self.generate_video(
                topic=topic, style='educational', platform=platform,
                language=language, num_scenes=4,
            )
            results.append({
                'index': i,
                'title': video.get('title', ''),
                'success': result.get('success', False),
                'video_path': result.get('video_path', ''),
                'error': result.get('error', ''),
            })

        success_count = sum(1 for r in results if r['success'])
        return {
            'success': success_count > 0,
            'total': len(videos),
            'succeeded': success_count,
            'failed': len(videos) - success_count,
            'results': results,
        }

    def _find_stock(self, stock_results: list[dict], keyword: str) -> str:
        """Find a stock video path matching a keyword."""
        for s in stock_results:
            if keyword.lower() in s.get('query', '').lower() and s.get('path'):
                if os.path.exists(s['path']):
                    return s['path']
        # Fallback: return any available stock
        for s in stock_results:
            if s.get('path') and os.path.exists(s['path']):
                return s['path']
        return ''

    def _create_color_fallback(self, output_path: str, duration: float, resolution: str, audio_path: str = ''):
        """Create a solid color background video as fallback."""
        w, h = resolution.split('x')
        cmd = [
            self.composer.ffmpeg, '-y',
            '-f', 'lavfi', '-i', f'color=c=0x1a1a2e:s={resolution}:d={duration}:r=30',
        ]
        if audio_path and os.path.exists(audio_path):
            cmd.extend(['-i', audio_path, '-c:a', 'aac', '-b:a', '128k'])
        cmd.extend([
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
            '-shortest', output_path,
        ])
        self.composer._run_ffmpeg(cmd)
