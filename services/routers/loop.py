"""Looping routes — create looping videos from audio."""
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from services.api import get_looping

loop_router = APIRouter(prefix="", tags=["loop"])


class LoopRequest(BaseModel):
    audio_path: str
    duration_minutes: int = Field(default=60, ge=1, le=360)
    visual_type: str = "gradient"
    resolution: str = "1920x1080"
    colors: Optional[str] = None
    image_path: Optional[str] = None


@loop_router.post("/loop/create")
async def loop_create(req: LoopRequest):
    """Create a looping video from audio."""
    try:
        engine = get_looping()

        # Parse resolution string to width/height
        res = req.resolution.split("x")
        width = int(res[0]) if len(res) == 2 else 1920
        height = int(res[1]) if len(res) == 2 else 1080

        # Generate output path
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


@loop_router.get("/loop/video/{filename}")
async def loop_video(filename: str):
    """Serve generated looping video."""
    full_path = Path("/tmp/looping_output") / filename
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")
    return FileResponse(str(full_path), media_type="video/mp4")