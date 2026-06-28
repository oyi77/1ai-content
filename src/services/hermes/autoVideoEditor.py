"""
HERMES Auto Video Editor — CapCut-like template-based video creation.

Input: 3-5 photos/videos
Output: Professional video with transitions, text overlays

Uses ffmpeg for fast processing (agent-compatible).
"""

import asyncio
import logging
import os
import time
from pathlib import Path
from typing import List

logger = logging.getLogger(__name__)

# PIL compatibility fix for MoviePy 1.0.3
import PIL.Image
if not hasattr(PIL.Image, 'ANTIALIAS'):
    PIL.Image.ANTIALIAS = PIL.Image.LANCZOS


# ── Templates ────────────────────────────────────────────────────

TEMPLATES = {
    'fashion': {
        'name': 'Fashion Showcase',
        'transition': 'fade',
        'bg_color': '#0f0f23',
        'accent_color': '#ec4899',
        'duration_per_clip': 3,
        'transition_duration': 0.5,
    },
    'fashion_muslim': {
        'name': 'Modest Fashion',
        'transition': 'fade',
        'bg_color': '#1a0a2e',
        'accent_color': '#8b5cf6',
        'duration_per_clip': 4,
        'transition_duration': 0.8,
    },
    'kesehatan': {
        'name': 'Health & Wellness',
        'transition': 'fade',
        'bg_color': '#0a1628',
        'accent_color': '#10b981',
        'duration_per_clip': 4,
        'transition_duration': 0.6,
    },
    'home_living': {
        'name': 'Home & Living',
        'transition': 'fade',
        'bg_color': '#1a1a2e',
        'accent_color': '#6366f1',
        'duration_per_clip': 3,
        'transition_duration': 0.5,
    },
    'trading': {
        'name': 'Trading & Finance',
        'transition': 'fade',
        'bg_color': '#0a0a0a',
        'accent_color': '#f59e0b',
        'duration_per_clip': 3,
        'transition_duration': 0.3,
    },
}


# ── Auto Video Editor ───────────────────────────────────────────

