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

import os
import asyncio
from pathlib import Path
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from services.api_models import (
    TTSRequest,
    AnalyzeRequest,
    CompareRequest,
    CloakPostRequest,
    CloakBatchPostRequest,
    AutoPilotJobRequest,
    CalendarEntryRequest,
    ABTestRequest,
    CaptionRequest,
    RepurposeRequest,
    ReMetadataRequest,
)
from services.di import (
    get_storyboard,
    get_tts,
    get_suno,
    get_music,
    get_looping,
    get_analyzer,
    get_cloak,
    get_pinterest,
    get_carousel,
    get_calendar,
    get_ab_testing,
    get_autopilot,
    get_engagement,
    get_repurpose_engine,
    get_remetadata_engine,
)




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

from services.routers.health import health_router
from services.routers.storyboard import storyboard_router
from services.routers.download import download_router
from services.routers.video import video_router
from services.routers.tikwm import tikwm_router
from services.routers.upload import upload_router
from services.routers.loop import loop_router
from services.routers.music import music_router
from services.routers.remotion import remotion_router
from services.routers.pinterest import pinterest_router
from services.routers.carousel import carousel_router
from services.routers.research import research_router
from services.routers.trends import trends_router
from services.routers.engagement import engagement_router
from services.routers.comic import comic_router
from services.routers.movie import movie_router
from services.routers.hooks import hooks_router
from services.ebook.generator import EbookContentGenerator


registry.add_router(health_router)
registry.add_router(storyboard_router)
registry.add_router(download_router)
registry.add_router(video_router)
registry.add_router(tikwm_router)
registry.add_router(upload_router)
registry.add_router(loop_router)
registry.add_router(music_router)
registry.add_router(remotion_router)
registry.add_router(pinterest_router)
registry.add_router(carousel_router)
registry.add_router(research_router)
registry.add_router(trends_router)
registry.add_router(engagement_router)
registry.add_router(comic_router)
registry.add_router(movie_router)
registry.add_router(hooks_router)
registry.register(EbookContentGenerator(), prefix="/ebook")

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