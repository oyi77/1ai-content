"""
HERMES Video Processor — Download, edit, and process videos.
Integrates: yt-dlp, TikTokDownloader, ffmpeg, VidBee, KrillinAI
"""

import asyncio
import logging
import os
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Video Download ───────────────────────────────────────────────

class VideoDownloader:
    """Download videos from TikTok, YouTube, and other platforms."""
    
    def __init__(self, workspace: str = "workspace"):
        self.workspace = Path(workspace)
        self.workspace.mkdir(parents=True, exist_ok=True)
    
    async def download_tiktok(self, url: str, output_path: str) -> dict:
        """
        Download TikTok video.
        Tries: yt-dlp first, then TikTokDownloader as fallback.
        """
        # Method 1: yt-dlp
        try:
            result = await self._run_command([
                'yt-dlp', '--no-check-certificates',
                '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                '-o', output_path,
                url
            ])
            if result['success'] and Path(output_path).exists():
                return {'success': True, 'path': output_path, 'method': 'yt-dlp'}
        except Exception as e:
            logger.warning(f"yt-dlp failed: {e}")
        
        # Method 2: TikTokDownloader (Python script)
        try:
            tiktok_script = Path(__file__).parent.parent / 'tools' / 'tiktok-downloader' / 'main.py'
            if tiktok_script.exists():
                result = await self._run_command([
                    'python3', str(tiktok_script),
                    '--url', url,
                    '--output', output_path
                ])
                if result['success'] and Path(output_path).exists():
                    return {'success': True, 'path': output_path, 'method': 'tiktok-downloader'}
        except Exception as e:
            logger.warning(f"TikTokDownloader failed: {e}")
        
        # Method 3: Browser-based download (requires browser automation)
        return {'success': False, 'error': 'All download methods failed'}
    
    async def download_youtube(self, url: str, output_path: str) -> dict:
        """Download YouTube video."""
        try:
            result = await self._run_command([
                'yt-dlp', '--no-check-certificates',
                '-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                '-o', output_path,
                url
            ])
            if result['success'] and Path(output_path).exists():
                return {'success': True, 'path': output_path, 'method': 'yt-dlp'}
        except Exception as e:
            logger.warning(f"YouTube download failed: {e}")
        
        return {'success': False, 'error': 'Download failed'}
    
    async def _run_command(self, cmd: list) -> dict:
        """Run a shell command asynchronously."""
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
            return {
                'success': proc.returncode == 0,
                'stdout': stdout.decode('utf-8', errors='ignore'),
                'stderr': stderr.decode('utf-8', errors='ignore'),
                'returncode': proc.returncode,
            }
        except asyncio.TimeoutError:
            return {'success': False, 'error': 'Command timed out'}
        except Exception as e:
            return {'success': False, 'error': str(e)}


# ── Video Editor ─────────────────────────────────────────────────

