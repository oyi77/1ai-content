"""Upload routes — upload video and audio files for processing."""
import re
from pathlib import Path
from datetime import datetime
from fastapi import APIRouter, HTTPException, UploadFile, File

upload_router = APIRouter(prefix="", tags=["upload"])

MAX_UPLOAD_SIZE = 50 * 1024 * 1024
VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}
AUDIO_EXTS = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus"}


def _safe_upload_name(raw: str | None) -> str:
    """Sanitize a client-supplied filename to a single safe basename.

    Prevents path traversal via `file.filename` (e.g. ``../../etc/...``)
    and strips anything outside ``[A-Za-z0-9._-]``.
    """
    base = Path(raw or "upload").name
    return re.sub(r"[^\w.\-]", "_", base)


async def _save_upload(file: UploadFile, allowed_exts: set[str]) -> dict:
    raw = file.filename or ""
    if not raw.strip():
        raise HTTPException(status_code=400, detail="Filename required")
    ext = Path(raw).suffix.lower()
    if ext not in allowed_exts:
        raise HTTPException(status_code=415, detail="Unsupported file type")
    upload_dir = Path("/tmp/content_uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{timestamp}_{_safe_upload_name(raw)}"
    filepath = upload_dir / filename
    if not filepath.resolve().is_relative_to(upload_dir.resolve()):
        raise HTTPException(status_code=400, detail="Invalid path")
    size = 0
    try:
        with open(filepath, "wb") as fh:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_UPLOAD_SIZE:
                    raise HTTPException(status_code=413, detail="File too large (max 50MB)")
                fh.write(chunk)
    except HTTPException:
        filepath.unlink(missing_ok=True)
        raise
    return {"success": True, "path": str(filepath), "filename": filename, "size": size}


@upload_router.post("/upload/video")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file for remeta/repurpose processing."""
    return await _save_upload(file, VIDEO_EXTS)


@upload_router.post("/upload/audio")
async def upload_audio(file: UploadFile = File(...)):
    """Upload an audio file for processing."""
    return await _save_upload(file, AUDIO_EXTS)
