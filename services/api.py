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
# TRENDING (Scan + Auto-Generate)
# ══════════════════════════════════════════════════════════════
_scanner = None

def get_scanner():
    global _scanner
    if _scanner is None:
        from services.trends.scanner import TrendScanner
        _scanner = TrendScanner()
    return _scanner


@app.get("/trending/scan")
async def trending_scan(niche: str = "", region: str = "ID"):
    """Scan trending content across platforms."""
    try:
        scanner = get_scanner()
        results = scanner.scan_all(niche=niche, region=region)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        from services.calendar.content_calendar import ContentCalendarService
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
        entry = cal.schedule_content(
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
        entries = cal.get_entries(user_id, status=status, platform=platform)
        return {"entries": entries, "count": len(entries)}
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
        test = ab.create_test(
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
        tests = ab.get_tests(user_id, status=status)
        return {"tests": tests, "count": len(tests)}
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
