#!/usr/bin/env python3
"""
Suno AI Music Client — Generate songs via Suno API.

Supports:
- Full song generation with lyrics
- Instrumental-only generation
- Style/genre control
- Multiple song variants

Note: Uses unofficial Suno API wrapper. Install with:
    pip install suno-api
Or use browser automation via CloakBrowser if API unavailable.
"""

import os
import json
import subprocess
import tempfile
from typing import Optional
from pathlib import Path


class SunoClient:
    """Generate music via Suno AI."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("SUNO_API_KEY", "")
        self.output_dir = Path("/tmp/suno_output")
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def generate(
        self,
        prompt: str,
        style: str = "pop",
        lyrics: Optional[str] = None,
        instrumental_only: bool = False,
        duration_seconds: int = 180,
    ) -> dict:
        """
        Generate a song via Suno.

        Args:
            prompt: Song description/mood (e.g., "romantic beach vibes at sunset")
            style: Musical style (pop, lo-fi, acoustic, jazz, electronic, etc.)
            lyrics: Custom lyrics (optional, Suno generates if not provided)
            instrumental_only: Generate instrumental only (no vocals)
            duration_seconds: Target duration

        Returns:
            dict with success, audio_url, audio_path, metadata
        """
        # Try official API first
        if self.api_key:
            return self._generate_via_api(prompt, style, lyrics, instrumental_only)

        # Fallback: try suno-api package
        return self._generate_via_package(prompt, style, lyrics, instrumental_only)

    def _generate_via_api(self, prompt, style, lyrics, instrumental_only) -> dict:
        """Generate via Suno REST API (if available)."""
        try:
            import httpx

            full_prompt = f"{style}: {prompt}"
            if lyrics:
                full_prompt += f"\n\nLyrics:\n{lyrics}"

            # Suno API endpoint (unofficial)
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
                return {
                    "success": True,
                    "audio_url": data.get("audio_url", ""),
                    "metadata": data,
                    "method": "api",
                }
        except Exception as e:
            pass

        return {"success": False, "error": "API generation failed"}

    def _generate_via_package(self, prompt, style, lyrics, instrumental_only) -> dict:
        """Generate via suno-api Python package."""
        try:
            from suno import SunoClient as _SunoClient

            client = _SunoClient()
            full_prompt = f"{style}: {prompt}"

            if lyrics:
                result = client.generate.full_song(full_prompt, lyrics=lyrics)
            elif instrumental_only:
                result = client.generate.instrumental(full_prompt)
            else:
                result = client.generate.full_song(full_prompt)

            if result and result.get("audio_url"):
                # Download the audio
                audio_path = str(self.output_dir / f"suno_{hash(prompt) % 10000}.mp3")
                subprocess.run(
                    ["curl", "-sL", "-o", audio_path, result["audio_url"]],
                    check=True, timeout=30
                )
                return {
                    "success": True,
                    "audio_url": result["audio_url"],
                    "audio_path": audio_path,
                    "metadata": result,
                    "method": "package",
                }
        except ImportError:
            pass
        except Exception as e:
            pass

        return {"success": False, "error": "Package generation failed — install suno-api: pip install suno-api"}

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

    def generate_bgm(self, theme: str = "corporate") -> dict:
        """Generate background music for videos."""
        themes = {
            "corporate": "corporate background music, uplifting, professional, 120bpm",
            "cinematic": "cinematic background music, epic, orchestral, dramatic",
            "upbeat": "upbeat background music, positive, energetic, pop",
            "ambient": "ambient background music, atmospheric, minimal, calm",
            "tech": "technology background music, futuristic, electronic, clean",
            "vlog": "vlog background music, cheerful, acoustic guitar, feel-good",
        }
        style = themes.get(theme, themes["corporate"])
        return self.generate(
            prompt=f"Background music for {theme} content",
            style=style,
            instrumental_only=True,
            duration_seconds=60,
        )


# CLI entry point
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python client.py <prompt> [style] [instrumental]")
        print("  styles: lofi, corporate, cinematic, upbeat, ambient, tech, vlog")
        sys.exit(1)

    prompt = sys.argv[1]
    style = sys.argv[2] if len(sys.argv) > 2 else "pop"
    instrumental = "--instrumental" in sys.argv

    client = SunoClient()
    result = client.generate(prompt, style=style, instrumental_only=instrumental)
    print(json.dumps(result, indent=2, default=str))
