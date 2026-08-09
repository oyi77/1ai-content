"""EbookContentGenerator — wraps ebook generation pipeline as a ContentGenerator."""

from __future__ import annotations

import base64
import json
import asyncio
from pathlib import Path

from services.generator import ContentGenerator, GeneratorInfo
from services.ebook.db.repository import ProjectRepository
from services.ebook.models.validation import ProjectInput
from services.ebook.logger import get_logger

logger = get_logger(__name__)

# Default paths relative to the 1ai-content project root
_DEFAULT_DATA_DIR = Path("data") / "ebook"
_DEFAULT_DB_PATH = _DEFAULT_DATA_DIR / "projects.db"
_DEFAULT_PROJECTS_DIR = _DEFAULT_DATA_DIR / "projects"


class EbookContentGenerator(ContentGenerator):
    """ContentGenerator implementation for AI ebook generation.

    Wraps the existing PipelineOrchestrator + ProjectRepository in a uniform
    async interface.  Generation runs in a background thread with in-process
    progress tracking (same pattern as the original server).
    """

    def __init__(
        self,
        *,
        db_path: str | Path = _DEFAULT_DB_PATH,
        projects_dir: str | Path = _DEFAULT_PROJECTS_DIR,
    ) -> None:
        self._db_path = Path(db_path)
        self._projects_dir = Path(projects_dir)
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        self._projects_dir.mkdir(parents=True, exist_ok=True)
        self._repo = ProjectRepository(self._db_path)
        # Module-level progress store keyed by project_id
        self._progress: dict[int, dict] = {}

    @property
    def projects_dir(self) -> Path:
        """The projects directory path for this generator."""
        return self._projects_dir

    @property
    def repo(self) -> object:
        """Access the underlying ProjectRepository."""
        return self._repo

    # ── ContentGenerator ────────────────────────────────────────

    @property
    def info(self) -> GeneratorInfo:
        return GeneratorInfo(
            name="ebook",
            description="AI ebook generation — strategy, outline, manuscript, chapters, QA, cover, export",
            version="1.0",
            capabilities=[
                "ebook",
                "comics",
                "multi-language",
                "docx",
                "pdf",
                "epub",
                "export",
            ],
        )

    async def create(self, params: dict, *, owner: str | None = None) -> dict:
        from pydantic import ValidationError
        from fastapi import HTTPException
        try:
            validated = ProjectInput(**params)
        except ValidationError as e:
            raise HTTPException(status_code=422, detail=e.errors())
        # `title` is optional in the API contract (ProjectInput.title=None).
        # Derive one from the idea when omitted — same rule as ProjectIntake._generate_title —
        # because ebook_projects.title is NOT NULL (services/ebook/db/models.py:52).
        title = validated.title
        if not title:
            words = validated.idea.split()
            title = " ".join(words[:5]) + "..." if len(words) > 5 else validated.idea
        project_id = self._repo.create_project(
            title=title,
            idea=validated.idea,
            product_mode=validated.product_mode,
            target_language=validated.target_language,
            chapter_count=validated.chapter_count,
            owner=owner,
        )
        project = self._repo.get_project(project_id, owner=owner)
        return {"project_id": project_id, "project": project}

    async def get(self, project_id: str, *, owner: str | None = None) -> dict:
        try:
            pid = int(project_id)
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Invalid project_id: {project_id}")
        project = self._repo.get_project(pid, owner=owner)
        if project is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Project not found")
        return project

    async def list(self, *, owner: str | None = None) -> list[dict]:
        return self._repo.list_projects(owner=owner)

    async def status(self, project_id: str, *, owner: str | None = None) -> dict:
        try:
            pid = int(project_id)
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Invalid project_id: {project_id}")
        project = self._repo.get_project(pid, owner=owner)
        if project is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Project not found")

        progress = self._progress.get(
            pid,
            {"status": project["status"], "progress": 0, "message": ""},
        )
        return {
            "project_id": pid,
            "db_status": project["status"],
            **progress,
        }

    async def delete(self, project_id: str, *, owner: str | None = None) -> bool:
        try:
            pid = int(project_id)
        except ValueError:
            return False
        project = self._repo.get_project(pid, owner=owner)
        if project is None:
            return False
        self._repo.delete_project(pid)
        # Remove generated files if any
        import shutil
        proj_dir = self._projects_dir / str(pid)
        if proj_dir.exists():
            shutil.rmtree(proj_dir)
        self._progress.pop(pid, None)
        return True

    async def health(self) -> dict:
        return {"status": "ok", "version": "1.0"}

    # ── Content generation lifecycle ────────────────────────────

    async def generate(self, project_id: str, *, owner: str | None = None) -> dict:
        """Start generation in a background thread.  Non-blocking."""
        from services.ebook.pipeline.orchestrator import PipelineOrchestrator
        from services.ebook.pipeline.error_classifier import ErrorClassifier

        try:
            pid = int(project_id)
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Invalid project_id: {project_id}")
        project = self._repo.get_project(pid, owner=owner)
        if project is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Project not found")

        # Prevent double-starts
        current = self._progress.get(pid, {})
        if current.get("status") == "running":
            return {"project_id": pid, "message": "Generation already running"}

        self._progress[pid] = {
            "status": "running",
            "progress": 0,
            "message": "Starting...",
        }

        def _run():
            try:
                orchestrator = PipelineOrchestrator(
                    db_path=str(self._db_path),
                    projects_dir=str(self._projects_dir),
                )

                def on_progress(pct: int, msg: str):
                    self._progress[pid] = {
                        "status": "running",
                        "progress": pct,
                        "message": msg,
                    }

                orchestrator.run_full_pipeline(pid, on_progress=on_progress)
                self._progress[pid] = {
                    "status": "completed",
                    "progress": 100,
                    "message": "Complete!",
                }
            except Exception as exc:
                logger.error(
                    "Pipeline generation failed",
                    error=str(exc),
                    error_type=type(exc).__name__,
                )
                self._progress[pid] = {
                    "status": "failed",
                    "progress": 0,
                    "message": ErrorClassifier.classify(exc),
                }

        # Run pipeline in thread pool so generate() returns immediately
        asyncio.get_running_loop().run_in_executor(None, _run)
        return {"project_id": pid, "message": "Generation started"}

    async def update(self, project_id: str, params: dict, *, owner: str | None = None) -> dict:
        """Update project parameters (title, config, etc.)."""
        try:
            pid = int(project_id)
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Invalid project_id: {project_id}")
        project = self._repo.get_project(pid, owner=owner)
        if project is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Project not found")
        self._repo.update_project(pid, **params)
        project = self._repo.get_project(pid, owner=owner)
        return {"project_id": pid, "project": project}

    async def cancel(self, project_id: str, *, owner: str | None = None) -> dict:
        """Cancel an in-progress generation."""
        try:
            pid = int(project_id)
        except ValueError:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail=f"Invalid project_id: {project_id}")
        project = self._repo.get_project(pid, owner=owner)
        if project is None:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Project not found")
        self._progress[pid] = {
            "status": "cancelled",
            "progress": 0,
            "message": "Cancelled",
        }
        self._repo.update_project_status(pid, "cancelled")
        return {"project_id": pid, "status": "cancelled"}

    # ── Export / download (ebook-specific, beyond base interface) ────

    def export_data(self, project_id: int, owner: str | None = None) -> dict:
        """Return export data for a project (strategy, marketing kit, cover image, etc.)."""
        project = self._repo.get_project(project_id, owner=owner)
        if project is None:
            return {"error": "Project not found"}

        project_dir = self._projects_dir / str(project_id)

        strategy: dict = {}
        strategy_file = project_dir / "strategy.json"
        if strategy_file.exists():
            with open(strategy_file) as f:
                strategy = json.load(f)

        marketing_kit: dict = {}
        mk_file = project_dir / "marketing_kit.json"
        if mk_file.exists():
            with open(mk_file) as f:
                marketing_kit = json.load(f)

        cover_b64 = ""
        cover_file = project_dir / "cover" / "cover.png"
        if cover_file.exists():
            with open(cover_file, "rb") as f:
                cover_b64 = base64.b64encode(f.read()).decode("utf-8")

        word_count = 0
        manuscript_json = project_dir / "manuscript.json"
        if manuscript_json.exists():
            with open(manuscript_json) as f:
                mdata = json.load(f)
            word_count = sum(ch.get("word_count", 0) for ch in mdata.get("chapters", []))

        description = marketing_kit.get("book_description") or strategy.get("goal") or ""

        return {
            "project_id": project_id,
            "title": project.get("title", ""),
            "language": project.get("target_language", ""),
            "description": description,
            "word_count": word_count,
            "has_cover": bool(cover_b64),
            "cover_b64": cover_b64,
            "marketing_kit": marketing_kit,
        }

    def download_path(self, project_id: int, fmt: str, owner: str | None = None) -> Path | None:
        """Return the path to the exported file for the given format, or None."""
        if self._repo.get_project(project_id, owner=owner) is None:
            return None
        project_dir = self._projects_dir / str(project_id)
        file_path = project_dir / "exports" / f"ebook.{fmt}"
        return file_path if file_path.exists() else None

    # ── Extra routes (export, download) ──────────────────────────

    def extra_routes(self) -> list[tuple[str, str, Any]]:
        from fastapi.responses import FileResponse

        _self = self  # capture for closure

        async def _export(project_id: str, owner: str | None = None) -> dict:
            from fastapi import HTTPException
            try:
                pid = int(project_id)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid project_id: {project_id}")
            result = _self.export_data(pid, owner=owner)
            if "error" in result:
                raise HTTPException(status_code=404, detail=result["error"])
            return result

        async def _download(project_id: str, fmt: str, owner: str | None = None):
            if fmt not in ("docx", "pdf", "epub"):
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail="Unsupported format. Use docx, pdf, or epub.")
            from fastapi import HTTPException
            try:
                pid = int(project_id)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"Invalid project_id: {project_id}")
            file_path = _self.download_path(pid, fmt, owner=owner)
            if file_path is None:
                from fastapi import HTTPException
                raise HTTPException(status_code=404, detail=f"File {fmt} not found for project {project_id}")
            media_types = {
                "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                "pdf": "application/pdf",
                "epub": "application/epub+zip",
            }
            return FileResponse(
                path=str(file_path),
                media_type=media_types[fmt],
                filename=f"ebook-{project_id}.{fmt}",
            )

        return [
            ("GET", "/projects/{project_id}/export", _export),
            ("GET", "/projects/{project_id}/download/{fmt}", _download),
        ]
