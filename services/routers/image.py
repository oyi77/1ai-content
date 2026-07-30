"""Image content type router — comics, carousels, storyboards.

Mapped from legacy providers:
  - /image/comic*     ← /comic/*
  - /image/carousel*  ← /carousel/*
  - /image/storyboard ← /storyboard/*
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from starlette.responses import StreamingResponse
from pydantic import BaseModel, Field

from services.di import get_carousel, get_storyboard

router = APIRouter(prefix="", tags=["image"])


# ── Request models ──────────────────────────────────────────────

class ComicGenerateRequest(BaseModel):
    prompt: str = Field(..., description="Story concept / premise")
    format: str = Field(default="comic", description="comic / manga / manhwa")
    language: str = Field(default="en", description="Language code")
    pages_per_episode: int = Field(default=5, ge=1, le=30, description="Pages per episode")
    num_episodes: int = Field(default=1, ge=1, le=10, description="Number of episodes")
    generate_images: bool = Field(default=False, description="Render panel images (slow)")


class CarouselGenerateRequest(BaseModel):
    topic: str
    num_slides: int = Field(default=7, ge=3, le=10)
    style: str = "outline"
    platform: str = "tiktok"
    language: str = "id"


class StoryboardGenerateRequest(BaseModel):
    prompt: str
    style: str = "cinematic"
    num_scenes: int = Field(default=4, ge=2, le=6)
    aspect_ratio: str = "16:9"


# ── Comic ───────────────────────────────────────────────────────

@router.post("/image/comic")
async def image_comic(req: ComicGenerateRequest):
    """Generate a comic/manga/manhwa — SSE streamed."""
    async def _generate():
        try:
            from services.comic_gen.comic_types import ComicFormat
            from services.comic_gen.engine import generate_comic_pipeline
            fmt = ComicFormat(req.format)
            async for event in generate_comic_pipeline(
                prompt=req.prompt,
                fmt=fmt,
                language=req.language,
                pages_per_episode=req.pages_per_episode,
                num_episodes=req.num_episodes,
                generate_images=req.generate_images,
            ):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(_generate(), media_type="text/event-stream")


@router.get("/image/comic/page/{path:path}")
async def image_comic_page(path: str):
    """Serve a generated comic page image."""
    full_path = Path(__file__).resolve().parent.parent.parent / "data" / "comic" / path
    if not full_path.exists():
        full_path = full_path.with_suffix(".png")
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Page not found")
    return FileResponse(str(full_path), media_type="image/png")


# ── Carousel ────────────────────────────────────────────────────

@router.post("/image/carousel")
async def image_carousel(req: CarouselGenerateRequest):
    """Generate an image carousel from a topic."""
    try:
        assembler = get_carousel()
        result = assembler.generate(
            topic=req.topic,
            num_slides=req.num_slides,
            style=req.style,
            platform=req.platform,
            language=req.language,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/image/carousel/styles")
async def image_carousel_styles():
    """List available carousel styles."""
    from services.carousel.generator import STYLE_PRESETS
    return {"styles": {k: {"name": v["name"], "description": v["description"]} for k, v in STYLE_PRESETS.items()}}


@router.get("/image/carousel/templates")
async def image_carousel_templates(niche: str = ""):
    """List carousel templates, optionally filtered by niche."""
    from services.carousel.templates import list_templates, get_templates_by_niche, list_niches
    if niche:
        return {"templates": get_templates_by_niche(niche), "niche": niche}
    return {"templates": list_templates(), "niches": list_niches()}


@router.get("/image/carousel/templates/{template_id}")
async def image_carousel_template(template_id: str):
    """Get a specific carousel template."""
    from services.carousel.templates import get_template
    t = get_template(template_id)
    return t if t else {"error": "Template not found"}


# ── Storyboard ──────────────────────────────────────────────────

@router.post("/image/storyboard")
async def image_storyboard(req: StoryboardGenerateRequest):
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


@router.get("/image/storyboard/image/{path:path}")
async def image_storyboard_image(path: str):
    """Serve generated storyboard image."""
    full_path = Path("/tmp/storyboard_output") / path
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(str(full_path), media_type="image/png")
