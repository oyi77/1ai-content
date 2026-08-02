"""Legacy-schema compatibility router.

The admin frontend (`admin-ui/src/api/client.ts`) and the EJS web pages
still call the pre-consolidation API surface:

    /tts/synthesize      /tts/voices        /tts/audio/{filename}
    /suno/generate       /suno/lofi         /suno/bgm
    /music/generate
    /captions/styles     /captions/presets  /captions/generate

During the service-layer remediation (commit a2b6c6c) these were
consolidated into `services/routers/audio.py` under a new `/audio/*`
prefix, which broke the frontend contract (404s on TTS + Music + Captions
admin pages). This router restores the legacy paths by delegating to the
exact same engine functions already used by `audio.py`, so both the new
`/audio/*` surface and the legacy `/tts`/`/music`/`/suno`/`/captions`
surface coexist without duplicating logic.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from services.di import get_music, get_tts
from services.api_models import TTSRequest, CaptionRequest
from services.routers.audio import MusicGenerateRequest, SunoRequest

router = APIRouter(prefix="", tags=["compat-legacy"])


# ── TTS (legacy /tts/*) ─────────────────────────────────────────

@router.post("/tts/synthesize")
async def legacy_tts_synthesize(req: TTSRequest):
    """Generate speech from text (legacy /tts/synthesize)."""
    try:
        engine = get_tts()
        result = await asyncio.to_thread(
            engine.synthesize,
            text=req.text,
            language=req.language,
            voice=req.voice,
            rate=req.rate,
            pitch=req.pitch,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tts/voices")
async def legacy_tts_voices(language: Optional[str] = None):
    """List available TTS voices (legacy /tts/voices)."""
    try:
        engine = get_tts()
        voices = engine.list_voices(language=language)
        return {"voices": voices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tts/audio/{filename}")
async def legacy_tts_audio(filename: str):
    """Serve a generated speech audio file (legacy /tts/audio/{filename})."""
    base_dir = Path("/tmp/tts_output")
    full_path = (base_dir / filename).resolve()
    if not str(full_path).startswith(str(base_dir.resolve()) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(str(full_path), media_type="audio/mpeg")


# ── Music / Suno (legacy /music/*, /suno/*) ─────────────────────

@router.post("/music/generate")
async def legacy_music_generate(req: MusicGenerateRequest):
    """Generate music (legacy /music/generate)."""
    try:
        gen = get_music()
        result = await asyncio.to_thread(
            gen.generate,
            prompt=req.prompt,
            duration_seconds=req.duration_seconds,
            engine=req.engine,
            style=req.style,
            lyrics=req.lyrics,
            instrumental_only=req.instrumental,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/suno/generate")
async def legacy_suno_generate(req: SunoRequest):
    """Generate music (legacy /suno/generate, Suno-compatible body)."""
    try:
        gen = get_music()
        result = await asyncio.to_thread(
            gen.generate,
            prompt=req.prompt,
            duration_seconds=60,
            engine="suno",
            style=req.style,
            lyrics=req.lyrics,
            instrumental_only=req.instrumental,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/suno/bgm")
async def legacy_suno_bgm(theme: str = "corporate"):
    """Generate themed background music (legacy /suno/bgm)."""
    try:
        gen = get_music()
        result = await asyncio.to_thread(gen.generate_bgm, theme=theme)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/suno/lofi")
async def legacy_suno_lofi(mood: str = "chill"):
    """Generate lo-fi beats (legacy /suno/lofi)."""
    try:
        gen = get_music()
        result = await asyncio.to_thread(gen.generate_lofi, mood=mood)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Captions (legacy /captions/*) ───────────────────────────────

@router.get("/captions/styles")
async def legacy_caption_styles():
    """List available caption styles (legacy /captions/styles)."""
    from services.carousel.caption_styles import list_styles
    return {"styles": list_styles()}


@router.get("/captions/presets")
async def legacy_caption_presets():
    """List available caption presets (legacy /captions/presets)."""
    from services.carousel.caption_presets import list_presets
    return {"presets": list_presets()}


@router.post("/captions/generate")
async def legacy_caption_generate(req: CaptionRequest):
    """Generate a caption in a specific style (legacy /captions/generate)."""
    try:
        from services.carousel.caption_styles import CaptionGenerator
        gen = CaptionGenerator()
        result = gen.generate(
            topic=req.topic,
            style=req.style,
            platform=req.platform,
            language=req.language,
            max_length=req.max_length,
            include_hashtags=req.include_hashtags,
            hashtag_count=req.hashtag_count,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))