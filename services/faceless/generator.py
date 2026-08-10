"""FacelessContentGenerator — ContentGenerator wrapper for the Faceless video engine.

Implements the full :class:`services.generator.ContentGenerator` contract with a
thread-safe in-memory project store.  Projects follow:

    created -> running -> completed | failed | cancelled

Generation runs on a background executor thread (non-blocking, like the ebook
generator); the engine is acquired lazily from ``services.di.get_faceless()`` so
constructing this generator stays cheap (api.py builds it at import time).

The Faceless engine itself stays untouched for direct callers: the thin
``/faceless/generate|product|batch`` router passes no hooks and behaves exactly
as before.
"""

from __future__ import annotations

import asyncio
import threading
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from pydantic import ValidationError

from services.api_models import FacelessGenerateRequest
from services.generator import ContentGenerator, GeneratorInfo


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class FacelessContentGenerator(ContentGenerator):
    """In-memory project lifecycle around ``FacelessEngine.generate_video``."""

    def __init__(self, *, max_projects: int = 100) -> None:
        self._lock = threading.Lock()
        self._projects: dict[str, dict] = {}
        self._cancel_flags: dict[str, threading.Event] = {}
        self._next_id = 1
        self._max_projects = max_projects

    # ── ContentGenerator ─────────────────────────────────────────

    @property
    def info(self) -> GeneratorInfo:
        return GeneratorInfo(
            name="faceless",
            description="Faceless video generation: topic → script → stock → TTS → compose",
            version="1.0",
            capabilities=["faceless-video"],
        )

    async def create(self, params: dict, *, owner: str | None = None) -> dict:
        try:
            FacelessGenerateRequest.model_validate(params)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=exc.errors()) from exc

        project_id = self._new_id()
        now = _now_iso()
        project = {
            "project_id": project_id,
            "status": "created",
            "progress": 0,
            "message": "Project created — call generate to start",
            "params": dict(params),
            "result": None,
            "owner": owner,
            "created_at": now,
            "updated_at": now,
        }
        with self._lock:
            self._projects[project_id] = project
        return {"project_id": project_id, "project": project}

    async def status(self, project_id: str, *, owner: str | None = None) -> dict:
        project = self._snapshot(project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return {
            "project_id": project["project_id"],
            "status": project["status"],
            "progress": project["progress"],
            "message": project["message"],
        }

    async def get(self, project_id: str, *, owner: str | None = None) -> dict:
        project = self._snapshot(project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        return project

    async def list(self, *, owner: str | None = None) -> list[dict]:
        with self._lock:
            items = [dict(p) for p in self._projects.values()]
        if owner is not None:
            items = [p for p in items if p.get("owner") == owner]
        items.sort(key=lambda p: p.get("created_at", ""), reverse=True)
        return items

    async def delete(self, project_id: str, *, owner: str | None = None) -> bool:
        with self._lock:
            if project_id not in self._projects:
                return False
            self._cancel_flags.pop(project_id, None)
            del self._projects[project_id]
        return True

    async def health(self) -> dict:
        return {"status": "ok", "version": "1.0"}

    async def generate(self, project_id: str, *, owner: str | None = None) -> dict:
        project = self._snapshot(project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        if project["status"] == "running":
            return {"project_id": project_id, "message": "Generation already running"}

        cancel_event = threading.Event()
        with self._lock:
            self._cancel_flags[project_id] = cancel_event
        self._set(project_id, status="running", progress=0, message="Starting...")

        params = project["params"]

        def _run() -> None:
            try:
                from services.di import get_faceless

                engine = get_faceless()
                result = engine.generate_video(
                    **params,
                    progress_cb=lambda pct, msg: self._set(
                        project_id, status="running", progress=pct, message=msg
                    ),
                    cancel_check=cancel_event.is_set,
                )
            except Exception as exc:  # defensive — engine must not kill the thread
                result = {"success": False, "error": f"Generation failed: {exc}"}
            if result.get("cancelled"):
                self._set(project_id, status="cancelled", progress=0, message="Cancelled")
            elif result.get("success"):
                self._set(
                    project_id, status="completed", progress=100,
                    message="Complete", result=result,
                )
            else:
                self._set(
                    project_id, status="failed",
                    message=result.get("error", "Generation failed"),
                    result=result,
                )

        asyncio.get_running_loop().run_in_executor(None, _run)
        return {"project_id": project_id, "message": "Generation started"}

    async def update(self, project_id: str, params: dict, *, owner: str | None = None) -> dict:
        project = self._snapshot(project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        if project["status"] == "running":
            raise HTTPException(status_code=409, detail="Cannot update a running project")
        with self._lock:
            self._projects[project_id]["params"] = {**project["params"], **params}
            self._projects[project_id]["updated_at"] = _now_iso()
        return self._snapshot(project_id)

    async def cancel(self, project_id: str, *, owner: str | None = None) -> dict:
        project = self._snapshot(project_id)
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        with self._lock:
            cancel_event = self._cancel_flags.get(project_id)
        if cancel_event is not None:
            cancel_event.set()
        self._set(project_id, status="cancelled", progress=0, message="Cancelled")
        return {"project_id": project_id, "status": "cancelled"}

    # ── store helpers ────────────────────────────────────────────

    def _new_id(self) -> str:
        with self._lock:
            pid = f"faceless_{self._next_id}"
            self._next_id += 1
            return pid

    def _snapshot(self, project_id: str) -> dict | None:
        with self._lock:
            project = self._projects.get(project_id)
            return dict(project) if project is not None else None

    def _set(self, project_id: str, **fields: Any) -> None:
        with self._lock:
            if project_id in self._projects:
                self._projects[project_id].update(fields)
                self._projects[project_id]["updated_at"] = _now_iso()
