"""Remotion routes — render product ad videos using Remotion."""
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

remotion_router = APIRouter(prefix="", tags=["remotion"])


class RenderAdRequest(BaseModel):
    image_url: str = ""
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


@remotion_router.post("/content/render-ad")
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