"""AutoPilot automation endpoints."""
import asyncio

from fastapi import APIRouter, HTTPException

from services.api_models import AutoPilotJobRequest
from services.di import get_autopilot

router = APIRouter(prefix="/autopilot", tags=["AutoPilot"])


@router.post("/create")
async def autopilot_create(req: AutoPilotJobRequest):
    """Create an autopilot job."""
    try:
        pub = get_autopilot()
        result = pub.create_job(
            name=req.name,
            niche=req.niche,
            platforms=req.platforms,
            videos_per_day=req.videos_per_day,
            posting_times=req.posting_times,
            content_type=req.content_type,
            style=req.style,
            language=req.language,
            auto_publish=req.auto_publish,
            tiktok_profile_id=req.tiktok_profile_id,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def autopilot_status():
    """Get autopilot status."""
    try:
        pub = get_autopilot()
        return pub.get_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run")
async def autopilot_run():
    """Check and run all ready autopilot jobs."""
    try:
        pub = get_autopilot()
        # check_and_run() runs a synchronous multi-minute generation pipeline
        # (script -> stock -> ffmpeg -> SEO -> publish). Offload to a worker
        # thread so the event loop stays responsive (/health, /calendar, etc.).
        results = await asyncio.to_thread(pub.check_and_run)
        return {"jobs_run": len(results), "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
