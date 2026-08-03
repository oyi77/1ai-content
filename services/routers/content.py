"""Content-pipeline compatibility router.

Restores the pre-consolidation content API surface that the Telegram bot
(`src/services/*.ts`) and admin frontend still call after the service-layer
remediation (commit a2b6c6c) moved these handlers into domain routers:

    /carousel/create      /carousel/styles  /carousel/templates
    /carousel/templates/{template_id}
    /loop/create          /loop/video/{filename}
    /repurpose            /regenerate       /remeta
    /storyboard/create    /storyboard/image/{path:path}
    /content/render-ad

All handlers delegate to the exact engine functions already wired in
`services/di.py` / the sub-service packages, so the endpoints coexist with
any newer `/audio/*`-style surface without duplicating logic. The request
models for carousel/loop/storyboard/render-ad are defined inline here
(matching the old per-router models); repurpose/remeta reuse
`services/api_models.RepurposeRequest` / `ReMetadataRequest`.
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from services.di import get_looping, get_remetadata_engine, get_repurpose_engine, get_storyboard
from services.api_models import ReMetadataRequest, RepurposeRequest
from services.remetadata.engine import normalize_color_shift

router = APIRouter(prefix="", tags=["content-pipeline"])


# ── Carousel (legacy /carousel/*) ───────────────────────────────

class CarouselRequest(BaseModel):
    topic: str
    num_slides: int = Field(7, ge=3, le=10)
    style: str = "outline"
    platform: str = "tiktok"
    language: str = "id"


@router.post("/carousel/create")
async def carousel_create(req: CarouselRequest):
    """Create a carousel: topic → content → rendered slides (legacy /carousel/create)."""
    try:
        from services.carousel.assembler import CarouselAssembler
        assembler = CarouselAssembler()
        result = await asyncio.to_thread(
            assembler.create,
            topic=req.topic,
            num_slides=req.num_slides,
            style=req.style,
            platform=req.platform,
            language=req.language,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/carousel/styles")
async def carousel_styles():
    """List available carousel visual styles (legacy /carousel/styles)."""
    try:
        from services.carousel.generator import STYLE_PRESETS
        return {
            "styles": {
                k: {"name": v["name"], "description": v["description"]}
                for k, v in STYLE_PRESETS.items()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/carousel/templates")
async def carousel_templates(niche: Optional[str] = None):
    """List carousel templates, optionally filtered by niche (legacy /carousel/templates)."""
    from services.carousel.templates import get_templates_by_niche, list_niches, list_templates
    if niche:
        return {"templates": get_templates_by_niche(niche), "niche": niche}
    return {"templates": list_templates(), "niches": list_niches()}


@router.get("/carousel/templates/{template_id}")
async def carousel_template_detail(template_id: str):
    """Get a single carousel template (legacy /carousel/templates/{id})."""
    from services.carousel.templates import get_template
    template = get_template(template_id)
    if template is None:
        return {"error": "Template not found"}
    return template


# ── Looping video (legacy /loop/*) ──────────────────────────────

class LoopRequest(BaseModel):
    audio_path: str
    duration_minutes: int = Field(60, ge=1, le=360)
    visual_type: str = "gradient"
    resolution: str = "1920x1080"
    colors: Optional[str] = None
    image_path: Optional[str] = None


@router.post("/loop/create")
async def loop_create(req: LoopRequest):
    """Create a looping background video from audio (legacy /loop/create)."""
    try:
        engine = get_looping()
        res = req.resolution.split("x")
        width = int(res[0]) if len(res) == 2 else 1920
        height = int(res[1]) if len(res) == 2 else 1080
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


@router.get("/loop/video/{filename}")
async def loop_video(filename: str):
    """Serve a generated looping video (legacy /loop/video/{filename})."""
    base_dir = Path("/tmp/looping_output")
    full_path = (base_dir / filename).resolve()
    if not str(full_path).startswith(str(base_dir.resolve()) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(str(full_path), media_type="video/mp4")


# ── Repurpose / regenerate (legacy /repurpose, /regenerate) ─────

@router.post("/repurpose")
async def repurpose_content(req: RepurposeRequest):
    """Repurpose source videos into a new short (legacy /repurpose)."""
    try:
        engine = get_repurpose_engine()
        result = await asyncio.to_thread(
            engine.repurpose,
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


@router.post("/regenerate")
async def regenerate_content(req: RepurposeRequest):
    """Alias of /repurpose (legacy /regenerate)."""
    return await repurpose_content(req)


# ── Remetadata (legacy /remeta) ─────────────────────────────────

@router.post("/remeta")
async def remeta_content(req: ReMetadataRequest):
    """Re-metadata a video: speed/overlay/color tweak (legacy /remeta)."""
    try:
        engine = get_remetadata_engine()
        result = await asyncio.to_thread(
            engine.remetadata,
            source=req.source,
            overlay=req.overlay or None,
            watermark=req.watermark or None,
            position=req.position,
            speed=req.speed if req.speed > 0 else None,
            color_shift=normalize_color_shift(req.color_shift),
            niche=req.niche,
            platform=req.platform,
            language=req.language,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Storyboard (legacy /storyboard/*) ───────────────────────────

class StoryboardRequest(BaseModel):
    prompt: str
    style: str = "cinematic"
    num_scenes: int = Field(4, ge=2, le=6)
    aspect_ratio: str = "16:9"


@router.post("/storyboard/create")
async def storyboard_create(req: StoryboardRequest):
    """Create an AI storyboard with scene images (legacy /storyboard/create)."""
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


@router.get("/storyboard/image/{path:path}")
async def storyboard_image(path: str):
    """Serve a generated storyboard scene image (legacy /storyboard/image/{path})."""
    base_dir = Path("/tmp/storyboard_output")
    full_path = (base_dir / path).resolve()
    if not str(full_path).startswith(str(base_dir.resolve()) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(str(full_path), media_type="image/png")


# ── Remotion ad render (legacy /content/render-ad) ──────────────

class RenderAdRequest(BaseModel):
    image_url: str
    title: str
    category: str = "beauty"
    affiliate_link: str = ""
    brand_name: str = "Shopee Affiliate"
    ad_copy: Optional[str] = None
    hook_text: Optional[str] = None
    cta_text: str = "Link di Bio! 🔗"


@router.post("/content/render-ad")
async def render_ad(req: RenderAdRequest):
    """Render a product ad video with Remotion (legacy /content/render-ad)."""
    try:
        import services.remotion as remotion
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
        return {"status": "ok", "data": result}
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Remotion render error: {type(e).__name__}: {e}")
