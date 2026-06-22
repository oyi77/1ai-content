#!/usr/bin/env python3
"""
1AI-Content Factory — FastAPI Server

Exposes all Python content services as REST API endpoints.
Called by the TypeScript Telegram bot via HTTP.

Services:
- storyboard — AI storyboard generation with scene images
- tts — Text-to-speech (Edge TTS, MeloTTS)
- suno — Suno AI music generation
- music — Background music generation
- looping — Looping video creation
- analyze — YouTube/TikTok channel analysis
- cloakbrowser — Social media posting via CloakBrowser CDP

Run:
    python services/api.py
    # or: uvicorn services.api:app --host 0.0.0.0 --port 8766
"""

import os
import json
import asyncio
import tempfile
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

# ── Import services ────────────────────────────────────────────
from services.storyboard.engine import StoryboardEngine
from services.tts.engine import TTSEngine
from services.suno.client import SunoClient
from services.music.generator import MusicGenerator
from services.looping.engine import LoopingEngine
from services.analysis.channel_analyzer import ChannelAnalyzer
from services.cloakbrowser import CloakBrowserAdapter

# ── App ────────────────────────────────────────────────────────
app = FastAPI(
    title="1AI-Content Factory API",
    description="Content creation services for Telegram bot",
    version="1.0.0",
)

# ── Service instances (lazy init) ──────────────────────────────
_storyboard: Optional[StoryboardEngine] = None
_tts: Optional[TTSEngine] = None
_suno: Optional[SunoClient] = None
_music: Optional[MusicGenerator] = None
_looping: Optional[LoopingEngine] = None
_analyzer: Optional[ChannelAnalyzer] = None
_cloak: Optional[CloakBrowserAdapter] = None


def get_storyboard() -> StoryboardEngine:
    global _storyboard
    if _storyboard is None:
        _storyboard = StoryboardEngine()
    return _storyboard


def get_tts() -> TTSEngine:
    global _tts
    if _tts is None:
        _tts = TTSEngine()
    return _tts


def get_suno() -> SunoClient:
    global _suno
    if _suno is None:
        _suno = SunoClient()
    return _suno


def get_music() -> MusicGenerator:
    global _music
    if _music is None:
        _music = MusicGenerator()
    return _music


def get_looping() -> LoopingEngine:
    global _looping
    if _looping is None:
        _looping = LoopingEngine()
    return _looping


def get_analyzer() -> ChannelAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = ChannelAnalyzer()
    return _analyzer


def get_cloak() -> CloakBrowserAdapter:
    global _cloak
    if _cloak is None:
        _cloak = CloakBrowserAdapter()
    return _cloak


# ══════════════════════════════════════════════════════════════
# REQUEST / RESPONSE MODELS
# ══════════════════════════════════════════════════════════════

class StoryboardRequest(BaseModel):
    prompt: str
    style: str = "cinematic"
    num_scenes: int = Field(default=4, ge=2, le=6)
    aspect_ratio: str = "16:9"


class TTSRequest(BaseModel):
    text: str
    language: str = "id"
    voice: Optional[str] = None
    rate: str = "+0%"
    pitch: str = "+0Hz"


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


class LoopRequest(BaseModel):
    audio_path: str
    duration_minutes: int = Field(default=60, ge=1, le=360)
    visual_type: str = "gradient"
    resolution: str = "1920x1080"
    colors: Optional[str] = None
    image_path: Optional[str] = None


class AnalyzeRequest(BaseModel):
    channel_url: str
    niche: str = ""
    limit: int = Field(default=50, ge=5, le=200)


class CompareRequest(BaseModel):
    channel_urls: list[str]
    niche: str = ""


class CloakPostRequest(BaseModel):
    profile_id: str
    media_path: str
    caption: str
    platform: str
    link: Optional[str] = None
    tags: Optional[list[str]] = None


class CloakBatchPostRequest(BaseModel):
    profile_ids: list[str]
    media_path: str
    caption: str
    platform: str
    link: Optional[str] = None


# ══════════════════════════════════════════════════════════════
# HEALTH
# ══════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "1ai-content-factory",
        "timestamp": datetime.now().isoformat(),
    }


# ══════════════════════════════════════════════════════════════
# STORYBOARD
# ══════════════════════════════════════════════════════════════

