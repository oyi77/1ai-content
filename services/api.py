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
import httpx
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
    version="2.0.0",
)

# ── Database init on startup ───────────────────────────────────
@app.on_event("startup")
async def startup_db():
    """Initialize database connection on startup."""
    try:
        from services.db.models import init_db
        await init_db()
    except Exception as e:
        print(f"[API] DB init warning: {e}")


@app.on_event("startup")
async def _startup_processed_videos_db():
    """Create processed_videos table for URL-based duplicate detection."""
    import sqlite3 as _sqlite3
    _db_path = os.path.join(os.environ.get("DATA_DIR", "/tmp"), "processed_videos.db")
    try:
        conn = _sqlite3.connect(_db_path)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS processed_videos (
                url_hash    TEXT PRIMARY KEY,
                source_url  TEXT NOT NULL,
                processed_at TEXT NOT NULL,
                file_path   TEXT
            )
        """)
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[API] processed_videos DB init warning: {e}")

_PROCESSED_VIDEOS_DB = os.path.join(os.environ.get("DATA_DIR", "/tmp"), "processed_videos.db")

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


class VideoRegenerateOptions(BaseModel):
    remove_watermark: bool = True
    add_captions: bool = True
    caption_style: str = "karaoke"  # karaoke, simple, none
    color_grade: str = "vibrant"     # none, cinematic, warm, cool, vibrant, vintage
    text_overlay: str = ""           # e.g. "Check this out!"
    overlay_position: str = "bottom_center"
    generate_metadata: bool = True
    language: str = "id"


class VideoRegenerateRequest(BaseModel):
    source_url: str
    platform: str = "facebook"
    options: VideoRegenerateOptions = VideoRegenerateOptions()

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


@app.post("/upload/video")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file for remeta/repurpose processing."""
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
# CAROUSEL (TikTok Image Carousel)
# ══════════════════════════════════════════════════════════════
_carousel = None

def get_carousel():
    global _carousel
    if _carousel is None:
        from services.carousel.assembler import CarouselAssembler
        _carousel = CarouselAssembler()
    return _carousel


class CarouselRequest(BaseModel):
    topic: str
    num_slides: int = Field(default=7, ge=3, le=10)
    style: str = "outline"
    platform: str = "tiktok"
    language: str = "id"


