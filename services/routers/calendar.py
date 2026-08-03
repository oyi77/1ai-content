"""Content calendar endpoints."""
from typing import Optional

from fastapi import APIRouter, HTTPException

from services.api_models import CalendarEntryRequest
from services.di import get_calendar

router = APIRouter(prefix="/calendar", tags=["Calendar"])


@router.post("/schedule")
async def calendar_schedule(req: CalendarEntryRequest):
    """Schedule a content piece."""
    try:
        cal = get_calendar()
        entry = await cal.schedule_content(
            user_id=req.user_id,
            topic=req.topic,
            scheduled_at=req.scheduled_at,
            platform=req.platform,
            content_type=req.content_type,
            caption=req.caption,
            hashtags=req.hashtags,
            niche=req.niche,
            style=req.style,
            language=req.language,
            auto_post=req.auto_post,
        )
        return entry
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/list/{user_id}")
async def calendar_list(user_id: int, status: Optional[str] = None, platform: Optional[str] = None):
    """List calendar entries for a user."""
    try:
        cal = get_calendar()
        entries = await cal.get_entries(user_id, status=status, platform=platform)
        return {"entries": entries, "count": len(entries)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/delete/{entry_id}")
async def calendar_delete(entry_id: str, user_id: int = 0):
    """Delete a calendar entry."""
    try:
        try:
            eid = int(entry_id)
        except ValueError:
            raise HTTPException(status_code=422, detail=f"Invalid entry_id: {entry_id}")
        cal = get_calendar()
        result = await cal.delete_entry(user_id, eid)
        return {"success": result}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
