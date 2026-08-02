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
import secrets
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse




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
from services.routers.download import download_router
from services.routers.video import video_router
from services.routers.tikwm import tikwm_router
from services.routers.upload import upload_router
from services.routers.pinterest import pinterest_router
from services.routers.research import research_router
from services.routers.trends import trends_router
from services.routers.engagement import engagement_router
from services.routers.analyze import router as analyze_router
from services.routers.cloak import router as cloak_router
from services.routers.autopilot import router as autopilot_router
from services.routers.calendar import router as calendar_router
from services.routers.ab_testing import router as ab_testing_router
from services.routers.audio import router as audio_router
from services.routers.text import router as text_router
from services.routers.image import router as image_router
from services.ebook.generator import EbookContentGenerator


registry.add_router(health_router)
registry.add_router(download_router)
registry.add_router(video_router)
registry.add_router(tikwm_router)
registry.add_router(upload_router)
registry.add_router(pinterest_router)
registry.add_router(research_router)
registry.add_router(trends_router)
registry.add_router(engagement_router)
registry.add_router(analyze_router)
registry.add_router(cloak_router)
registry.add_router(autopilot_router)
registry.add_router(calendar_router)
registry.add_router(ab_testing_router)
registry.add_router(audio_router)
registry.add_router(text_router)
registry.add_router(image_router)
registry.register(EbookContentGenerator(), prefix="/text/ebook")


# ══════════════════════════════════════════════════════════════
# EBOOK API KEY ENFORCEMENT (optional) — prefix /text/ebook/*
# Aktif HANYA jika env EBOOK_API_KEY diset (default .env.example:
# "Optional API key"). Jika env tidak diset, request dibiarkan
# lewat (default = open) agar tidak memutus alur legacy. TS sudah
# selalu mengirim header X-API-Key (src/services/ebook.service.ts).
# Perbandingan memakai secrets.compare_digest (timing-safe).
# ══════════════════════════════════════════════════════════════

@app.middleware("http")
async def enforce_ebook_api_key(request: Request, call_next):
    expected = os.getenv("EBOOK_API_KEY")
    if expected and request.url.path.startswith("/text/ebook"):
        provided = request.headers.get("X-API-Key", "")
        if not provided or not secrets.compare_digest(provided, expected):
            return JSONResponse(
                status_code=401,
                content={"detail": "Unauthorized: missing or invalid X-API-Key"},
            )
    return await call_next(request)


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