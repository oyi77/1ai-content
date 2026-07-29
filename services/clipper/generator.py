"""
ClipperContentGenerator — video clipping as a ContentGenerator.

Wraps services.clipper.engine.ClipperEngine.

Endpoints (auto-generated from ContentGenerator protocol):
    GET    /clipper/health
    GET    /clipper/projects
    POST   /clipper/projects          (start clip job from a URL/path)
    GET    /clipper/projects/{id}
    GET    /clipper/projects/{id}/status
    DELETE /clipper/projects/{id}

Extra routes:
    POST   /clipper/detect            (run highlight detection on a video URL)
"""

from __future__ import annotations

import asyncio
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import HTTPException
from pydantic import BaseModel

from services.generator import ContentGenerator, GeneratorInfo


class DetectRequest(BaseModel):
    source: str
    num_clips: int = 5
    clip_duration: int = 60

# ── Lazy import helpers ──────────────────────────────────────────

_ClipperEngine: type | None = None

def _get_engine():
    global _ClipperEngine
    if _ClipperEngine is None:
        from services.clipper.engine import ClipperEngine
        _ClipperEngine = ClipperEngine
    return _ClipperEngine()


# ── Generator ────────────────────────────────────────────────────

_DATA_DIR = Path("data") / "clipper"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_PROJECT_STORE: dict[str, dict] = {}
_PROJECT_LOCK = threading.Lock()
_PROJECT_THREADS: dict[str, threading.Thread] = {}


class ClipperContentGenerator(ContentGenerator):
    """ContentGenerator wrapping ClipperEngine for long-form video → clips."""

    @property
    def info(self) -> GeneratorInfo:
        return GeneratorInfo(
            name="clipper",
            description="Video clipping — long-form to viral short-form clips",
            version="1.0",
            capabilities=["clip_video", "reframe", "highlight_detection"],
        )

    async def create(self, params: dict) -> dict:
        """Start a clipping job in the background.

        Required params: source (URL or local path).
        Optional: num_clips, clip_duration, platform, reframe_vertical, add_subtitles.
        """
        project_id = str(uuid.uuid4())
        meta: dict = {
            "project_id": project_id,
            "params": params,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "result": None,
            "error": None,
        }
        with _PROJECT_LOCK:
            _PROJECT_STORE[project_id] = meta

        thread = threading.Thread(
            target=self._run_clip,
            args=(project_id, params),
            daemon=True,
        )
        _PROJECT_THREADS[project_id] = thread
        thread.start()

        return {"project_id": project_id, "status": "pending"}

    async def get(self, project_id: str) -> dict:
        with _PROJECT_LOCK:
            meta = _PROJECT_STORE.get(project_id)
        if meta is None:
            return {"success": False, "error": "Project not found"}
        return meta

    async def list(self) -> list[dict]:
        with _PROJECT_LOCK:
            return list(_PROJECT_STORE.values())

    async def status(self, project_id: str) -> dict:
        with _PROJECT_LOCK:
            meta = _PROJECT_STORE.get(project_id)
        if meta is None:
            return {"success": False, "error": "Project not found"}
        return {
            "project_id": project_id,
            "status": meta["status"],
            "has_result": meta["result"] is not None,
            "error": meta["error"],
        }

    async def delete(self, project_id: str) -> bool:
        with _PROJECT_LOCK:
            if project_id not in _PROJECT_STORE:
                return False
            del _PROJECT_STORE[project_id]
        _PROJECT_THREADS.pop(project_id, None)
        return True

    async def health(self) -> dict:
        with _PROJECT_LOCK:
            count = len(_PROJECT_STORE)
        return {
            "status": "ok",
            "projects_count": count,
        }

    # ── Background worker ─────────────────────────────────────────

    def _run_clip(self, project_id: str, params: dict) -> None:
        try:
            engine = _get_engine()
            result = engine.clip_video(
                source=params.get("source", ""),
                num_clips=int(params.get("num_clips", 5)),
                clip_duration=int(params.get("clip_duration", 60)),
                platform=params.get("platform", "tiktok"),
                language=params.get("language"),
                reframe_vertical=bool(params.get("reframe_vertical", True)),
                add_subtitles=bool(params.get("add_subtitles", True)),
            )
            with _PROJECT_LOCK:
                if project_id in _PROJECT_STORE:
                    _PROJECT_STORE[project_id]["status"] = "completed"
                    _PROJECT_STORE[project_id]["result"] = result
        except Exception as e:
            with _PROJECT_LOCK:
                if project_id in _PROJECT_STORE:
                    _PROJECT_STORE[project_id]["status"] = "error"
                    _PROJECT_STORE[project_id]["error"] = str(e)
        finally:
            _PROJECT_THREADS.pop(project_id, None)

    # ── Extra routes ──────────────────────────────────────────────

    def extra_routes(self) -> list[tuple[str, str, Any]]:
        async def detect_highlights(req: DetectRequest):
            """Run highlight detection on a video URL (synchronous)."""
            try:
                engine = _get_engine()
                result = await asyncio.to_thread(
                    engine.clip_video,
                    source=req.source,
                    num_clips=req.num_clips,
                    clip_duration=req.clip_duration,
                    add_subtitles=False,
                    add_thumbnails=False,
                )
                return result
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

        return [
            ("POST", "/detect", detect_highlights),
        ]
