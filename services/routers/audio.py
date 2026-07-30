"""Audio content type router — music generation and speech synthesis.

Mapped from legacy providers:
  - /audio/music*  ← /music/*, /suno/*
  - /audio/speech* ← /tts/*
"""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from services.di import get_music, get_tts

router = APIRouter(prefix="", tags=["audio"])


# ── Request models ──────────────────────────────────────────────

class MusicGenerateRequest(BaseModel):
    prompt: str
    duration_seconds: int = Field(default=60, ge=10, le=600)
    engine: str = "auto"
    style: Optional[str] = None
    lyrics: Optional[str] = None
    instrumental: bool = True


class SunoRequest(BaseModel):
    """Minimal Suno-compatible request (backward compat)."""
    prompt: str
    style: Optional[str] = None
    lyrics: Optional[str] = None
    instrumental: bool = True


class TTSRequest(BaseModel):
    text: str
    language: str = "id"
    voice: Optional[str] = None
    rate: Optional[float] = None
    pitch: Optional[float] = None


# ── Music generation ────────────────────────────────────────────

@router.post("/audio/music")
async def audio_music(req: MusicGenerateRequest):
    """Generate music / background music."""
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


@router.post("/audio/music/bgm")
async def audio_music_bgm(theme: str = "corporate"):
    """Generate themed background music."""
    try:
        gen = get_music()
        result = await asyncio.to_thread(gen.generate_bgm, theme=theme)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/audio/music/lofi")
async def audio_music_lofi(mood: str = "chill"):
    """Generate lo-fi beats."""
    try:
        gen = get_music()
        result = await asyncio.to_thread(gen.generate_lofi, mood=mood)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Speech synthesis ────────────────────────────────────────────

@router.post("/audio/speech")
async def audio_speech(req: TTSRequest):
    """Synthesize speech from text."""
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


@router.get("/audio/speech/voices")
async def audio_speech_voices(language: Optional[str] = None):
    """List available TTS voices."""
    try:
        engine = get_tts()
        voices = engine.list_voices(language=language)
        return {"voices": voices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/audio/speech/media/{filename}")
async def audio_speech_media(filename: str):
    """Serve a generated speech audio file."""
    full_path = Path("/tmp/tts_output") / filename
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(str(full_path), media_type="audio/mpeg")
