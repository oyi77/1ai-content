"""
FacelessContentGenerator — faceless video generation as a ContentGenerator.

Wraps services.faceless.engine.FacelessEngine.

Endpoints (auto-generated from ContentGenerator protocol):
    GET    /faceless/health
    GET    /faceless/projects
    POST   /faceless/projects          (start video generation)
    GET    /faceless/projects/{id}
    GET    /faceless/projects/{id}/status
    DELETE /faceless/projects/{id}

Extra routes:
    POST   /faceless/product       (generate e-commerce product video)
"""

from __future__ import annotations

import asyncio
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from pydantic import BaseModel

from services.generator import ContentGenerator, GeneratorInfo


class ProductVideoRequest(BaseModel):
    topic: str = ""
    style: str = "promotional"
    platform: str = "tiktok"
    language: str | None = None
    product_name: str = ""
    product_description: str = ""

# ── Lazy import helpers ──────────────────────────────────────────

_FacelessEngine: type | None = None

def _get_engine():
    global _FacelessEngine
    if _FacelessEngine is None:
        from services.faceless.engine import FacelessEngine
        _FacelessEngine = FacelessEngine
    return _FacelessEngine()


# ── Generator ────────────────────────────────────────────────────

_DATA_DIR = Path("data") / "faceless"
_DATA_DIR.mkdir(parents=True, exist_ok=True)
_PROJECT_STORE: dict[str, dict] = {}  # project_id → metadata
_PROJECT_LOCK = threading.Lock()
_PROJECT_THREADS: dict[str, threading.Thread] = {}  # project_id → background thread


class FacelessContentGenerator(ContentGenerator):
    """ContentGenerator wrapping FacelessEngine for faceless video production."""

    @property
    def info(self) -> GeneratorInfo:
        return GeneratorInfo(
            name="faceless",
            description="Faceless video generation — topic-based short-form content",
            version="1.0",
            capabilities=["video_generation", "product_video", "batch"],
        )

    async def create(self, params: dict) -> dict:
        """Start a faceless video generation job in the background.

        Required params: topic, style, platform, language.
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

        # Start generation in background thread
        thread = threading.Thread(
            target=self._run_generate,
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

    def _run_generate(self, project_id: str, params: dict) -> None:
        """Run generation in a background thread."""
        try:
            engine = _get_engine()
            result = engine.generate_video(
                topic=params.get("topic", "untitled"),
                style=params.get("style", "educational"),
                platform=params.get("platform", "tiktok"),
                language=params.get("language"),
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
        async def generate_product(req: ProductVideoRequest):
            try:
                engine = _get_engine()
                product_name = req.product_name or req.topic
                result = await asyncio.to_thread(
                    engine.generate_product_video,
                    product_name=product_name,
                    product_desc=req.product_description,
                    style=req.style,
                    platform=req.platform,
                    language=req.language,
                )
                return result
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

        return [
            ("POST", "/product", generate_product),
        ]
