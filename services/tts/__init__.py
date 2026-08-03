# TTS Service — Text-to-Speech
"""
Multi-engine TTS with Indonesian + English support.

Engines:
- Edge TTS (free, Microsoft, all languages)
- MeloTTS (fast, multilingual, self-hosted)
- OpenVoice (voice cloning, premium)

Usage:
    from services.tts.engine import TTSEngine
    engine = TTSEngine()
    result = engine.synthesize("Halo, selamat pagi!", voice="id-ID-ArdiNeural")
"""

from services.tts.engine import TTSEngine

__all__ = ["TTSEngine"]