@app.post("/carousel/create")
async def carousel_create(req: CarouselRequest):
    """Generate a TikTok carousel from a topic."""
    try:
        assembler = get_carousel()
        result = assembler.create(
            topic=req.topic,
            num_slides=req.num_slides,
            style=req.style,
            platform=req.platform,
            language=req.language,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/carousel/styles")
async def carousel_styles():
    """List available carousel styles."""
    from services.carousel.generator import STYLE_PRESETS
    return {"styles": {k: {"name": v["name"], "description": v["description"]} for k, v in STYLE_PRESETS.items()}}


# ══════════════════════════════════════════════════════════════
# AUTOMATION (AutoPilot)
# ══════════════════════════════════════════════════════════════
_autopilot = None

def get_autopilot():
    global _autopilot
    if _autopilot is None:
        from services.autopilot.tiktok_publisher import AutoPilotTikTokPublisher
        _autopilot = AutoPilotTikTokPublisher()
    return _autopilot


class AutoPilotJobRequest(BaseModel):
    name: str
    niche: str
    platforms: list[str] = ["tiktok"]
    videos_per_day: int = 3
    posting_times: list[str] = ["11:00", "15:00", "19:00"]
    content_type: str = "video"
    style: str = "educational"
    language: str = "id"
    auto_publish: bool = True
    tiktok_profile_id: str = ""


@app.post("/autopilot/create")
async def autopilot_create(req: AutoPilotJobRequest):
    """Create an autopilot job."""
    try:
        pub = get_autopilot()
        result = pub.create_job(
            name=req.name,
            niche=req.niche,
            platforms=req.platforms,
            videos_per_day=req.videos_per_day,
            posting_times=req.posting_times,
            content_type=req.content_type,
            style=req.style,
            language=req.language,
            auto_publish=req.auto_publish,
            tiktok_profile_id=req.tiktok_profile_id,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/autopilot/status")
async def autopilot_status():
    """Get autopilot status."""
    try:
        pub = get_autopilot()
        return pub.get_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/autopilot/run")
async def autopilot_run():
    """Check and run all ready autopilot jobs."""
    try:
        pub = get_autopilot()
        results = pub.check_and_run()
        return {"jobs_run": len(results), "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# TRENDING (Background scan + cache-first serving)
# ══════════════════════════════════════════════════════════════

def _get_scanner():
    from services.trends.scanner import get_scanner
    return get_scanner()


@app.on_event("startup")
async def start_trending_scanner():
    """Start background trending scanner on API startup."""
    try:
        from services.trends.scanner import start_background_scanner
        start_background_scanner()
    except Exception as e:
        print(f"[API] Failed to start trend scanner: {e}")


@app.get("/trending/cached")
async def trending_cached():
    """Return cached trending data instantly (no scan)."""
    scanner = _get_scanner()
    return scanner.get_cached()


@app.get("/trending/scan")
async def trending_scan(niche: str = "", region: str = "ID"):
    """Force a fresh scan (admin use — updates cache for everyone)."""
    try:
        scanner = _get_scanner()
        results = scanner.scan_now(niche=niche, region=region)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/trending/status")
async def trending_status():
    """Get scanner status and cache info."""
    scanner = _get_scanner()
    return scanner.get_status()


@app.post("/trending/generate")
async def trending_generate(topic: str, content_type: str = "video", platform: str = "tiktok", language: str = "id"):
    """Generate content from a trending topic."""
    try:
        if content_type == "carousel":
            assembler = get_carousel()
            result = assembler.create(topic=topic, platform=platform, language=language)
        else:
            orch = AutoPilotOrchestrator()
            result = orch.faceless_engine.generate_video(topic=topic, platform=platform, language=language)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# CALENDAR
# ══════════════════════════════════════════════════════════════
_calendar = None

def get_calendar():
    global _calendar
    if _calendar is None:
        from services.content_calendar.content_calendar import ContentCalendarService
        _calendar = ContentCalendarService()
    return _calendar


class CalendarEntryRequest(BaseModel):
    user_id: int
    topic: str
    scheduled_at: str
    platform: str = "tiktok"
    content_type: str = "video"
    caption: str = ""
    hashtags: list[str] = []
    niche: str = ""
    style: str = "educational"
    language: str = "id"
    auto_post: bool = False


@app.post("/calendar/schedule")
async def calendar_schedule(req: CalendarEntryRequest):
    """Schedule a content piece."""
    try:
        cal = get_calendar()
        entry = await cal.schedule_content(
            user_id=req.user_id,
            topic=req.topic,
            scheduled_at=req.scheduled_at,
            platform=req.platform,
            content_type=req.content_type,
            caption=req.caption,
            hashtags=req.hashtags,
            niche=req.niche,
            style=req.style,
            language=req.language,
            auto_post=req.auto_post,
        )
        return entry
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/calendar/list/{user_id}")
async def calendar_list(user_id: int, status: Optional[str] = None, platform: Optional[str] = None):
    """List calendar entries for a user."""
    try:
        cal = get_calendar()
        entries = await cal.get_entries(user_id, status=status, platform=platform)
        return {"entries": entries, "count": len(entries)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/calendar/delete/{entry_id}")
async def calendar_delete(entry_id: str, user_id: int = 0):
    """Delete a calendar entry."""
    try:
        cal = get_calendar()
        result = await cal.delete_entry(user_id, int(entry_id))
        return {"success": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ══════════════════════════════════════════════════════════════
# A/B TESTING
# ══════════════════════════════════════════════════════════════
_ab_testing = None

def get_ab_testing():
    global _ab_testing
    if _ab_testing is None:
        from services.ab_testing.service import ABTestingService
        _ab_testing = ABTestingService()
    return _ab_testing


class ABTestRequest(BaseModel):
    user_id: int
    name: str
    topic: str
    platform: str = "tiktok"
    content_type: str = "caption"
    language: str = "id"


@app.post("/ab-test/create")
async def ab_test_create(req: ABTestRequest):
    """Create an A/B test."""
    try:
        ab = get_ab_testing()
        test = await ab.create_test(
            user_id=req.user_id,
            name=req.name,
            topic=req.topic,
            platform=req.platform,
            content_type=req.content_type,
            language=req.language,
        )
        return test
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/ab-test/list/{user_id}")
async def ab_test_list(user_id: int, status: Optional[str] = None):
    """List A/B tests for a user."""
    try:
        ab = get_ab_testing()
        tests = await ab.get_tests(user_id, status=status)
        return {"tests": tests, "count": len(tests)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ab-test/{test_id}/start")
async def ab_test_start(user_id: int, test_id: str):
    """Start an A/B test."""
    try:
        ab = get_ab_testing()
        test = await ab.start_test(user_id, int(test_id))
        return test if test else {"error": "Test not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ab-test/{test_id}/end")
async def ab_test_end(user_id: int, test_id: str):
    """End test and determine winner."""
    try:
        ab = get_ab_testing()
        test = await ab.end_test(user_id, int(test_id))
        return test if test else {"error": "Test not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/ab-test/{test_id}/delete")
async def ab_test_delete(test_id: str, user_id: int = 0):
    """Delete an A/B test."""
    try:
        ab = get_ab_testing()
        result = await ab.delete_test(user_id, int(test_id))
        return {"success": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.post("/ab-test/{test_id}/start")
async def ab_test_start(user_id: int, test_id: str):
    """Start an A/B test."""
    try:
        ab = get_ab_testing()
        test = ab.start_test(user_id, test_id)
        return test if test else {"error": "Test not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ab-test/{test_id}/end")
async def ab_test_end(user_id: int, test_id: str):
    """End test and determine winner."""
    try:
        ab = get_ab_testing()
        test = ab.end_test(user_id, test_id)
        return test if test else {"error": "Test not found"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ══════════════════════════════════════════════════════════════
# CAROUSEL TEMPLATES
# ══════════════════════════════════════════════════════════════

@app.get("/carousel/templates")
async def carousel_templates(niche: str = ""):
    """List carousel templates, optionally filtered by niche."""
    from services.carousel.templates import list_templates, get_templates_by_niche, list_niches
    if niche:
        return {"templates": get_templates_by_niche(niche), "niche": niche}
    return {"templates": list_templates(), "niches": list_niches()}


@app.get("/carousel/templates/{template_id}")
async def carousel_template(template_id: str):
    """Get a specific carousel template."""
    from services.carousel.templates import get_template
    t = get_template(template_id)
    return t if t else {"error": "Template not found"}


# ══════════════════════════════════════════════════════════════
# CAPTION STYLES
# ══════════════════════════════════════════════════════════════

@app.get("/captions/styles")
async def caption_styles():
    """List available caption styles."""
    from services.carousel.caption_styles import list_styles
    return {"styles": list_styles()}


@app.get("/captions/presets")
async def caption_presets():
    """List available caption presets."""
    from services.carousel.caption_presets import list_presets
    return {"presets": list_presets()}


class CaptionRequest(BaseModel):
    topic: str
    style: str = "hype"
    platform: str = "tiktok"
    language: str = "id"
    max_length: int = 2200
    include_hashtags: bool = True
    hashtag_count: int = 10


@app.post("/captions/generate")
async def caption_generate(req: CaptionRequest):
    """Generate a caption in a specific style."""
    try:
        from services.carousel.caption_styles import CaptionGenerator
        gen = CaptionGenerator()
        result = gen.generate(
            topic=req.topic, style=req.style, platform=req.platform,
            language=req.language, max_length=req.max_length,
            include_hashtags=req.include_hashtags, hashtag_count=req.hashtag_count,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# ENGAGEMENT (Auto-Reply)
# ══════════════════════════════════════════════════════════════
_engagement = None

def get_engagement():
    global _engagement
    if _engagement is None:
        from services.engagement import AutoReplyEngine
        _engagement = AutoReplyEngine()
    return _engagement


class ReplyRequest(BaseModel):
    profile_id: str
    comment_text: str
    platform: str = "tiktok"
    post_context: str = ""


@app.post("/engagement/reply")
async def engagement_reply(req: ReplyRequest):
    """Generate and post a reply to a comment."""
    try:
        engine = get_engagement()
        result = engine.reply_to_comment(
            profile_id=req.profile_id, comment_text=req.comment_text,
            platform=req.platform, post_context=req.post_context,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/engagement/stats")
async def engagement_stats(profile_id: str = ""):
    """Get engagement reply statistics."""
    try:
        engine = get_engagement()
        return engine.get_reply_stats(profile_id or None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ══════════════════════════════════════════════════════════════
# CONTENT REPURPOSE (formerly regeneration)
# ══════════════════════════════════════════════════════════════
_repurpose_engine = None

def get_repurpose_engine():
    global _repurpose_engine
    if _repurpose_engine is None:
        from services.repurpose.engine import RepurposeEngine
        _repurpose_engine = RepurposeEngine()
    return _repurpose_engine


class RepurposeRequest(BaseModel):
    sources: list[str]
    target_duration: int = 180
    platform: str = "tiktok"
    niche: str = "general"
    style: str = "educational"
    language: str = "id"
    color_preset: str = "cinematic"
    transition_style: str = "crossfade"
    overlay_text: str = ""
    overlay_position: str = "lower_third"
    watermark_text: str = ""
    watermark_image: str = ""
    bgm_path: str = ""
    bgm_volume: float = 0.15
    voiceover_path: str = ""
    speed_min: float = 0.8
    speed_max: float = 1.5
    add_subtitles: bool = True
    subtitle_style: str = "karaoke"


@app.post("/repurpose")
async def repurpose_content(req: RepurposeRequest):
    """Repurpose content from multiple sources — anti-copyright remix with full options."""
    try:
        engine = get_repurpose_engine()
        result = engine.repurpose(
            sources=req.sources,
            target_duration=req.target_duration,
            platform=req.platform,
            niche=req.niche,
            style=req.style,
            language=req.language,
            color_preset=req.color_preset,
            transition_style=req.transition_style,
            overlay_text=req.overlay_text or None,
            overlay_position=req.overlay_position,
            watermark_text=req.watermark_text or None,
            watermark_image=req.watermark_image or None,
            bgm_path=req.bgm_path or None,
            bgm_volume=req.bgm_volume,
            voiceover_path=req.voiceover_path or None,
            speed_range=(req.speed_min, req.speed_max),
            add_subtitles=req.add_subtitles,
            subtitle_style=req.subtitle_style,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Backward compat alias
@app.post("/regenerate")
async def regenerate_content(req: RepurposeRequest):
    """Alias for /repurpose (backward compatibility)."""
    return await repurpose_content(req)


# ══════════════════════════════════════════════════════════════
# CONTENT RE-METADATA (simple re-render)
# ══════════════════════════════════════════════════════════════
_remetadata_engine = None

def get_remetadata_engine():
    global _remetadata_engine
    if _remetadata_engine is None:
        from services.remetadata.engine import ReMetadataEngine
        _remetadata_engine = ReMetadataEngine()
    return _remetadata_engine


class ReMetadataRequest(BaseModel):
    source: str
    overlay: str = ""
    watermark: str = ""
    position: str = "bottom_right"
    speed: float = 0
    color_shift: bool = True
    niche: str = "general"
    platform: str = "tiktok"
    language: str = "id"


@app.post("/remeta")
async def remeta_content(req: ReMetadataRequest):
    """Re-render video with new metadata (text overlay + re-encode)."""
    try:
        engine = get_remetadata_engine()
        result = engine.remetadata(
            source=req.source,
            overlay=req.overlay or None,
            watermark=req.watermark or None,
            position=req.position,
            speed=req.speed if req.speed > 0 else None,
            color_shift=req.color_shift,
            niche=req.niche,
            platform=req.platform,
            language=req.language,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



# ══════════════════════════════════════════════════════════════
# DOWNLOAD — Video download from TikTok/YouTube/IG
# ══════════════════════════════════════════════════════════════

class ProfileDownloadRequest(BaseModel):
    profile_url: str
    category: str = "general"
    max_videos: int = Field(default=10, ge=1, le=50)
class UserPostsRequest(BaseModel):
    unique_id: str
    count: int = Field(default=10, ge=1, le=100)
class ChallengeSearchRequest(BaseModel):
    keywords: str
    count: int = Field(default=5, ge=1, le=50)
class ChallengePostsRequest(BaseModel):
    challenge_id: str
    count: int = Field(default=10, ge=1, le=100)
class DownloadRequest(BaseModel):
    video_url: str
    category: str = "general"


@app.post("/download/video")
async def download_video_endpoint(req: DownloadRequest):
    """Download a single video using full cascade.

    Cascade: tikwm → yt-dlp → Vidbee → Cobalt → CloakBrowser → scrape → cover → placeholder
    Returns {file_path, file_type, status, reason, file_size}.
    """
    from services.download.engine import download_video

    result = await download_video(req.video_url, req.category)

    # Add file_size if file exists
    if result.get("file_path") and os.path.exists(result["file_path"]):
        result["file_size"] = os.path.getsize(result["file_path"])

    return {"data": result}

@app.post("/download/profile")
async def download_profile(req: ProfileDownloadRequest):
    """Download all videos from a TikTok profile.

    Parses profile URL → fetches video list via tikwm → batch-downloads each via cascade.
    Returns list of {file_path, file_type, status, reason, file_size} per video.
    """
    import re
    from services.download.engine import download_video, TIKWM_API_URL

    # 1. Extract username from profile URL
    m = re.search(r"tiktok\.com/@([\w.]+)", req.profile_url)
    if not m:
        return {"data": [], "error": f"Invalid TikTok profile URL: {req.profile_url}"}
    username = m.group(1)

    # 2. Fetch video list via tikwm
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{TIKWM_API_URL}user/posts",
                params={"unique_id": username, "count": min(req.max_videos, 50)},
            )
            if resp.status_code != 200:
                return {"data": [], "error": f"tikwm user/posts returned {resp.status_code}"}
            body = resp.json()
            if body.get("code") != 0:
                return {"data": [], "error": f"tikwm error: {body.get('msg', 'unknown')}"}
            videos = (body.get("data") or {}).get("videos", [])
    except Exception as e:
        return {"data": [], "error": f"tikwm request failed: {e}"}

    if not videos:
        return {"data": [], "error": "No videos found in profile"}

    # 3. Download each video
    results = []
    for v in videos:
        vid_id = v.get("video_id", "")
        if not vid_id:
            continue
        video_url = f"https://www.tiktok.com/@{username}/video/{vid_id}"
        result = await download_video(video_url, req.category)
        if result.get("file_path") and os.path.exists(result["file_path"]):
            result["file_size"] = os.path.getsize(result["file_path"])
        result["video_id"] = vid_id
        result["video_url"] = video_url
        result["title"] = (v.get("title") or "")[:200]
        results.append(result)

    return {"data": results, "total": len(results)}


@app.post("/tikwm/user/posts")
async def tikwm_user_posts(req: UserPostsRequest):
    """Proxy for tikwm user/posts — fetch a creator's video list."""
    from services.download.engine import TIKWM_API_URL
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{TIKWM_API_URL}user/posts",
            params={"unique_id": req.unique_id, "count": req.count},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"tikwm returned {resp.status_code}")
        return resp.json()


@app.post("/tikwm/challenge/search")
async def tikwm_challenge_search(req: ChallengeSearchRequest):
    """Proxy for tikwm challenge/search — find challenges by keyword."""
    from services.download.engine import TIKWM_API_URL
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{TIKWM_API_URL}challenge/search",
            params={"keywords": req.keywords, "count": req.count},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"tikwm returned {resp.status_code}")
        return resp.json()


@app.post("/tikwm/challenge/posts")
async def tikwm_challenge_posts(req: ChallengePostsRequest):
    """Proxy for tikwm challenge/posts — fetch videos in a challenge."""
    from services.download.engine import TIKWM_API_URL
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{TIKWM_API_URL}challenge/posts",
            params={"challenge_id": req.challenge_id, "count": req.count},
        )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail=f"tikwm returned {resp.status_code}")
        return resp.json()


# ══════════════════════════════════════════════════════════════
# TIKTOK COOKIE REFRESH
# ══════════════════════════════════════════════════════════════


_TIKTOK_BROWSERS = ["chromium", "vivaldi", "firefox"]
"""Browser names to try, in order, for cookie extraction."""


async def _extract_browser_cookies(browser: str, cookies_path: str) -> dict:
    """Try extracting cookies from one browser. Returns result dict."""
    cmd = [
        "yt-dlp",
        "--cookies-from-browser", browser,
        "--cookies", cookies_path,
        "--flat-playlist",
        "--dump-json",
        "https://www.tiktok.com/@_",  # dummy — fails but cookies written before error
    ]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=30)
    except asyncio.TimeoutError:
        return {"browser": browser, "status": "timeout"}
    except FileNotFoundError:
        return {"browser": browser, "status": "not_found"}
    except Exception as e:
        return {"browser": browser, "status": "error", "message": f"{type(e).__name__}: {e}"}

    # yt-dlp exits 0 even on extractor errors ("Unable to extract secondary user ID")
    # — cookies are written before that error.  Treat any successful invocation as okay
    # and let the caller verify file content.
    return {"browser": browser, "status": "ok", "returncode": proc.returncode}


def _has_tiktok_cookies(path: str) -> bool:
    """Check if cookie file contains at least one .tiktok.com entry."""
    try:
        with open(path) as f:
            for line in f:
                if line.startswith(".tiktok.com\t"):
                    return True
    except Exception:
        pass
    return False


@app.post("/video/refresh-cookies")
async def refresh_tiktok_cookies(browser: str | None = None):
    """Extract fresh TikTok cookies from installed browsers into config/tiktok_cookies.txt.

    Tries chromium, vivaldi, then firefox — stops at the first browser that
    yields .tiktok.com cookies.  Override with ?browser=chromium|vivaldi|firefox.
    """
    cookies_dir = os.path.join(os.path.dirname(__file__), "..", "config")
    cookies_path = os.path.join(cookies_dir, "tiktok_cookies.txt")
    cookies_path = os.path.abspath(os.path.normpath(cookies_path))
    os.makedirs(cookies_dir, exist_ok=True)

    browsers = [browser] if browser else _TIKTOK_BROWSERS
    results = []
    used_browser = None

    for name in browsers:
        r = await _extract_browser_cookies(name, cookies_path)
        results.append(r)
        if r["status"] == "ok" and os.path.getsize(cookies_path) > 100:
            if _has_tiktok_cookies(cookies_path):
                used_browser = name
                break
            # file has cookies but no .tiktok.com entries — keep trying next browser

    # Build response
    summary = {r["browser"]: r.get("status", "unknown") for r in results}

    if used_browser:
        return {"data": {
            "status": "ok",
            "message": f"TikTok cookies refreshed via {used_browser}",
            "cookies_file": cookies_path,
            "size_bytes": os.path.getsize(cookies_path),
            "browser": used_browser,
            "tried": summary,
        }}

    # No browser had TikTok cookies
    fsize = os.path.getsize(cookies_path) if os.path.exists(cookies_path) else 0
    if fsize > 100:
        return {"data": {
            "status": "partial",
            "message": "Cookies extracted but no .tiktok.com entries found (login required in any browser)",
            "cookies_file": cookies_path,
            "size_bytes": fsize,
            "browser": None,
            "tried": summary,
        }}

    return {"data": {
        "status": "error",
        "message": "No browser produced usable cookies",
        "tried": summary,
    }}

# ══════════════════════════════════════════════════════════════
# VIDEO PROCESS — Download + Convert for distribution
# ══════════════════════════════════════════════════════════════

class VideoProcessRequest(BaseModel):
    source_url: str
    target_format: str = "9:16"  # 9:16, 16:9, 1:1
    platform: str = "facebook"   # facebook, tiktok, instagram
    category: str = "general"
    transforms: list[str] = []   # mirror | speed_<factor> | crop_zoom_<zoom>


@app.post("/video/process")
async def process_video(req: VideoProcessRequest):
    """Download video and convert to target format.

    Pipeline: download → detect format → reframe if needed → return file_path.
    Returns {file_path, file_type, duration, width, height, format, status}.
    """
    from services.download.engine import download_video
    import subprocess
    import uuid

    # 1. Download
    result = await download_video(req.source_url, req.category)
    if result.get("status") != "downloaded" or not result.get("file_path"):
        return {"data": {
            "status": "failed",
            "error": f"Download failed: {result.get('reason', 'unknown')}",
            "file_path": None,
        }}

    file_path = result["file_path"]
    file_type = result.get("file_type", "video")

    # 2. Get video metadata + codec check
    duration = None
    width = None
    height = None
    video_codec = None
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", file_path],
            capture_output=True, text=True, timeout=10,
        )
        if probe.returncode == 0:
            import json as _json
            meta = _json.loads(probe.stdout)
            for stream in meta.get("streams", []):
                if stream.get("codec_type") == "video":
                    width = int(stream.get("width", 0))
                    height = int(stream.get("height", 0))
                    video_codec = stream.get("codec_name", "").lower()
                    duration = float(meta.get("format", {}).get("duration", 0))
                    break
    except Exception:
        pass

    # 3. Force H.264 re-encode if codec is not avc1/h264
    #    Facebook requires H.264 — HEVC/H.265 videos upload as "ready" but can't play (resolution 0x0)
    H264_CODECS = {"h264", "avc1", "avc"}
    if file_type == "video" and video_codec and video_codec not in H264_CODECS:
        h264_path = os.path.join(os.path.dirname(file_path), f"{uuid.uuid4().hex}_h264.mp4")
        try:
            reenc = subprocess.run(
                ["ffmpeg", "-y", "-i", file_path,
                 "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                 "-c:a", "aac", "-b:a", "128k",
                 "-movflags", "+faststart",
                 h264_path],
                capture_output=True, text=True, timeout=180,
            )
            if reenc.returncode == 0 and os.path.exists(h264_path) and os.path.getsize(h264_path) > 10000:
                file_path = h264_path
                video_codec = "h264"
                # Re-probe to get updated dimensions
                try:
                    probe2 = subprocess.run(
                        ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", file_path],
                        capture_output=True, text=True, timeout=10,
                    )
                    if probe2.returncode == 0:
                        import json as _json2
                        meta2 = _json2.loads(probe2.stdout)
                        for stream in meta2.get("streams", []):
                            if stream.get("codec_type") == "video":
                                width = int(stream.get("width", 0))
                                height = int(stream.get("height", 0))
                                duration = float(meta2.get("format", {}).get("duration", 0))
                                break
                except Exception:
                    pass
            else:
                # Re-encode failed — log but continue with original
                if os.path.exists(h264_path):
                    os.remove(h264_path)
        except Exception:
            pass

    # 4. Convert to target format if video and dimensions don't match
    target_w, target_h = {"9:16": (1080, 1920), "16:9": (1920, 1080), "1:1": (1080, 1080)}.get(req.target_format, (1080, 1920))

    if file_type == "video" and width and height:
        current_aspect = width / height if height > 0 else 0
        target_aspect = target_w / target_h if target_h > 0 else 0

        # Only reframe if aspect ratio differs significantly
        if abs(current_aspect - target_aspect) > 0.1:
            output_path = os.path.join(os.path.dirname(file_path), f"{uuid.uuid4().hex}.mp4")
            try:
                from services.clipper.reframer import Reframer
                reframer = Reframer()
                output_path = reframer.reframe_to_vertical(file_path, output_path, req.target_format)
                if os.path.exists(output_path):
                    file_path = output_path
                    width = target_w
                    height = target_h
                    # Update duration from new file
                    try:
                        probe2 = subprocess.run(
                            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_format", file_path],
                            capture_output=True, text=True, timeout=10,
                        )
                        if probe2.returncode == 0:
                            import json as _json2
                            meta2 = _json2.loads(probe2.stdout)
                            duration = float(meta2.get("format", {}).get("duration", 0))
                    except Exception:
                        pass
            except Exception as e:
                # Reframe failed — return original
                pass

    # 5. Apply uniqueness transforms (mirror / speed / crop_zoom)
    if file_type == "video" and req.transforms:
        from services.clipper.reframer import Reframer as _Reframer
        _reframer = _Reframer()
        for _transform in req.transforms:
            _out = os.path.join(os.path.dirname(file_path), f"{uuid.uuid4().hex}_t.mp4")
            try:
                if _transform == "mirror":
                    file_path = _reframer.apply_mirror(file_path, _out)
                elif _transform.startswith("speed_"):
                    _factor = float(_transform.split("_", 1)[1])
                    file_path = _reframer.apply_speed(file_path, _out, _factor)
                elif _transform.startswith("crop_zoom_"):
                    _zoom = float(_transform.split("_", 2)[2])
                    file_path = _reframer.apply_crop_zoom(file_path, _out, _zoom)
            except Exception:
                # Transform failed — continue with current file_path unchanged
                if os.path.exists(_out):
                    os.remove(_out)

    # Log to processed_videos for duplicate detection
    if file_type == "video" and file_path:
        import sqlite3 as _sqlite3, hashlib as _hashlib
        _url_hash = _hashlib.sha256(req.source_url.encode()).hexdigest()
        try:
            _conn = _sqlite3.connect(_PROCESSED_VIDEOS_DB)
            _conn.execute(
                "INSERT OR REPLACE INTO processed_videos (url_hash, source_url, processed_at, file_path) VALUES (?,?,?,?)",
                (_url_hash, req.source_url, datetime.utcnow().isoformat(), file_path),
            )
            _conn.commit()
            _conn.close()
        except Exception:
            pass

    return {"data": {
        "status": "processed",
        "file_path": file_path,
        "file_type": file_type,
        "duration": round(duration, 2) if duration else None,
        "width": width,
        "height": height,
        "format": req.target_format,
        "reason": result.get("reason", ""),
        "file_size": os.path.getsize(file_path) if os.path.exists(file_path) else 0,
    }}


class VideoSearchRequest(BaseModel):
    video_url: str


@app.post("/video/search")
async def video_search(req: VideoSearchRequest):
    """Check if a source URL has been processed before.

    Returns {found, url_hash, processed_at, file_path}.
    """
    import sqlite3 as _sqlite3, hashlib as _hashlib
    _url_hash = _hashlib.sha256(req.video_url.encode()).hexdigest()
    try:
        _conn = _sqlite3.connect(_PROCESSED_VIDEOS_DB)
        row = _conn.execute(
            "SELECT source_url, processed_at, file_path FROM processed_videos WHERE url_hash = ?",
            (_url_hash,),
        ).fetchone()
        _conn.close()
    except Exception:
        row = None
    if row:
        return {"data": {"found": True, "url_hash": _url_hash, "processed_at": row[1], "file_path": row[2]}}
    return {"data": {"found": False, "url_hash": _url_hash, "processed_at": None, "file_path": None}}

# ══════════════════════════════════════════════════════════════
# VIDEO REGENERATE — Full content regeneration pipeline
# ══════════════════════════════════════════════════════════════

@app.post("/video/regenerate")
async def video_regenerate(req: VideoRegenerateRequest):
    """Full content regeneration: download → strip watermark → reframe → color grade → overlay → captions → metadata.

    Pipeline runs best-effort — if any step fails, continue with the rest.
    Returns {file_path, metadata: {title, hashtags, description}, duration, width, height, format, file_size}.
    """
    import subprocess
    import uuid
    import json as _json
    from pathlib import Path

    errors: list[str] = []
    run_id = uuid.uuid4().hex[:12]
    out_dir = Path(f"/tmp/1ai-content/{run_id}")
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── 1. Download ──────────────────────────────────────────
    try:
        from services.download.engine import download_video as _dl
        dl = await _dl(req.source_url)
        if dl.get("status") != "downloaded" or not dl.get("file_path"):
            raise RuntimeError(f"Download failed: {dl.get('reason', 'unknown')}")
        file_path: str = dl["file_path"]
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Download failed: {e}")

    # Helper: get video metadata via ffprobe
    def _probe(path: str) -> dict:
        try:
            r = subprocess.run(
                ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", path],
                capture_output=True, text=True, timeout=10,
            )
            if r.returncode == 0:
                return _json.loads(r.stdout)
        except Exception:
            pass
        return {}

    # ── 2. Strip watermark (crop bottom-right corner) ────────
    if req.options.remove_watermark:
        try:
            cropped = str(out_dir / f"crop_{run_id}.mp4")
            # TikTok watermark is in bottom-right — crop 20px from right and bottom
            subprocess.run(
                ["ffmpeg", "-y", "-i", file_path, "-vf", "crop=iw-20:ih-20:0:0", "-c:a", "copy", cropped],
                capture_output=True, text=True, timeout=120,
            )
            if os.path.exists(cropped) and os.path.getsize(cropped) > 0:
                file_path = cropped
        except Exception as e:
            errors.append(f"watermark_strip: {e}")

    # ── 3. Reframe to target platform dimensions ─────────────
    try:
        from services.repurpose.engine import PLATFORM_PRESETS
        preset = PLATFORM_PRESETS.get(req.platform, PLATFORM_PRESETS.get("tiktok"))
        target_w, target_h = preset["width"], preset["height"]

        meta = _probe(file_path)
        cur_w, cur_h = 0, 0
        for s in meta.get("streams", []):
            if s.get("codec_type") == "video":
                cur_w, cur_h = int(s.get("width", 0)), int(s.get("height", 0))
                break

        if cur_w and cur_h:
            cur_aspect = cur_w / cur_h
            tgt_aspect = target_w / target_h
            if abs(cur_aspect - tgt_aspect) > 0.1:
                reframed = str(out_dir / f"reframe_{run_id}.mp4")
                from services.clipper.reframer import Reframer
                reframer = Reframer()
                aspect_str = preset.get("aspect", "9:16")
                reframer.reframe_to_vertical(file_path, reframed, aspect_str)
                if os.path.exists(reframed) and os.path.getsize(reframed) > 0:
                    file_path = reframed
    except Exception as e:
        errors.append(f"reframe: {e}")

    # ── 3b. Upscale if resolution is too low ──────────────
    # Facebook Reels require minimum 720p. Upscale to target if smaller.
    try:
        meta2 = _probe(file_path)
        cur_w2, cur_h2 = 0, 0
        for s in meta2.get("streams", []):
            if s.get("codec_type") == "video":
                cur_w2, cur_h2 = int(s.get("width", 0)), int(s.get("height", 0))
                break
        if cur_w2 and cur_h2 and (cur_w2 < target_w or cur_h2 < target_h):
            upscaled = str(out_dir / f"upscale_{run_id}.mp4")
            subprocess.run(
                ["ffmpeg", "-y", "-i", file_path,
                 "-vf", f"scale={target_w}:{target_h}:flags=lanczos",
                 "-c:v", "libx264", "-crf", "18", "-preset", "medium",
                 "-c:a", "copy", "-pix_fmt", "yuv420p", upscaled],
                capture_output=True, text=True, timeout=180,
            )
            if os.path.exists(upscaled) and os.path.getsize(upscaled) > 0:
                file_path = upscaled
    except Exception as e:
        errors.append(f"upscale: {e}")
    # ── 4. Color grade ───────────────────────────────────────
    if req.options.color_grade and req.options.color_grade != "none":
        try:
            from services.repurpose.engine import COLOR_PRESETS
            vf = COLOR_PRESETS.get(req.options.color_grade, "")
            if vf:
                graded = str(out_dir / f"grade_{run_id}.mp4")
                subprocess.run(
                    ["ffmpeg", "-y", "-i", file_path, "-vf", vf, "-c:a", "copy", graded],
                    capture_output=True, text=True, timeout=120,
                )
                if os.path.exists(graded) and os.path.getsize(graded) > 0:
                    file_path = graded
        except Exception as e:
            errors.append(f"color_grade: {e}")

    # ── 5. Text overlay ──────────────────────────────────────
    if req.options.text_overlay:
        try:
            from services.repurpose.engine import OVERLAY_POSITIONS
            pos = OVERLAY_POSITIONS.get(req.options.overlay_position, OVERLAY_POSITIONS["bottom_center"])
            # Escape special chars for FFmpeg drawtext
            safe_text = req.options.text_overlay.replace("'", "'\\''").replace(":", "\\:")
            drawtext = (
                f"drawtext=text='{safe_text}'"
                f":fontsize=48:fontcolor=white:borderw=3:bordercolor=black"
                f":x={pos['x']}:y={pos['y']}"
            )
            overlaid = str(out_dir / f"overlay_{run_id}.mp4")
            subprocess.run(
                ["ffmpeg", "-y", "-i", file_path, "-vf", drawtext, "-c:a", "copy", overlaid],
                capture_output=True, text=True, timeout=120,
            )
            if os.path.exists(overlaid) and os.path.getsize(overlaid) > 0:
                file_path = overlaid
        except Exception as e:
            errors.append(f"text_overlay: {e}")

    # ── 6. Add captions ──────────────────────────────────────
    if req.options.add_captions and req.options.caption_style != "none":
        try:
            from services.clipper.reframer import Reframer
            reframer = Reframer()
            # Generate karaoke subtitles from audio
            sub_path = str(out_dir / f"subs_{run_id}.ass")
            try:
                reframer.generate_karaoke_subtitles(file_path, sub_path, style=req.options.caption_style)
            except Exception:
                # If transcription fails, create simple placeholder subtitles
                meta = _probe(file_path)
                dur = float(meta.get("format", {}).get("duration", 10))
                import pysubs2
                subs = pysubs2.SSAFile()
                subs.events.append(pysubs2.SSAEvent(
                    start=0, end=int(dur * 1000),
                    text=req.options.text_overlay or "Regenerated by 1AI",
                ))
                subs.save(sub_path)

            if os.path.exists(sub_path):
                captioned = str(out_dir / f"caption_{run_id}.mp4")
                reframer.burn_subtitles(file_path, sub_path, captioned)
                if os.path.exists(captioned) and os.path.getsize(captioned) > 0:
                    file_path = captioned
        except Exception as e:
            errors.append(f"captions: {e}")

    # ── 7. Generate metadata ─────────────────────────────────
    # Platform-specific metadata templates with Indonesian hashtags
    _PLATFORM_METADATA = {
        "facebook": {
            "titles": [
                "Coba lihat ini! 🔥", "Wajib coba! 💪", "Tips yang jarang orang tahu",
                "Ini dia yang kamu cari! ✨", "Jangan sampai ketinggalan! 🚀",
            ],
            "hashtags": ["#facebookreels", "#viral", "#trending", "#fyp", "#indonesia", "#tips"],
        },
        "tiktok": {
            "titles": [
                "POV: kamu nemuin ini 🔥", "Ini gila sih! 😱", "Coba tebak...",
            ],
            "hashtags": ["#fyp", "#foryou", "#viral", "#trending", "#tiktokindonesia"],
        },
        "instagram": {
            "titles": [
                "Save this for later! ✨", "Your feed needed this 💫",
            ],
            "hashtags": ["#reels", "#explore", "#viral", "#trending", "#instagram"],
        },
    }

    metadata: dict = {"title": "", "hashtags": [], "description": ""}
    if req.options.generate_metadata:
        try:
            # Try LLM via OmniRoute first
            omni_url = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")
            async with httpx.AsyncClient(timeout=15.0) as llm_client:
                llm_resp = await llm_client.post(
                    f"{omni_url}/chat/completions",
                    json={
                        "model": "gemini-2.0-flash",
                        "messages": [{
                            "role": "user",
                            "content": (
                                f"Generate a short catchy social media title (max 60 chars), "
                                f"5 relevant hashtags, and a 1-sentence description for a "
                                f"{req.platform} post. Language: {req.options.language}. "
                                f"Return JSON: {{\"title\":\"...\",\"hashtags\":[\"#...\"],\"description\":\"...\"}}"
                            ),
                        }],
                        "max_tokens": 200,
                    },
                )
                if llm_resp.status_code == 200:
                    content = llm_resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
                    # Extract JSON from response
                    import re as _re
                    json_match = _re.search(r'\{[^}]+\}', content)
                    if json_match:
                        metadata = json.loads(json_match.group())
                        if metadata.get("title"):
                            raise RuntimeError("")  # Skip fallback
        except RuntimeError:
            pass  # LLM succeeded
        except Exception as e:
            errors.append(f"metadata_llm: {e}")

        # Fallback: platform-aware template
        if not metadata.get("title"):
            import random
            preset = _PLATFORM_METADATA.get(req.platform, _PLATFORM_METADATA["facebook"])
            metadata = {
                "title": random.choice(preset["titles"]),
                "hashtags": preset["hashtags"],
                "description": f"Check out this content on {req.platform}!",
            }

    # ── 8. Final H.264 guarantee + metadata ───────────────────
    final_meta = _probe(file_path)
    final_codec = None
    duration = None
    width = None
    height = None
    for s in final_meta.get("streams", []):
        if s.get("codec_type") == "video":
            width = int(s.get("width", 0))
            height = int(s.get("height", 0))
            final_codec = s.get("codec_name", "").lower()
            break
    duration = float(final_meta.get("format", {}).get("duration", 0)) if final_meta.get("format") else None

    # Final safety net — if somehow not H.264, force re-encode
    if final_codec and final_codec not in {"h264", "avc1", "avc"}:
        h264_final = str(out_dir / f"h264_final_{run_id}.mp4")
        try:
            subprocess.run(
                ["ffmpeg", "-y", "-i", file_path,
                 "-c:v", "libx264", "-crf", "18", "-preset", "fast",
                 "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
                 h264_final],
                capture_output=True, text=True, timeout=180,
            )
            if os.path.exists(h264_final) and os.path.getsize(h264_final) > 10000:
                file_path = h264_final
        except Exception:
            errors.append(f"h264_final: re-encode failed")

    return {"data": {
        "status": "regenerated",
        "file_path": file_path,
        "metadata": metadata,
        "duration": round(duration, 2) if duration else None,
        "width": width,
        "height": height,
        "format": "mp4",
        "file_size": os.path.getsize(file_path) if os.path.exists(file_path) else 0,
        "errors": errors,
    }}



# ══════════════════════════════════════════════════════════════
# REMOTION PRODUCT AD RENDERER
# ══════════════════════════════════════════════════════════════


class RenderAdRequest(BaseModel):
    image_url: str = Field(..., description="Product image URL")
    title: str = Field(..., description="Product title/name")
    category: str = Field(
        default="beauty",
        description="Product category: beauty, fashion, hobi, kesehatan, homeliving",
    )
    affiliate_link: str = Field(default="", description="Shopee affiliate link")
    brand_name: str = Field(default="Shopee Affiliate", description="Brand/page name")
    ad_copy: Optional[str] = Field(default=None, description="Custom ad copy text")
    hook_text: Optional[str] = Field(default=None, description="Custom hook text")
    cta_text: str = Field(
        default="Link di Bio! 🔗", description="Call-to-action text"
    )


@app.post("/content/render-ad")
async def render_ad(req: RenderAdRequest):
    """Render a product ad video using Remotion (9:16, 1080x1920, 15s).

    Generates category-specific ad copy and renders a professional product
    showcase video with animations, text overlays, and branding.
    """
    import services.remotion as remotion

    try:
        result = await remotion.render_product_ad(
            image_url=req.image_url,
            title=req.title,
            category=req.category,
            affiliate_link=req.affiliate_link,
            brand_name=req.brand_name,
            ad_copy=req.ad_copy,
            hook_text=req.hook_text,
            cta_text=req.cta_text,
        )
        return {
            "status": "ok",
            "data": result,
        }
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Remotion render error: {type(e).__name__}: {e}",
        )


# ══════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════
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