class VideoEditor:
    """Edit videos using ffmpeg."""
    
    def __init__(self, workspace: str = "workspace"):
        self.workspace = Path(workspace)
    
    async def trim(self, input_path: str, output_path: str, start: float, end: float) -> dict:
        """Trim video from start to end seconds."""
        try:
            proc = await asyncio.create_subprocess_exec(
                'ffmpeg', '-y', '-f', 'mp4', '-i', input_path,
                '-ss', str(start), '-to', str(end),
                '-c', 'copy', output_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            await proc.wait()
            return {'success': proc.returncode == 0, 'path': output_path}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def add_text_overlay(self, input_path: str, output_path: str, 
                                text: str, position: str = 'top', 
                                duration: float = 5.0) -> dict:
        """Add text overlay to video using ffmpeg drawtext."""
        try:
            # Position mapping
            y_pos = '30' if position == 'top' else 'H-80'
            
            proc = await asyncio.create_subprocess_exec(
                'ffmpeg', '-y', '-i', input_path,
                '-vf', f"drawtext=text='{text}':fontcolor=white:fontsize=24:borderw=2:bordercolor=black:x=(w-text_w)/2:y={y_pos}:enable='between(t,0,{duration})'",
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                '-c:a', 'copy',
                output_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
            return {'success': proc.returncode == 0, 'path': output_path}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def concat(self, input_paths: list, output_path: str) -> dict:
        """Concatenate multiple videos into one."""
        try:
            # Create concat file
            concat_file = self.workspace / 'concat.txt'
            with open(concat_file, 'w') as f:
                for p in input_paths:
                    f.write(f"file '{p}'\n")
            
            proc = await asyncio.create_subprocess_exec(
                'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
                '-i', str(concat_file),
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                '-c:a', 'aac', '-b:a', '128k',
                output_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
            return {'success': proc.returncode == 0, 'path': output_path}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def resize(self, input_path: str, output_path: str, 
                      width: int = 1080, height: int = 1920) -> dict:
        """Resize video for specific platform (e.g., 9:16 for Reels)."""
        try:
            proc = await asyncio.create_subprocess_exec(
                'ffmpeg', '-y', '-i', input_path,
                '-vf', f'scale={width}:{height}:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2',
                '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                '-c:a', 'copy',
                output_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=120)
            return {'success': proc.returncode == 0, 'path': output_path}
        except Exception as e:
            return {'success': False, 'error': str(e)}
    
    async def get_info(self, video_path: str) -> dict:
        """Get video metadata."""
        try:
            proc = await asyncio.create_subprocess_exec(
                'ffprobe', '-v', 'quiet', '-print_format', 'json',
                '-show_format', '-show_streams', video_path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, _ = await proc.wait()
            import json
            data = json.loads(stdout.decode())
            fmt = data.get('format', {})
            streams = data.get('streams', [])
            
            video_stream = next((s for s in streams if s.get('codec_type') == 'video'), None)
            audio_stream = next((s for s in streams if s.get('codec_type') == 'audio'), None)
            
            return {
                'duration': float(fmt.get('duration', 0)),
                'size': int(fmt.get('size', 0)),
                'video': {
                    'width': video_stream.get('width') if video_stream else None,
                    'height': video_stream.get('height') if video_stream else None,
                    'codec': video_stream.get('codec_name') if video_stream else None,
                } if video_stream else None,
                'audio': {
                    'codec': audio_stream.get('codec_name') if audio_stream else None,
                    'sample_rate': audio_stream.get('sample_rate') if audio_stream else None,
                } if audio_stream else None,
            }
        except Exception as e:
            return {'error': str(e)}


# ── Video Pipeline ───────────────────────────────────────────────

class VideoPipeline:
    """Complete video processing pipeline: download → edit → publish-ready."""
    
    def __init__(self, workspace: str = "workspace"):
        self.workspace = Path(workspace)
        self.downloader = VideoDownloader(workspace)
        self.editor = VideoEditor(workspace)
    
    async def process_tiktok_video(self, url: str, category: str, 
                                     hook_text: str = None, 
                                     cta_text: str = None,
                                     trim_start: float = 0,
                                     trim_end: float = 30) -> dict:
        """
        Full pipeline: download → trim → overlay → resize.
        """
        import time
        ts = int(time.time())
        
        # Paths
        raw_path = str(self.workspace / category / f'raw_{ts}.mp4')
        trimmed_path = str(self.workspace / category / f'trimmed_{ts}.mp4')
        overlay_path = str(self.workspace / category / f'overlay_{ts}.mp4')
        final_path = str(self.workspace / category / f'final_{ts}.mp4')
        
        # Ensure directory
        Path(raw_path).parent.mkdir(parents=True, exist_ok=True)
        
        # Step 1: Download
        download = await self.downloader.download_tiktok(url, raw_path)
        if not download['success']:
            return {'success': False, 'step': 'download', 'error': download.get('error')}
        
        # Step 2: Get info
        info = await self.editor.get_info(raw_path)
        duration = info.get('duration', 0)
        
        # Step 3: Trim (use full video if shorter than trim_end)
        actual_end = min(trim_end, duration)
        trim = await self.editor.trim(raw_path, trimmed_path, trim_start, actual_end)
        if not trim['success']:
            return {'success': False, 'step': 'trim', 'error': trim.get('error')}
        
        # Step 4: Add text overlay
        if hook_text:
            overlay = await self.editor.add_text_overlay(trimmed_path, overlay_path, hook_text, 'top', 5)
            if not overlay['success']:
                # Fallback: use trimmed video
                overlay_path = trimmed_path
        else:
            overlay_path = trimmed_path
        
        # Step 5: Resize for Reels (9:16)
        resize = await self.editor.resize(overlay_path, final_path, 1080, 1920)
        if not resize['success']:
            return {'success': False, 'step': 'resize', 'error': resize.get('error')}
        
        # Get final info
        final_info = await self.editor.get_info(final_path)
        
        return {
            'success': True,
            'path': final_path,
            'duration': final_info.get('duration', 0),
            'size': final_info.get('size', 0),
            'source_url': url,
            'category': category,
        }
    
    async def create_compilation(self, video_paths: list, output_path: str, 
                                   overlay_texts: list = None) -> dict:
        """
        Create a compilation from multiple videos.
        """
        # Add overlays if provided
        processed_paths = []
        for i, path in enumerate(video_paths):
            if overlay_texts and i < len(overlay_texts):
                overlay_path = str(self.workspace / f'overlay_{i}.mp4')
                result = await self.editor.add_text_overlay(path, overlay_path, overlay_texts[i], 'top', 3)
                if result['success']:
                    processed_paths.append(overlay_path)
                else:
                    processed_paths.append(path)
            else:
                processed_paths.append(path)
        
        # Concatenate
        concat = await self.editor.concat(processed_paths, output_path)
        
        if concat['success']:
            info = await self.editor.get_info(output_path)
            return {
                'success': True,
                'path': output_path,
                'duration': info.get('duration', 0),
                'size': info.get('size', 0),
                'segments': len(video_paths),
            }
        
        return {'success': False, 'error': concat.get('error')}


# ── Module-level convenience ─────────────────────────────────────

def get_video_pipeline(workspace: str = "workspace") -> VideoPipeline:
    """Get a VideoPipeline instance."""
    return VideoPipeline(workspace)
