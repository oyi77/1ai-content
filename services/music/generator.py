#!/usr/bin/env python3
"""
Music Generator — Background music for video content.

Supports:
- Suno AI (full songs + instrumentals + lyrics + lofi)
- AudioCraft/MusicGen (self-hosted)
- FFmpeg-based simple beats (fallback)

Usage:
    gen = MusicGenerator()
    result = gen.generate("lo-fi chill beats")
    result = gen.generate_bgm("corporate")
    result = gen.generate_lofi("chill")
    result = gen.generate("romantic song", lyrics="...", instrumental_only=False)
"""

import json
import logging
import os
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class MusicGenerator:
    """Generate background music for videos."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("SUNO_API_KEY", "")
        self.output_dir = Path("/tmp/music_output")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._check_engines()

    def _check_engines(self):
        """Check available music generation engines."""
        self.suno_available = False
        self.audiocraft_available = False

        # Check suno-api
        try:
            import suno  # noqa: F401
            self.suno_available = True
        except ImportError:
            logger.info("suno-api not installed — Suno engine unavailable")

        # Check audiocraft
        try:
            import audiocraft  # noqa: F401
            self.audiocraft_available = True
        except ImportError:
            logger.info("audiocraft not installed — AudioCraft engine unavailable")

    # ── Public API ────────────────────────────────────────────────

    def generate(
        self,
        prompt: str,
        duration_seconds: int = 60,
        style: str = "auto",
        engine: str = "auto",
        lyrics: Optional[str] = None,
        instrumental_only: bool = True,
    ) -> dict:
        """
        Generate background music.

        Args:
            prompt: Music description (e.g., "lo-fi chill beats", "corporate upbeat")
            duration_seconds: Target duration
            style: Musical style override
            engine: Force specific engine (suno, audiocraft, ffmpeg, auto)
            lyrics: Custom lyrics (Suno only — auto-generated if None)
            instrumental_only: Generate instrumental only (no vocals)

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
            return self._generate_suno(prompt, duration_seconds, style, lyrics, instrumental_only)
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

    def generate_lofi(self, mood: str = "chill") -> dict:
        """Generate lo-fi beats for looping content."""
        styles = {
            "chill": "lo-fi hip hop, chill beats, study music, relaxed tempo",
            "romantic": "lo-fi, romantic piano, soft beats, dreamy atmosphere",
            "night": "lo-fi, night city vibes, jazz piano, mellow beats",
            "rain": "lo-fi, rain ambience, cozy beats, melancholic melody",
            "happy": "lo-fi, happy vibes, bright piano, uplifting beats",
        }
        style = styles.get(mood, styles["chill"])
        return self.generate(
            prompt=f"Lo-fi {mood} beats for studying and relaxing",
            style=style,
            instrumental_only=True,
            duration_seconds=180,
        )

    # ── Suno AI ───────────────────────────────────────────────────

    def _generate_suno(
        self,
        prompt: str,
        duration: int,
        style: str,
        lyrics: Optional[str] = None,
        instrumental_only: bool = True,
    ) -> dict:
        """Generate via Suno AI — try REST API first, then suno-api package."""
        if self.api_key:
            result = self._suno_via_api(prompt, style, lyrics, instrumental_only)
            if result.get("success"):
                return result

        # Fallback: try suno-api package
        return self._suno_via_package(prompt, style, lyrics, instrumental_only)

    def _suno_via_api(self, prompt, style, lyrics, instrumental_only) -> dict:
        """Generate via Suno REST API."""
        try:
            import httpx

            full_prompt = f"{style}: {prompt}" if style and style != "auto" else prompt
            if lyrics:
                full_prompt += f"\n\nLyrics:\n{lyrics}"

            resp = httpx.post(
                "https://studio-api.suno.ai/api/generate/",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "prompt": full_prompt,
                    "make_instrumental": instrumental_only,
                    "wait_audio": True,
                },
                timeout=120,
            )

            if resp.status_code == 200:
                data = resp.json()
                audio_url = data.get("audio_url", "")
                if audio_url:
                    output = str(self.output_dir / f"suno_{hash(prompt) % 10000}.mp3")
                    subprocess.run(
                        ["curl", "-sL", "-o", output, audio_url],
                        check=True, timeout=30
                    )
                    return {
                        "success": True,
                        "audio_url": audio_url,
                        "audio_path": output,
                        "engine": "suno",
                        "method": "api",
                        "metadata": data,
                    }
        except Exception as e:
            logger.warning("Suno API generation failed: %s", e)

        return {"success": False, "error": "API generation failed"}

    def _suno_via_package(self, prompt, style, lyrics, instrumental_only) -> dict:
        """Generate via suno-api Python package."""
        try:
            from suno import SunoClient as _SunoClient

            client = _SunoClient()
            full_prompt = f"{style}: {prompt}" if style and style != "auto" else prompt

            if lyrics:
                result = client.generate.full_song(full_prompt, lyrics=lyrics)
            elif instrumental_only:
                result = client.generate.instrumental(full_prompt)
            else:
                result = client.generate.full_song(full_prompt)

            if result and result.get("audio_url"):
                audio_path = str(self.output_dir / f"suno_{hash(prompt) % 10000}.mp3")
                subprocess.run(
                    ["curl", "-sL", "-o", audio_path, result["audio_url"]],
                    check=True, timeout=30
                )
                return {
                    "success": True,
                    "audio_url": result["audio_url"],
                    "audio_path": audio_path,
                    "engine": "suno",
                    "method": "package",
                    "metadata": result,
                }
        except ImportError:
            pass
        except Exception as e:
            logger.warning("Suno package generation failed: %s", e)

        return {"success": False, "error": "Package generation failed — install suno-api: pip install suno-api"}

    # ── AudioCraft / MusicGen ─────────────────────────────────────

    def _generate_audiocraft(self, prompt, duration) -> dict:
        """Generate via AudioCraft/MusicGen."""
        try:
            from audiocraft.models import MusicGen  # type: ignore[import-untyped]
            from audiocraft.data.audio import audio_write  # type: ignore[import-untyped]

            model = MusicGen.get_pretrained("facebook/musicgen-small")
            model.set_generation_params(duration=min(duration, 30))

            wav = model.generate([prompt])

            output = str(self.output_dir / f"bgm_{hash(prompt) % 10000}.wav")
            audio_write(output, wav[0].cpu(), sample_rate=32000)

            return {"success": True, "audio_path": output, "engine": "audiocraft"}
        except Exception as e:
            return {"success": False, "error": f"AudioCraft failed: {e}"}

    # ── FFmpeg fallback ──────────────────────────────────────────

    def _generate_ffmpeg(self, prompt, duration) -> dict:
        """Generate simple background tone via FFmpeg (fallback)."""
        try:
            output = str(self.output_dir / f"bgm_simple_{hash(prompt) % 10000}.wav")

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

    if len(sys.argv) < 2:
        print("Usage: python generator.py <prompt> [theme|lofi] [--instrumental]")
        print("  themes: corporate, cinematic, upbeat, ambient, lofi, tech, vlog")
        print("  special: 'lofi' as second arg calls generate_lofi instead")
        sys.exit(1)

    prompt = sys.argv[1]
    arg2 = sys.argv[2] if len(sys.argv) > 2 else "auto"
    instrumental = "--instrumental" in sys.argv

    gen = MusicGenerator()
    if arg2 == "lofi" or arg2.startswith("lo-fi"):
        result = gen.generate_lofi(arg2 if arg2 != "lofi" else "chill")
    elif arg2 != "auto":
        result = gen.generate_bgm(arg2)
    else:
        result = gen.generate(prompt, instrumental_only=instrumental)
    print(json.dumps(result, indent=2, default=str))
