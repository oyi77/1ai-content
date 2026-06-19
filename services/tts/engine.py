#!/usr/bin/env python3
"""
TTS Engine — Multi-engine text-to-speech with Indonesian + English support.

Engines (fallback chain):
1. Edge TTS — Free, Microsoft, all languages, high quality
2. MeloTTS — Fast, multilingual, self-hosted (if available)
3. OpenVoice — Voice cloning, premium tier

Indonesian voices (Edge TTS):
- id-ID-ArdiNeural (male)
- id-ID GadisNeural (female)

English voices (Edge TTS):
- en-US-GuyNeural (male)
- en-US-JennyNeural (female)
- en-GB-SoniaNeural (female, British)
"""

import os
import subprocess
import tempfile
from typing import Optional
from pathlib import Path


class TTSEngine:
    """Multi-engine text-to-speech."""

    def __init__(self):
        self.output_dir = Path("/tmp/tts_output")
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._check_engines()

    def _check_engines(self):
        """Check which TTS engines are available."""
        self.edge_available = False
        self.melo_available = False

        try:
            subprocess.run(["edge-tts", "--version"], capture_output=True, timeout=5)
            self.edge_available = True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

        try:
            subprocess.run(["melo", "--help"], capture_output=True, timeout=5)
            self.melo_available = True
        except (FileNotFoundError, subprocess.TimeoutExpired):
            pass

    def synthesize(
        self,
        text: str,
        voice: Optional[str] = None,
        language: str = "id",
        output_path: Optional[str] = None,
        rate: str = "+0%",
        pitch: str = "+0Hz",
    ) -> dict:
        """
        Synthesize text to speech.

        Args:
            text: Text to speak
            voice: Specific voice name (e.g., "id-ID-ArdiNeural")
            language: Language code (id, en, etc.)
            output_path: Output file path (auto-generated if not provided)
            rate: Speech rate adjustment (e.g., "+10%", "-20%")
            pitch: Pitch adjustment (e.g., "+5Hz", "-10Hz")

        Returns:
            dict with success, audio_path, duration, engine
        """
        if not text.strip():
            return {"success": False, "error": "Empty text"}

        if not output_path:
            output_path = str(self.output_dir / f"tts_{hash(text) % 100000}.mp3")

        # Auto-select voice based on language
        if not voice:
            voice = self._get_default_voice(language)

        # Try Edge TTS first (free, high quality)
        if self.edge_available:
            return self._edge_tts(text, voice, output_path, rate, pitch)

        # Fallback: try MeloTTS
        if self.melo_available:
            return self._melo_tts(text, language, output_path)

        return {"success": False, "error": "No TTS engine available. Install: pip install edge-tts"}

    def _get_default_voice(self, language: str) -> str:
        """Get default voice for language."""
        voices = {
            "id": "id-ID-ArdiNeural",
            "en": "en-US-GuyNeural",
            "ms": "ms-MY-OsmanNeural",
            "th": "th-TH-NiwatNeural",
            "tl": "tl-PH-AngeloNeural",
            "vi": "vi-VN-HoaiMyNeural",
        }
        return voices.get(language, "en-US-GuyNeural")

    def _edge_tts(self, text, voice, output_path, rate, pitch) -> dict:
        """Generate speech using Edge TTS."""
        try:
            cmd = [
                "edge-tts",
                "--voice", voice,
                "--rate", rate,
                "--pitch", pitch,
                "--text", text,
                "--write-media", output_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if result.returncode == 0 and os.path.exists(output_path):
                # Get duration
                duration = self._get_audio_duration(output_path)
                return {
                    "success": True,
                    "audio_path": output_path,
                    "duration_seconds": duration,
                    "engine": "edge-tts",
                    "voice": voice,
                }
            else:
                return {"success": False, "error": result.stderr or "Edge TTS failed"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _melo_tts(self, text, language, output_path) -> dict:
        """Generate speech using MeloTTS."""
        try:
            cmd = [
                "melo",
                "--text", text,
                "--language", language,
                "--output", output_path,
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

            if result.returncode == 0 and os.path.exists(output_path):
                duration = self._get_audio_duration(output_path)
                return {
                    "success": True,
                    "audio_path": output_path,
                    "duration_seconds": duration,
                    "engine": "melo-tts",
                }
            else:
                return {"success": False, "error": result.stderr or "MeloTTS failed"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def _get_audio_duration(self, path: str) -> float:
        """Get audio duration in seconds."""
        try:
            result = subprocess.run(
                ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                 "-of", "csv=p=0", path],
                capture_output=True, text=True, timeout=5
            )
            return float(result.stdout.strip())
        except Exception:
            return 0.0

    def list_voices(self, language: Optional[str] = None) -> list[dict]:
        """List available Edge TTS voices."""
        try:
            result = subprocess.run(
                ["edge-tts", "--list-voices"],
                capture_output=True, text=True, timeout=10
            )
            voices = []
            for line in result.stdout.split("\n"):
                if "Name:" in line:
                    name = line.split("Name:")[-1].strip()
                    if language and not name.startswith(language):
                        continue
                    voices.append({"name": name})
            return voices
        except Exception:
            return []


# CLI entry point
if __name__ == "__main__":
    import sys
    import json

    if len(sys.argv) < 2:
        print("Usage: python engine.py <text> [voice] [language]")
        print("  languages: id, en, ms, th, tl, vi")
        sys.exit(1)

    text = sys.argv[1]
    voice = sys.argv[2] if len(sys.argv) > 2 else None
    lang = sys.argv[3] if len(sys.argv) > 3 else "id"

    engine = TTSEngine()
    result = engine.synthesize(text, voice=voice, language=lang)
    print(json.dumps(result, indent=2))
