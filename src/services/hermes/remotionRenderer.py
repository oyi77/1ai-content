"""
HERMES Remotion Renderer — Programmatic video rendering with Remotion.

Uses Remotion CLI to render React components into video files.
Much more powerful than ffmpeg for animated text, transitions, effects.
"""

import asyncio
import json
import logging
import os
import subprocess
from pathlib import Path

logger = logging.getLogger(__name__)

# Paths
REMOTION_DIR = Path(__file__).parent / 'remotion'
ROOT_FILE = REMOTION_DIR / 'root.jsx'


async def render_video(
    video_src: str,
    output_path: str,
    category: str = 'fashion',
    hook_text: str = '🔥 Check this out!',
    cta_text: str = '👉 Link in comments',
    affiliate_link: str = '',
    duration_seconds: int = 30,
    fps: int = 30,
) -> dict:
    """
    Render a video using Remotion.
    
    Args:
        video_src: Source video path or URL
        output_path: Output video path
        category: Content category (fashion, kesehatan, etc.)
        hook_text: Animated hook text at the top
        cta_text: CTA text at the bottom
        affiliate_link: Affiliate link to display
        duration_seconds: Video duration in seconds
        fps: Frames per second
    
    Returns:
        dict with success, path, duration, size
    """
    duration_frames = duration_seconds * fps
    
    # Build props JSON
    props = {
        'videoSrc': video_src,
        'category': category,
        'hookText': hook_text,
        'ctaText': cta_text,
        'affiliateLink': affiliate_link,
        'durationFrames': duration_frames,
    }
    
    # Render command
    cmd = [
        'npx', 'remotion', 'render',
        str(ROOT_FILE),
        'HermesVideo',
        output_path,
        '--props', json.dumps(props),
        '--codec', 'h264',
        '--image-format', 'png',
    ]
    
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(REMOTION_DIR),
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
        
        if proc.returncode == 0 and Path(output_path).exists():
            size = Path(output_path).stat().st_size
            return {
                'success': True,
                'path': output_path,
                'size': size,
                'duration': duration_seconds,
                'method': 'remotion',
            }
        else:
            return {
                'success': False,
                'error': stderr.decode('utf-8', errors='ignore')[-500:],
                'stdout': stdout.decode('utf-8', errors='ignore')[-500:],
            }
    except asyncio.TimeoutError:
        return {'success': False, 'error': 'Render timed out (300s)'}
    except Exception as e:
        return {'success': False, 'error': str(e)}


async def render_compilation(
    video_paths: list,
    output_path: str,
    category: str = 'fashion',
    hook_texts: list = None,
    cta_text: str = '👉 Link in comments',
    affiliate_link: str = '',
) -> dict:
    """
    Render a compilation video from multiple source videos.
    Each segment gets its own hook text.
    """
    # For now, render each segment separately then concat
    # In future: multi-segment Remotion composition
    rendered = []
    for i, vpath in enumerate(video_paths):
        hook = hook_texts[i] if hook_texts and i < len(hook_texts) else f'🔥 Part {i+1}'
        seg_output = output_path.replace('.mp4', f'_seg{i}.mp4')
        
        result = await render_video(
            video_src=vpath,
            output_path=seg_output,
            category=category,
            hook_text=hook,
            cta_text=cta_text,
            affiliate_link=affiliate_link,
            duration_seconds=20,
        )
        
        if result['success']:
            rendered.append(seg_output)
        else:
            logger.warning(f"Segment {i} render failed: {result.get('error')}")
    
    if not rendered:
        return {'success': False, 'error': 'No segments rendered'}
    
    # Concat with ffmpeg
    concat_file = Path(output_path).parent / 'concat.txt'
    with open(concat_file, 'w') as f:
        for p in rendered:
            f.write(f"file '{p}'\n")
    
    try:
        proc = await asyncio.create_subprocess_exec(
            'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
            '-i', str(concat_file),
            '-c', 'copy',
            output_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await asyncio.wait_for(proc.communicate(), timeout=60)
        
        if proc.returncode == 0:
            size = Path(output_path).stat().st_size
            return {
                'success': True,
                'path': output_path,
                'size': size,
                'segments': len(rendered),
                'method': 'remotion+ffmpeg',
            }
    except Exception as e:
        return {'success': False, 'error': str(e)}
    
    return {'success': False, 'error': 'Concat failed'}
