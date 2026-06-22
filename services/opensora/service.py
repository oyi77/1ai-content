"""
Open-Sora Service — AI Video Generation API
Text-to-video and image-to-video generation.
Runs on port 8771.
"""

import os
import uuid
import asyncio
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

logger = logging.getLogger("opensora")

app = FastAPI(title="Open-Sora Service", version="1.0.0")

OUTPUT_DIR = Path("/tmp/opensora_outputs")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# Check if Open-Sora is available
OPENSORA_AVAILABLE = False
try:
    import torch
    if torch.cuda.is_available():
        OPENSORA_AVAILABLE = True
        logger.info(f"CUDA available: {torch.cuda.get_device_name(0)}")
except ImportError:
    logger.warning("PyTorch not available, running in demo mode")


class GenerateRequest(BaseModel):
    prompt: str
    duration: int = 5  # seconds
    resolution: str = "720p"  # 720p, 480p, 360p
    aspect_ratio: str = "16:9"  # 16:9, 9:16, 1:1
    num_frames: int = 0  # auto-calculate from duration
    guidance_scale: float = 7.5
    num_inference_steps: int = 100
    seed: Optional[int] = None
    image_url: Optional[str] = None  # for image-to-video


class GenerateResponse(BaseModel):
    success: bool
    job_id: str
    video_path: str = ""
    duration: float = 0
    resolution: str = ""
    seed: int = 0
    error: str = ""


class StatusResponse(BaseModel):
    available: bool
    gpu_name: str = ""
    vram_total: str = ""
    vram_free: str = ""
    mode: str = "demo"  # demo, gpu, cpu


def _get_resolution_pixels(res: str) -> tuple:
    """Map resolution string to (width, height)."""
    mapping = {
        "720p": (1280, 720),
        "480p": (854, 480),
        "360p": (640, 360),
        "1080p": (1920, 1080),
    }
    return mapping.get(res, (1280, 720))


def _adjust_for_aspect(w: int, h: int, ratio: str) -> tuple:
    """Adjust resolution for aspect ratio."""
    if ratio == "9:16":
        return (h, w)  # swap for vertical
    elif ratio == "1:1":
        s = min(w, h)
        return (s, s)
    return (w, h)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "opensora",
        "available": OPENSORA_AVAILABLE,
        "timestamp": datetime.utcnow().isoformat(),
    }


@app.get("/status", response_model=StatusResponse)
async def get_status():
    """Check service capabilities."""
    gpu_name = ""
    vram_total = ""
    vram_free = ""
    mode = "demo"

    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            vram = torch.cuda.get_device_properties(0).total_mem
            vram_total = f"{vram / 1024**3:.1f}GB"
            free = torch.cuda.mem_get_info(0)[0]
            vram_free = f"{free / 1024**3:.1f}GB"
            mode = "gpu"
    except Exception:
        pass

    return StatusResponse(
        available=OPENSORA_AVAILABLE,
        gpu_name=gpu_name,
        vram_total=vram_total,
        vram_free=vram_free,
        mode=mode,
    )


@app.post("/generate", response_model=GenerateResponse)
async def generate_video(req: GenerateRequest):
    """Generate a video from text prompt or image."""
    job_id = str(uuid.uuid4())[:12]

    if not OPENSORA_AVAILABLE:
        # Demo mode — return a placeholder
        return _generate_demo(job_id, req)

    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None, _generate_opensora, job_id, req
        )
        return result
    except Exception as e:
        logger.error(f"Generation failed: {e}")
        return GenerateResponse(
            success=False,
            job_id=job_id,
            error=str(e),
        )


@app.get("/file/{job_id}")
async def serve_file(job_id: str):
    """Serve a generated video."""
    for f in OUTPUT_DIR.glob(f"{job_id}.*"):
        if f.is_file():
            return FileResponse(
                path=str(f),
                filename=f.name,
                media_type="video/mp4",
            )
    raise HTTPException(status_code=404, detail="File not found")


def _generate_demo(job_id: str, req: GenerateRequest) -> GenerateResponse:
    """Generate a demo placeholder video using FFmpeg."""
    import subprocess

    w, h = _get_resolution_pixels(req.resolution)
    w, h = _adjust_for_aspect(w, h, req.aspect_ratio)
    output_path = OUTPUT_DIR / f"{job_id}.mp4"

    # Create a simple color gradient video with text overlay
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", f"color=c=0x1a1a2e:s={w}x{h}:d={req.duration}:r=24",
        "-f", "lavfi",
        "-i", f"color=c=0x16213e:s={w}x{h}:d={req.duration}:r=24",
        "-filter_complex",
        f"[0:v][1:v]blend=all_mode=overlay:all_opacity=0.5,"
        f"drawtext=text='Open-Sora Demo':fontsize=48:fontcolor=white:"
        f"x=(w-text_w)/2:y=(h-text_h)/2-40,"
        f"drawtext=text='{req.prompt[:60]}':fontsize=24:fontcolor=0xcccccc:"
        f"x=(w-text_w)/2:y=(h-text_h)/2+30",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-pix_fmt", "yuv420p",
        "-t", str(req.duration),
        str(output_path),
    ]

    try:
        subprocess.run(cmd, capture_output=True, timeout=30, check=True)
        return GenerateResponse(
            success=True,
            job_id=job_id,
            video_path=f"/file/{job_id}",
            duration=req.duration,
            resolution=f"{w}x{h}",
            seed=42,
        )
    except Exception as e:
        return GenerateResponse(
            success=False,
            job_id=job_id,
            error=f"Demo generation failed: {e}",
        )


def _generate_opensora(job_id: str, req: GenerateRequest) -> GenerateResponse:
    """Generate video using Open-Sora model."""
    # This is a placeholder for actual Open-Sora integration
    # When model weights are downloaded, replace with real inference
    w, h = _get_resolution_pixels(req.resolution)
    w, h = _adjust_for_aspect(w, h, req.aspect_ratio)

    output_path = OUTPUT_DIR / f"{job_id}.mp4"

    # TODO: Load Open-Sora model and run inference
    # For now, fall back to demo mode
    return _generate_demo(job_id, req)


if __name__ == "__main__":
    import uvicorn
    logging.basicConfig(level=logging.INFO)
    uvicorn.run(app, host="0.0.0.0", port=8771)
