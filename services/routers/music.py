"""Music routes — Suno AI music and background music generation."""
import asyncio
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional

from services.di import get_music

music_router = APIRouter(prefix="", tags=["music"])


class SunoRequest(BaseModel):
    prompt: str
    style: Optional[str] = None
    lyrics: Optional[str] = None
    instrumental: bool = True


class MusicRequest(BaseModel):
    prompt: str
    duration_seconds: int = Field(default=60, ge=10, le=600)
    engine: str = "auto"
    style: Optional[str] = None
    lyrics: Optional[str] = None
    instrumental: bool = True


# ── Suno AI ─────────────────────────────────────────────────────

@music_router.post("/suno/generate")
async def suno_generate(req: SunoRequest):
    """Generate music via Suno AI (backward-compatible)."""
    try:
        gen = get_music()
        result = await asyncio.to_thread(
            gen.generate,
            prompt=req.prompt,
            style=req.style or "auto",
            lyrics=req.lyrics,
            instrumental_only=req.instrumental,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@music_router.post("/suno/lofi")
async def suno_lofi(mood: str = "chill"):
    """Generate lo-fi beats (backward-compatible)."""
    try:
        gen = get_music()
        result = await asyncio.to_thread(gen.generate_lofi, mood=mood)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@music_router.post("/suno/bgm")
async def suno_bgm(theme: str = "corporate"):
    """Generate themed background music (backward-compatible)."""
    try:
        gen = get_music()
        result = await asyncio.to_thread(gen.generate_bgm, theme=theme)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Music Generator ────────────────────────────────────────────

@music_router.post("/music/generate")
async def music_generate(req: MusicRequest):
    """Generate background music."""
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


@music_router.post("/music/bgm")
async def music_bgm(theme: str = "corporate"):
    """Generate themed background music."""
    try:
        gen = get_music()
        result = await asyncio.to_thread(gen.generate_bgm, theme=theme)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))