class AutoVideoEditor:
    """CapCut-like auto video editor using ffmpeg."""

    def __init__(self, workspace='workspace'):
        self.workspace = Path(workspace)
        self.workspace.mkdir(parents=True, exist_ok=True)

    async def create_video(
        self,
        media_paths: List[str],
        template_name: str = 'fashion',
        hook_text: str = '',
        cta_text: str = '',
        affiliate_link: str = '',
        output_path: str = None,
        resolution: tuple = (1080, 1920),
        fps: int = 30,
    ) -> dict:
        """Create a video from media files using a template."""
        ts = int(time.time())
        if not output_path:
            output_path = str(self.workspace / f'{template_name}/auto_{ts}.mp4')
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)

        template = TEMPLATES.get(template_name, TEMPLATES['fashion'])
        w, h = resolution
        clip_dur = template['duration_per_clip']

        try:
            # Step 1: Convert each media to standardized clip
            clip_paths = []
            for i, media_path in enumerate(media_paths):
                if not Path(media_path).exists():
                    continue
                ext = Path(media_path).suffix.lower()
                clip_path = str((self.workspace / f'{template_name}/clip_{ts}_{i}.mp4').resolve())

                if ext in ('.jpg', '.jpeg', '.png', '.webp', '.gif'):
                    cmd = [
                        'ffmpeg', '-y', '-loop', '1', '-i', media_path,
                        '-vf', f'scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2',
                        '-t', str(clip_dur),
                        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                        '-pix_fmt', 'yuv420p', clip_path,
                    ]
                elif ext in ('.mp4', '.mov', '.avi', '.webm', '.mkv'):
                    cmd = [
                        'ffmpeg', '-y', '-i', media_path,
                        '-t', str(clip_dur),
                        '-vf', f'scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2',
                        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                        '-an', clip_path,
                    ]
                else:
                    continue

                proc = await asyncio.create_subprocess_exec(
                    *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await asyncio.wait_for(proc.communicate(), timeout=30)
                if proc.returncode == 0 and Path(clip_path).exists():
                    clip_paths.append(clip_path)

            if not clip_paths:
                return {'success': False, 'error': 'No valid media files'}

            # Step 2: Concatenate clips
            if len(clip_paths) == 1:
                concat_path = clip_paths[0]
            else:
                concat_path = str(self.workspace / f'{template_name}/concat_{ts}.mp4')
                concat_file = str(self.workspace / f'{template_name}/concat_{ts}.txt')
                with open(concat_file, 'w') as f:
                    for p in clip_paths:
                        # Use absolute paths for ffmpeg concat
                        abs_path = str(Path(p).resolve())
                        f.write(f"file '{abs_path}'\n")
                cmd = ['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(Path(concat_file).resolve()), '-c', 'copy', str(Path(concat_path).resolve())]
                proc = await asyncio.create_subprocess_exec(
                    *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                )
                await asyncio.wait_for(proc.communicate(), timeout=30)
                if proc.returncode != 0:
                    return {'success': False, 'error': 'Concat failed'}

            # Step 3: Add text overlays
            final_path = concat_path
            if hook_text or cta_text or affiliate_link:
                overlay_path = str(self.workspace / f'{template_name}/overlay_{ts}.mp4')
                vf_parts = []
                total_dur = clip_dur * len(clip_paths)

                if hook_text:
                    safe = hook_text.replace("'", "\\'").replace(':', '\\:')
                    vf_parts.append(f"drawtext=text='{safe}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontcolor=white:fontsize=36:borderw=2:bordercolor=black:x=(w-text_w)/2:y=40:enable='between(t,0,5)'")

                if cta_text:
                    safe = cta_text.replace("'", "\\'").replace(':', '\\:')
                    start_t = max(0, total_dur - 5)
                    vf_parts.append(f"drawtext=text='{safe}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:fontcolor=#FFD700:fontsize=28:borderw=2:bordercolor=black:x=(w-text_w)/2:y=h-80:enable='between(t,{start_t},{total_dur})'")

                if affiliate_link:
                    safe = affiliate_link.replace("'", "\\'").replace(':', '\\:')
                    vf_parts.append(f"drawtext=text='{safe}':fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:fontcolor=#FFD700:fontsize=16:x=(w-text_w)/2:y=h-40")

                if vf_parts:
                    vf = ','.join(vf_parts)
                    cmd = ['ffmpeg', '-y', '-i', concat_path, '-vf', vf,
                           '-c:v', 'libx264', '-preset', 'fast', '-crf', '23', overlay_path]
                    proc = await asyncio.create_subprocess_exec(
                        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
                    )
                    await asyncio.wait_for(proc.communicate(), timeout=30)
                    if proc.returncode == 0:
                        final_path = overlay_path

            # Step 4: Get output info
            if not Path(final_path).exists():
                return {'success': False, 'error': 'Output not created'}

            size = Path(final_path).stat().st_size
            probe = await asyncio.create_subprocess_exec(
                'ffprobe', '-v', 'quiet', '-show_entries', 'format=duration',
                '-of', 'csv=p=0', final_path,
                stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await probe.communicate()
            duration = float(stdout.decode().strip() or '0')

            # Cleanup
            for p in clip_paths:
                if p != final_path:
                    try: Path(p).unlink()
                    except: pass

            return {
                'success': True,
                'path': final_path,
                'duration': duration,
                'size': size,
                'template': template_name,
                'clips_used': len(clip_paths),
                'resolution': f'{w}x{h}',
            }

        except Exception as e:
            logger.error(f"Auto video editor error: {e}")
            return {'success': False, 'error': str(e)}

    def get_templates(self):
        return [{'id': k, 'name': v['name'], 'accent_color': v['accent_color'],
                 'duration_per_clip': v['duration_per_clip']}
                for k, v in TEMPLATES.items()]


def get_auto_editor(workspace='workspace'):
    return AutoVideoEditor(workspace)
