"""CloakBrowser social posting endpoints."""
import asyncio
from typing import Optional

from fastapi import APIRouter, HTTPException

from services.api_models import CloakPostRequest, CloakBatchPostRequest
from services.di import get_cloak

router = APIRouter(prefix="/cloak", tags=["CloakBrowser"])


@router.get("/profiles")
async def cloak_profiles(platform: Optional[str] = None):
    """List CloakBrowser profiles."""
    try:
        adapter = get_cloak()
        profiles = adapter.list_profiles(platform=platform)
        return {"profiles": profiles}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/post")
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


@router.post("/batch-post")
async def cloak_batch_post(req: CloakBatchPostRequest):
    """Post to multiple profiles at once."""
    try:
        adapter = get_cloak()
        posts = [
            {
                "profile_name": pid,
                "media_path": req.media_path,
                "caption": req.caption,
                "platform": req.platform,
                "link": req.link,
            }
            for pid in req.profile_ids
        ]
        result = await asyncio.to_thread(adapter.batch_post, posts=posts)
        return {"results": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/profile/{profile_id}/status")
async def cloak_profile_status(profile_id: str):
    """Get profile status."""
    try:
        adapter = get_cloak()
        result = adapter.get_profile_status(profile_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