@app.post("/storyboard/create")
async def storyboard_create(req: StoryboardRequest):
    """Generate AI storyboard with scene images."""
    try:
        engine = get_storyboard()
        result = await asyncio.to_thread(
            engine.create,
            prompt=req.prompt,
            style=req.style,
            num_scenes=req.num_scenes,
            aspect_ratio=req.aspect_ratio,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/storyboard/image/{path:path}")
async def storyboard_image(path: str):
    """Serve generated storyboard image."""
    full_path = Path("/tmp/storyboard_output") / path
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(str(full_path), media_type="image/png")


# ══════════════════════════════════════════════════════════════
# TTS (Text-to-Speech)
# ══════════════════════════════════════════════════════════════

@app.post("/tts/synthesize")
async def tts_synthesize(req: TTSRequest):
    """Generate speech from text."""
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


@app.get("/tts/voices")
async def tts_voices(language: Optional[str] = None):
    """List available TTS voices."""
    try:
        engine = get_tts()
        voices = engine.list_voices(language=language)
        return {"voices": voices}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/tts/audio/{filename}")
async def tts_audio(filename: str):
    """Serve generated audio file."""
    full_path = Path("/tmp/tts_output") / filename
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(str(full_path), media_type="audio/mpeg")


# ══════════════════════════════════════════════════════════════
# SUNO (AI Music)
# ══════════════════════════════════════════════════════════════

@app.post("/suno/generate")
async def suno_generate(req: SunoRequest):
    """Generate music via Suno AI."""
    try:
        client = get_suno()
        result = await asyncio.to_thread(
            client.generate,
            prompt=req.prompt,
            style=req.style,
            lyrics=req.lyrics,
            instrumental_only=req.instrumental,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/suno/lofi")
async def suno_lofi(mood: str = "chill"):
    """Generate lo-fi beats for looping."""
    try:
        client = get_suno()
        result = await asyncio.to_thread(client.generate_lofi, mood=mood)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/suno/bgm")
async def suno_bgm(theme: str = "corporate"):
    """Generate background music by theme."""
    try:
        client = get_suno()
        result = await asyncio.to_thread(client.generate_bgm, theme=theme)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# MUSIC GENERATOR
# ══════════════════════════════════════════════════════════════

@app.post("/music/generate")
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
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/music/bgm")
async def music_bgm(theme: str = "corporate"):
    """Generate themed background music."""
    try:
        gen = get_music()
        result = await asyncio.to_thread(gen.generate_bgm, theme=theme)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# LOOPING ENGINE
# ══════════════════════════════════════════════════════════════

@app.post("/loop/create")
async def loop_create(req: LoopRequest):
    """Create a looping video from audio."""
    try:
        engine = get_looping()

        # Parse resolution string to width/height
        res = req.resolution.split("x")
        width = int(res[0]) if len(res) == 2 else 1920
        height = int(res[1]) if len(res) == 2 else 1080

        # Generate output path
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_dir = Path("/tmp/looping_output")
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = str(output_dir / f"loop_{timestamp}.mp4")

        result = await asyncio.to_thread(
            engine.create_loop,
            audio_path=req.audio_path,
            output_path=output_path,
            duration_hours=req.duration_minutes / 60,
            width=width,
            height=height,
            visual_type=req.visual_type,
            image_path=req.image_path,
            base_color=req.colors or "0x1a1a2e",
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/loop/video/{filename}")
async def loop_video(filename: str):
    """Serve generated looping video."""
    full_path = Path("/tmp/looping_output") / filename
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(str(full_path), media_type="video/mp4")


# ══════════════════════════════════════════════════════════════
# CHANNEL ANALYZER
# ══════════════════════════════════════════════════════════════

@app.post("/analyze/channel")
async def analyze_channel(req: AnalyzeRequest):
    """Full channel analysis pipeline."""
    try:
        analyzer = get_analyzer()
        result = await asyncio.to_thread(
            analyzer.analyze_channel,
            channel_url=req.channel_url,
            niche=req.niche,
            limit=req.limit,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze/compare")
async def analyze_compare(req: CompareRequest):
    """Compare multiple channels."""
    try:
        analyzer = get_analyzer()
        result = await asyncio.to_thread(
            analyzer.compare_channels,
            channel_urls=req.channel_urls,
            niche=req.niche,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/analyze/info")
async def analyze_info(channel_url: str):
    """Get channel metadata."""
    try:
        analyzer = get_analyzer()
        result = await asyncio.to_thread(analyzer.get_channel_info, channel_url)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# CLOAKBROWSER (Social Posting)
# ══════════════════════════════════════════════════════════════

@app.get("/cloak/profiles")
async def cloak_profiles(platform: Optional[str] = None):
    """List CloakBrowser profiles."""
    try:
        adapter = get_cloak()
        profiles = adapter.list_profiles(platform=platform)
        return {"profiles": profiles}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/cloak/post")
async def cloak_post(req: CloakPostRequest):
    """Post to social media via CloakBrowser."""
    try:
        adapter = get_cloak()
        result = await asyncio.to_thread(
            adapter.post,
            profile_id=req.profile_id,
            media_path=req.media_path,
            caption=req.caption,
            platform=req.platform,
            link=req.link,
            tags=req.tags,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/cloak/batch-post")
async def cloak_batch_post(req: CloakBatchPostRequest):
    """Post to multiple profiles at once."""
    try:
        adapter = get_cloak()
        result = await asyncio.to_thread(
            adapter.batch_post,
            profile_ids=req.profile_ids,
            media_path=req.media_path,
            caption=req.caption,
            platform=req.platform,
            link=req.link,
        )
        return {"results": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/cloak/profile/{profile_id}/status")
async def cloak_profile_status(profile_id: str):
    """Get profile status."""
    try:
        adapter = get_cloak()
        result = adapter.get_profile_status(profile_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# AUDIO FILE UPLOAD (for /loop command)
# ══════════════════════════════════════════════════════════════

@app.post("/upload/audio")
async def upload_audio(file: UploadFile = File(...)):
    """Upload an audio file for processing."""
    upload_dir = Path("/tmp/content_uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    filepath = upload_dir / filename

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    return {
        "success": True,
        "path": str(filepath),
        "filename": filename,
        "size": len(content),
    }


# ══════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("CONTENT_FACTORY_PORT", "8767"))
    print(f"🏭 Starting 1AI-Content Factory API on port {port}")
    uvicorn.run(
        "services.api:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="info",
    )
