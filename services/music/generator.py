#!/usr/bin/env python3
"""
Music Generator — Background music for video content.

Supports:
- Suno AI (full songs + instrumentals)
- AudioCraft/MusicGen (self-hosted)
- FFmpeg-based simple beats (fallback)

Usage:
    gen = MusicGenerator()
    result = gen.generate("lo-fi chill beats")
    result = gen.generate_bgm("corporate")
"""

import os
import subprocess
import tempfile
from typing import Optional
from pathlib import Path


class MusicGenerator:
    """Generate background music for videos."""

    def __init__(self):
        self.output_dir = Path("/tmp/music_output")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._check_engines()

    def _check_engines(self):
        """Check available music generation engines."""
        self.suno_available = False
        self.audiocraft_available = False

        # Check suno-api
        try:
            import suno
            self.suno_available = True
        except ImportError:
            pass

        # Check audiocraft
        try:
            import audiocraft
            self.audiocraft_available = True
        except ImportError:
            pass

    def generate(
        self,
        prompt: str,
        duration_seconds: int = 60,
        style: str = "auto",
        engine: str = "auto",
    ) -> dict:
        """
        Generate background music.

        Args:
            prompt: Music description (e.g., "lo-fi chill beats", "corporate upbeat")
            duration_seconds: Target duration
            style: Musical style override
            engine: Force specific engine (suno, audiocraft, ffmpeg, auto)

        Returns:
            dict with success, audio_path, duration, engine
        """
        if engine == "auto":
            if self.suno_available:
                engine = "suno"
            elif self.audiocraft_available:
                engine = "audiocraft"
            else:
                engine = "ffmpeg"

        if engine == "suno":
            return self._generate_suno(prompt, duration_seconds, style)
        elif engine == "audiocraft":
            return self._generate_audiocraft(prompt, duration_seconds)
        elif engine == "ffmpeg":
            return self._generate_ffmpeg(prompt, duration_seconds)
        else:
            return {"success": False, "error": f"Unknown engine: {engine}"}

    def generate_bgm(self, theme: str = "corporate") -> dict:
        """Generate background music by theme."""
        themes = {
            "corporate": "corporate background music, uplifting, professional, clean, 120bpm",
            "cinematic": "cinematic background music, epic orchestral, dramatic, powerful",
            "upbeat": "upbeat background music, positive energy, happy, pop-inspired",
            "ambient": "ambient background music, atmospheric, minimal, calm, peaceful",
            "lofi": "lo-fi hip hop beats, chill study music, relaxed, mellow",
            "tech": "technology background music, futuristic electronic, clean, modern",
            "vlog": "vlog background music, cheerful acoustic guitar, feel-good, warm",
            "romantic": "romantic background music, soft piano, emotional, gentle",
            "dark": "dark background music, mysterious, tension, suspenseful",
            "happy": "happy background music, joyful, bright, playful",
        }
        prompt = themes.get(theme, f"{theme} background music")
        return self.generate(prompt, duration_seconds=60)

    def _generate_suno(self, prompt, duration, style) -> dict:
        """Generate via Suno AI."""
        try:
            import httpx

            api_key = os.getenv("SUNO_API_KEY", "")
            if not api_key:
                return {"success": False, "error": "SUNO_API_KEY not set"}

            resp = httpx.post(
                "https://studio-api.suno.ai/api/generate/",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"prompt": prompt, "make_instrumental": True, "wait_audio": True},
                timeout=120,
            )

            if resp.status_code == 200:
                data = resp.json()
                audio_url = data.get("audio_url", "")
                if audio_url:
                    output = str(self.output_dir / f"bgm_{hash(prompt) % 10000}.mp3")
                    subprocess.run(["curl", "-sL", "-o", output, audio_url], check=True, timeout=30)
                    return {"success": True, "audio_path": output, "engine": "suno", "metadata": data}
        except Exception:
            pass
        return {"success": False, "error": "Suno generation failed"}

    def _generate_audiocraft(self, prompt, duration) -> dict:
        """Generate via AudioCraft/MusicGen."""
        try:
            from audiocraft.models import MusicGen
            from audiocraft.data.audio import audio_write

            model = MusicGen.get_pretrained("facebook/musicgen-small")
            model.set_generation_params(duration=min(duration, 30))

            wav = model.generate([prompt])

            output = str(self.output_dir / f"bgm_{hash(prompt) % 10000}.wav")
            audio_write(output, wav[0].cpu(), sample_rate=32000)

            return {"success": True, "audio_path": output, "engine": "audiocraft"}
        except Exception as e:
            return {"success": False, "error": f"AudioCraft failed: {e}"}

    def _generate_ffmpeg(self, prompt, duration) -> dict:
        """Generate simple background tone via FFmpeg (fallback)."""
        try:
            output = str(self.output_dir / f"bgm_simple_{hash(prompt) % 10000}.wav")

            # Generate a simple ambient tone
            cmd = [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i",
                f"sine=frequency=220:duration={min(duration, 30)}",
                "-af", "aecho=0.8:0.9:1000:0.3,lowpass=f=800",
                "-c:a", "libmp3lame", "-q:a", "2",
                output
            ]
            subprocess.run(cmd, capture_output=True, check=True, timeout=15)

            return {"success": True, "audio_path": output, "engine": "ffmpeg",
                    "note": "Simple tone — install suno-api or audiocraft for better quality"}
        except Exception as e:
            return {"success": False, "error": f"FFmpeg generation failed: {e}"}


# CLI entry point
if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python generator.py <prompt> [theme]")
        print("  themes: corporate, cinematic, upbeat, ambient, lofi, tech, vlog")
        sys.exit(1)

    prompt = sys.argv[1]
    theme = sys.argv[2] if len(sys.argv) > 2 else "auto"

    gen = MusicGenerator()
    if theme != "auto":
        result = gen.generate_bgm(theme)
    else:
        result = gen.generate(prompt)
    print(json.dumps(result, indent=2))
