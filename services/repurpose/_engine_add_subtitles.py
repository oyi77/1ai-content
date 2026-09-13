"""Methods carved verbatim out of ``services/repurpose/engine.py``."""

from .engine import (
    Optional,
)

from . import engine as _facade

class RepurposeEngineMixin3:
    def _add_subtitles(
        self, video_path: str, segments: list[dict],
        style: str, width: int, height: int, work_dir: str
    ) -> str:
        """Add subtitles to video."""
        output_path = _facade.os.path.join(work_dir, "subtitled.mp4")
        srt_path = _facade.os.path.join(work_dir, "subtitles.srt")

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
            _facade.subprocess.run(cmd, capture_output=True, timeout=300, check=True)
            return output_path if _facade.os.path.exists(output_path) else video_path
        except Exception:
            return video_path
    def _remix_audio(
        self, video_path: str,
        bgm_path: Optional[str], bgm_volume: float,
        voiceover_path: Optional[str], work_dir: str
    ) -> str:
        """Remix audio: mix video audio with BGM and/or voiceover."""
        output_path = _facade.os.path.join(work_dir, "audio_remixed.mp4")

        inputs = ["-i", video_path]
        filter_parts = []

        if bgm_path and _facade.os.path.exists(bgm_path):
            inputs.extend(["-i", bgm_path])
            bgm_idx = len(inputs) // 2 - 1
            # Mix: original audio (full) + BGM (low volume)
            filter_parts.append(
                f"[0:a]volume=1.0[orig];"
                f"[{bgm_idx}:a]volume={bgm_volume},aloop=loop=-1:size=2e+09[bgm];"
                f"[orig][bgm]amix=inputs=2:duration=shortest[aout]"
            )
        elif voiceover_path and _facade.os.path.exists(voiceover_path):
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
            _facade.subprocess.run(cmd, capture_output=True, timeout=300, check=True)
            return output_path if _facade.os.path.exists(output_path) else video_path
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
            _facade.subprocess.run(cmd, capture_output=True, timeout=300, check=True)
        except Exception:
            _facade.shutil.copy2(video_path, output_path)
    def _generate_thumbnail(self, video_path: str, segments: list[dict], work_dir: str, width: int, height: int) -> str:
        """Generate thumbnail from the best hook segment."""
        thumbnail_path = _facade.os.path.join(work_dir, "thumbnail.jpg")

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
            _facade.subprocess.run(cmd, capture_output=True, timeout=30, check=True)
            return thumbnail_path if _facade.os.path.exists(thumbnail_path) else ""
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
        output_path = _facade.os.path.join(output_dir, "source.mp4")
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
            _facade.subprocess.run(cmd, capture_output=True, timeout=180, check=True)
            return output_path if _facade.os.path.exists(output_path) else ""
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
            result = _facade.subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            return float(result.stdout.strip())
        except Exception:
            return 0
    def _cleanup_temp(self, work_dir: str, keep_path: str, thumbnail_path: str):
        """Remove intermediate temp files, keep final output."""
        for f in _facade.Path(work_dir).glob("seg_*.mp4"):
            if str(f) != keep_path:
                f.unlink(missing_ok=True)
        for f in _facade.Path(work_dir).glob("faded_*.mp4"):
            f.unlink(missing_ok=True)
        for f in _facade.Path(work_dir).glob("source_*"):
            if f.is_dir():
                _facade.shutil.rmtree(f, ignore_errors=True)
    @staticmethod
    def _fmt_srt(seconds: float) -> str:
        h = int(seconds // 3600)
        m = int((seconds % 3600) // 60)
        s = int(seconds % 60)
        ms = int((seconds % 1) * 1000)
        return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
