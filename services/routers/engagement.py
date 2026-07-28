"""Engagement routes — auto-reply to comments."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.api import get_engagement

engagement_router = APIRouter(prefix="", tags=["engagement"])


class ReplyRequest(BaseModel):
    profile_id: str
    comment_text: str
    platform: str = "tiktok"
    post_context: str = ""


@engagement_router.post("/engagement/reply")
async def engagement_reply(req: ReplyRequest):
    """Generate and post a reply to a comment."""
    try:
        engine = get_engagement()
        result = engine.reply_to_comment(
            profile_id=req.profile_id, comment_text=req.comment_text,
            platform=req.platform, post_context=req.post_context,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@engagement_router.get("/engagement/stats")
async def engagement_stats(profile_id: str = ""):
    """Get engagement reply statistics."""
    try:
        engine = get_engagement()
        return engine.get_reply_stats(profile_id or None)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))