"""
BrandContentGenerator — brand identity management as a ContentGenerator.

Wraps services.brand.settings.BrandSettings.

Endpoints (auto-generated from ContentGenerator protocol):
    GET    /brand/health
    GET    /brand/projects
    POST   /brand/projects          (create / set brand)
    GET    /brand/projects/{user_id}/status
    DELETE /brand/projects/{user_id}

Extra routes:
    POST   /brand/apply-watermark   (apply logo watermark to a video)
    POST   /brand/apply-intro       (prepend brand intro clip)
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


from fastapi import HTTPException
from pydantic import BaseModel

from services.generator import ContentGenerator, GeneratorInfo


class WatermarkRequest(BaseModel):
    video_path: str
    user_id: str
    output_path: str


class IntroRequest(BaseModel):
    video_path: str
    user_id: str
    output_path: str

# ── Lazy import helpers ──────────────────────────────────────────

_BrandSettings: type | None = None

def _get_brand_settings():
    global _BrandSettings
    if _BrandSettings is None:
        from services.brand.settings import BrandSettings
        _BrandSettings = BrandSettings
    return _BrandSettings()


# ── Generator ────────────────────────────────────────────────────

_DATA_DIR = Path("data") / "brand"
_DATA_DIR.mkdir(parents=True, exist_ok=True)


class BrandContentGenerator(ContentGenerator):
    """ContentGenerator wrapping BrandSettings for per-user brand identity."""

    def __init__(self) -> None:
        self._engine = _get_brand_settings()
        self._projects: dict[str, dict] = {}  # user_id → metadata

    @property
    def info(self) -> GeneratorInfo:
        return GeneratorInfo(
            name="brand",
            description="Brand identity management — colors, logos, watermarks, fonts",
            version="1.0",
            capabilities=["brand_crud", "watermark", "brand_intro"],
        )

    async def create(self, params: dict) -> dict:
        """Set or update brand settings for a user."""
        user_id = params.get("user_id", str(uuid.uuid4()))
        result = self._engine.set_brand(user_id, params)
        self._projects[user_id] = {
            "user_id": user_id,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "settings": result.get("settings", {}),
        }
        return {"project_id": user_id, "brand": self._projects[user_id]}

    async def get(self, project_id: str) -> dict:
        return self._engine.get_brand(project_id)

    async def list(self) -> list[dict]:
        return list(self._projects.values())

    async def status(self, project_id: str) -> dict:
        exists = project_id in self._projects
        return {
            "project_id": project_id,
            "exists": exists,
        }

    async def delete(self, project_id: str) -> bool:
        if project_id in self._projects:
            del self._projects[project_id]
            return True
        return False

    async def health(self) -> dict:
        return {
            "status": "ok",
            "version": "1.0",
        }

    # ── Extra routes ──────────────────────────────────────────────

    def extra_routes(self) -> list[tuple[str, str, Any]]:
        async def apply_watermark(req: WatermarkRequest):
            try:
                path = await asyncio.to_thread(
                    self._engine.apply_watermark,
                    req.video_path, req.user_id, req.output_path,
                )
                return {"output_path": path}
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

        async def apply_intro(req: IntroRequest):
            try:
                path = await asyncio.to_thread(
                    self._engine.apply_brand_intro,
                    req.video_path, req.user_id, req.output_path,
                )
                return {"output_path": path}
            except Exception as e:
                raise HTTPException(status_code=500, detail=str(e))

        return [
            ("POST", "/apply-watermark", apply_watermark),
            ("POST", "/apply-intro", apply_intro),
        ]
