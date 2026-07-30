"""Trends routes — trending content scanner and cache."""
from fastapi import APIRouter, HTTPException

from services.db.models import ContentType

from services.di import get_carousel

trends_router = APIRouter(prefix="", tags=["trends"])


def _get_scanner():
    from services.trends.scanner import get_scanner
    return get_scanner()


@trends_router.get("/trending/cached")
async def trending_cached():
    """Return cached trending data instantly (no scan)."""
    scanner = _get_scanner()
    return scanner.get_cached()


@trends_router.get("/trending/scan")
async def trending_scan(niche: str = "", region: str = "ID"):
    """Force a fresh scan (admin use — updates cache for everyone)."""
    try:
        scanner = _get_scanner()
        results = scanner.scan_now(niche=niche, region=region)
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@trends_router.get("/trending/status")
async def trending_status():
    """Get scanner status and cache info."""
    scanner = _get_scanner()
    return scanner.get_status()


@trends_router.post("/trending/generate")
async def trending_generate(topic: str, content_type: str = ContentType.video.value, platform: str = "tiktok", language: str = "id"):
    """Generate content from a trending topic."""
    try:
        if content_type == ContentType.carousel.value:
            assembler = get_carousel()
            result = assembler.create(topic=topic, platform=platform, language=language)
        else:
            from services.autopilot.tiktok_publisher import AutoPilotOrchestrator
            orch = AutoPilotOrchestrator()
            result = orch.faceless_engine.generate_video(topic=topic, platform=platform, language=language)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))