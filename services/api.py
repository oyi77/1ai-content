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
from fastapi import FastAPI




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
from services.routers.tts import router as tts_router
from services.routers.analyze import router as analyze_router
from services.routers.cloak import router as cloak_router
from services.routers.autopilot import router as autopilot_router
from services.routers.calendar import router as calendar_router
from services.routers.ab_testing import router as ab_testing_router
from services.routers.captions import router as captions_router
from services.routers.repurpose import router as repurpose_router
from services.routers.remeta import router as remeta_router
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
registry.add_router(tts_router)
registry.add_router(analyze_router)
registry.add_router(cloak_router)
registry.add_router(autopilot_router)
registry.add_router(calendar_router)
registry.add_router(ab_testing_router)
registry.add_router(captions_router)
registry.add_router(repurpose_router)
registry.add_router(remeta_router)
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