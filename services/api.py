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
- cloak_adapter — Social media posting via CloakBrowser CDP

Run:
    python services/api.py
    # or: uvicorn services.api:app --host 0.0.0.0 --port 8766
"""

import subprocess
import os
import json
import httpx
import asyncio
import tempfile
from pathlib import Path
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, FastAPI, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

# ── Import services ────────────────────────────────────────────
from services.pinterest import PinterestScraper
from services.storyboard.engine import StoryboardEngine
from services.tts.engine import TTSEngine
from services.suno.client import SunoClient
from services.music.generator import MusicGenerator
from services.looping.engine import LoopingEngine
from services.analysis.channel_analyzer import ChannelAnalyzer
from services.cloak_adapter import CloakBrowserAdapter


async def _run_subprocess(cmd: list[str], **kwargs):
    """Run subprocess in thread pool to avoid blocking the event loop."""
    return await asyncio.to_thread(lambda: subprocess.run(cmd, **kwargs))


async def _probe_video(file_path: str) -> dict:
    """Run ffprobe and return structured video metadata."""
    try:
        probe = await _run_subprocess(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", "-show_format", file_path],
            capture_output=True, text=True, timeout=10,
        )
        if probe.returncode != 0:
            return {}
        meta = json.loads(probe.stdout)
        duration = 0.0
        width = 0
        height = 0
        video_codec = ""
        audio_codec = ""
        for stream in meta.get("streams", []):
            if stream.get("codec_type") == "video":
                width = int(stream.get("width", 0))
                height = int(stream.get("height", 0))
                video_codec = stream.get("codec_name", "").lower()
                duration = float(meta.get("format", {}).get("duration", 0))
            elif stream.get("codec_type") == "audio":
                audio_codec = stream.get("codec_name", "")
        return {
            "duration": duration,
            "width": width,
            "height": height,
            "video_codec": video_codec,
            "audio_codec": audio_codec,
        }
    except Exception:
        return {}


async def _probe_field(file_path: str, field: str, stream_index: int = 0) -> str:
    """Probe a specific ffprobe field (e.g. pix_fmt) from the first video stream."""
    try:
        probe = await _run_subprocess(
            ["ffprobe", "-v", "quiet", "-print_format", "json", "-show_streams", file_path],
            capture_output=True, text=True, timeout=10,
        )
        if probe.returncode != 0:
            return ""
        meta = json.loads(probe.stdout)
        streams = meta.get("streams", [])
        for s in streams:
            if s.get("codec_type") == "video":
                return s.get(field, "")
        return ""
    except Exception:
        return ""


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

_pinterest: Optional[PinterestScraper] = None
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


def get_pinterest() -> PinterestScraper:
    global _pinterest
    if _pinterest is None:
        _pinterest = PinterestScraper()
    return _pinterest


# ── More service instances (lazy init) ─────────────────────────
_carousel = None
def get_carousel():
    global _carousel
    if _carousel is None:
        from services.carousel.assembler import CarouselAssembler
        _carousel = CarouselAssembler()
    return _carousel


_calendar = None
def get_calendar():
    global _calendar
    if _calendar is None:
        from services.content_calendar.content_calendar import ContentCalendarService
        _calendar = ContentCalendarService()
    return _calendar


_ab_testing = None
def get_ab_testing():
    global _ab_testing
    if _ab_testing is None:
        from services.ab_testing.service import ABTestingService
        _ab_testing = ABTestingService()
    return _ab_testing


_autopilot = None
def get_autopilot():
    global _autopilot
    if _autopilot is None:
        from services.autopilot.tiktok_publisher import AutoPilotTikTokPublisher
        _autopilot = AutoPilotTikTokPublisher()
    return _autopilot


_engagement = None
def get_engagement():
    global _engagement
    if _engagement is None:
        from services.engagement import AutoReplyEngine
        _engagement = AutoReplyEngine()
    return _engagement


_repurpose_engine = None
def get_repurpose_engine():
    global _repurpose_engine
    if _repurpose_engine is None:
        from services.repurpose.engine import RepurposeEngine
        _repurpose_engine = RepurposeEngine()
    return _repurpose_engine


_remetadata_engine = None
def get_remetadata_engine():
    global _remetadata_engine
    if _remetadata_engine is None:
        from services.remetadata.engine import ReMetadataEngine
        _remetadata_engine = ReMetadataEngine()
    return _remetadata_engine


# ══════════════════════════════════════════════════════════════
# REQUEST / RESPONSE MODELS (for endpoints staying in api.py)
# ══════════════════════════════════════════════════════════════

class TTSRequest(BaseModel):
    text: str
    language: str = "id"
    voice: Optional[str] = None
    rate: str = "+0%"
    pitch: str = "+0Hz"


class AnalyzeRequest(BaseModel):
    channel_url: str
    niche: str = ""
    limit: int = Field(default=50, ge=5, le=200)


class CompareRequest(BaseModel):
    channel_urls: list[str]
    niche: str = ""


class CloakPostRequest(BaseModel):
    profile_id: str
    media_path: str = ""
    caption: str
    platform: str
    link: Optional[str] = None
    tags: Optional[list[str]] = None


class CloakBatchPostRequest(BaseModel):
    profile_ids: list[str]
    media_path: str = ""
    caption: str
    platform: str
    link: Optional[str] = None


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


class ABTestRequest(BaseModel):
    user_id: int
    name: str
    topic: str
    platform: str = "tiktok"
    content_type: str = "caption"
    language: str = "id"


class CaptionRequest(BaseModel):
    topic: str
    style: str = "hype"
    platform: str = "tiktok"
    language: str = "id"
    max_length: int = 2200
    include_hashtags: bool = True
    hashtag_count: int = 10


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
# AUTOMATION (AutoPilot)
# ══════════════════════════════════════════════════════════════

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
# CALENDAR
# ══════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════
# CAPTIONS
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
# CONTENT REPURPOSE (formerly regeneration)
# ══════════════════════════════════════════════════════════════

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


# ── TRENDING SCANNER (startup event) ────────────────────────────
@app.on_event("startup")
async def start_trending_scanner():
    """Start background trending scanner on API startup."""
    try:
        from services.trends.scanner import start_background_scanner
        start_background_scanner()
    except Exception as e:
        print(f"[API] Failed to start trend scanner: {e}")


# ══════════════════════════════════════════════════════════════
# DOMAIN-SPLIT ROUTERS — import and register via GeneratorRegistry
# ══════════════════════════════════════════════════════════════

from services.generator import GeneratorRegistry
registry = GeneratorRegistry()

_ROUTER_MODULES: list[tuple[str, str]] = [
    ("services.routers.health", "health_router"),
    ("services.routers.storyboard", "storyboard_router"),
    ("services.routers.download", "download_router"),
    ("services.routers.video", "video_router"),
    ("services.routers.tikwm", "tikwm_router"),
    ("services.routers.upload", "upload_router"),
    ("services.routers.loop", "loop_router"),
    ("services.routers.music", "music_router"),
    ("services.routers.remotion", "remotion_router"),
    ("services.routers.clipper", "clipper_router"),
    ("services.routers.pinterest", "pinterest_router"),
    ("services.routers.carousel", "carousel_router"),
    ("services.routers.brand", "brand_router"),
    ("services.routers.faceless", "faceless_router"),
    ("services.routers.research", "research_router"),
    ("services.routers.trends", "trends_router"),
    ("services.routers.engagement", "engagement_router"),
    ("services.routers.comic", "comic_router"),
    ("services.routers.movie", "movie_router"),
]

for mod_path, attr_name in _ROUTER_MODULES:
    try:
        mod = __import__(mod_path, fromlist=[attr_name])
        registry.add_router(getattr(mod, attr_name))
    except Exception as e:
        print(f"  ⚠ {mod_path}: {e}")

# Ebook generator — registered via ContentGenerator protocol (CRUD + extra routes)
from services.routers.ebook import _get as get_ebook_gen
registry.register(get_ebook_gen(), prefix="/ebook", tags=["ebook"])

# Wire everything into the app
registry.wire(app)

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