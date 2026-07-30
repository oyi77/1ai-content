"""Pinterest routes — search pins, post to Facebook."""
import asyncio
import json
from pathlib import Path
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.di import get_cloak, get_pinterest

pinterest_router = APIRouter(prefix="", tags=["pinterest"])


class PinterestSearchRequest(BaseModel):
    query: str
    limit: int = Field(default=20, ge=1, le=50)


class PinterestPostRequest(BaseModel):
    image_url: str
    caption: str
    profile_name: str
    link: Optional[str] = None


class PublishToFacebookRequest(BaseModel):
    image_url: str
    page_id: str
    page_token: str = ""
    message: str = ""
    affiliate_link: str = ""


@pinterest_router.post("/pinterest/search")
async def pinterest_search(req: PinterestSearchRequest):
    """Search Pinterest by keyword and return pin results."""
    try:
        scraper = get_pinterest()
        results = await asyncio.to_thread(
            scraper.search_pins,
            query=req.query,
            limit=req.limit,
        )
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@pinterest_router.post("/pinterest/post")
async def pinterest_post(req: PinterestPostRequest):
    """Download a Pinterest image and post it to a Facebook page via CloakBrowser."""
    try:
        scraper = get_pinterest()
        cloak = get_cloak()

        # 1. Download image
        local_path = await asyncio.to_thread(
            scraper.download_image,
            image_url=req.image_url,
        )
        if not local_path:
            raise HTTPException(status_code=400, detail="Failed to download image")

        # 2. Post to Facebook
        result = await asyncio.to_thread(
            cloak.post,
            profile_name=req.profile_name,
            media_path=local_path,
            caption=req.caption,
            platform="facebook",
            link=req.link,
        )

        return {"download_path": local_path, "post_result": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


FB_PAGES_CACHE: dict[str, str] | None = None


def _get_fb_page_token(page_id: str) -> str:
    """Look up page access token from 1ai-social fb_pages.json."""
    global FB_PAGES_CACHE
    if FB_PAGES_CACHE is None:
        fb_pages_path = Path.home() / "projects" / "1ai-social" / "data" / "fb_pages.json"
        try:
            with open(fb_pages_path) as f:
                pages = json.load(f)
            FB_PAGES_CACHE = {p["id"]: p["access_token"] for p in pages if "access_token" in p}
        except (FileNotFoundError, json.JSONDecodeError, KeyError) as e:
            print(f"[warn] Could not load fb_pages.json: {e}")
            FB_PAGES_CACHE = {}
    token = FB_PAGES_CACHE.get(page_id)
    if not token:
        raise HTTPException(status_code=400, detail=f"No access token found for page {page_id}")
    return token


@pinterest_router.post("/publish-to-facebook")
async def publish_to_facebook(req: PublishToFacebookRequest):
    """Download image and publish to Facebook via 1ai-social distribution API.

    Acts as CORS proxy: admin page on content.aitradepulse.com cannot call
    1ai-social directly, so this endpoint forwards the request.
    Looks up page access token from fb_pages.json when not provided in request.
    """
    try:
        # Resolve page token from local config if not supplied
        token = req.page_token if req.page_token else _get_fb_page_token(req.page_id)

        scraper = get_pinterest()

        # Save directly to 1ai-social's allowed publish root
        social_data_path = Path.home() / "projects" / "1ai-social" / "data" / "pinterest_cache"

        local_path = await asyncio.to_thread(
            scraper.download_image,
            image_url=req.image_url,
            dest_dir=str(social_data_path),
        )
        if not local_path:
            raise HTTPException(status_code=400, detail="Failed to download image")

        # Forward to 1ai-social distribution API (port 8200)
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                "http://localhost:8200/v1/distribution/publish",
                json={
                    "page_id": req.page_id,
                    "page_token": token,
                    "file_path": local_path,
                    "message": req.message,
                    "affiliate_link": req.affiliate_link,
                },
                timeout=60.0,
            )
            if resp.status_code != 200:
                detail = resp.text
                try:
                    detail = resp.json()
                except Exception:
                    pass
                raise HTTPException(status_code=resp.status_code, detail=detail)
            return resp.json()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))