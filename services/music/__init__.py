# Music Generation Service
"""
Background music generation for video content.

Engines:
- Suno AI (full songs + instrumentals)
- AudioCraft/MusicGen (background music, self-hosted)
- Edge TTS fallback for simple audio

Usage:
    from services.music.generator import MusicGenerator
    gen = MusicGenerator()
    result = gen.generate_bgm("upbeat corporate")
"""

from services.music.generator import MusicGenerator

__all__ = ["MusicGenerator"]

