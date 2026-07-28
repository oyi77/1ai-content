"""Carousel routes — TikTok image carousel generation and templates."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.api import get_carousel

carousel_router = APIRouter(prefix="", tags=["carousel"])


class CarouselRequest(BaseModel):
    topic: str
    num_slides: int = Field(default=7, ge=3, le=10)
    style: str = "outline"
    platform: str = "tiktok"
    language: str = "id"


@carousel_router.post("/carousel/create")
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


@carousel_router.get("/carousel/styles")
async def carousel_styles():
    """List available carousel styles."""
    from services.carousel.generator import STYLE_PRESETS
    return {"styles": {k: {"name": v["name"], "description": v["description"]} for k, v in STYLE_PRESETS.items()}}


@carousel_router.get("/carousel/templates")
async def carousel_templates(niche: str = ""):
    """List carousel templates, optionally filtered by niche."""
    from services.carousel.templates import list_templates, get_templates_by_niche, list_niches
    if niche:
        return {"templates": get_templates_by_niche(niche), "niche": niche}
    return {"templates": list_templates(), "niches": list_niches()}


@carousel_router.get("/carousel/templates/{template_id}")
async def carousel_template(template_id: str):
    """Get a specific carousel template."""
    from services.carousel.templates import get_template
    t = get_template(template_id)
    return t if t else {"error": "Template not found"}