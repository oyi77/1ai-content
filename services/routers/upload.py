"""Upload routes — upload video and audio files for processing."""
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, UploadFile, File

upload_router = APIRouter(prefix="", tags=["upload"])


@upload_router.post("/upload/video")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file for remeta/repurpose processing."""
    upload_dir = Path("/tmp/content_uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    filepath = upload_dir / filename

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    return {
        "success": True,
        "path": str(filepath),
        "filename": filename,
        "size": len(content),
    }


@upload_router.post("/upload/audio")
async def upload_audio(file: UploadFile = File(...)):
    """Upload an audio file for processing."""
    upload_dir = Path("/tmp/content_uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{file.filename}"
    filepath = upload_dir / filename

    content = await file.read()
    with open(filepath, "wb") as f:
        f.write(content)

    return {
        "success": True,
        "path": str(filepath),
        "filename": filename,
        "size": len(content),
    }