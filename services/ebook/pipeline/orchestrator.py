import json
from pathlib import Path

from services.ebook.logger import get_logger
from services.ebook.ai_client import OmnirouteClient

logger = get_logger(__name__)
from services.ebook.pipeline.pipeline_profile import get_profile
from services.ebook.pipeline.strategy_planner import StrategyPlanner
from services.ebook.pipeline.outline_generator import OutlineGenerator
from services.ebook.pipeline.manuscript_engine import ManuscriptEngine
from services.ebook.cover.cover_generator import CoverGenerator
from services.ebook.pipeline.qa_engine import QAEngine
from services.ebook.export.export_orchestrator import ExportOrchestrator
from services.ebook.db.repository import ProjectRepository
from services.ebook.pipeline.comics.comics_orchestrator import ComicsOrchestrator


class PipelineOrchestrator:
    def __init__(
        self,
        db_path: str = "data/ebook_generator.db",
        projects_dir: str = "projects",
    ):
        self.db_path = db_path
        self.projects_dir = projects_dir
        self.ai_client = OmnirouteClient()
        self.repo = ProjectRepository(db_path)

    def _check_progress(self, project_id: int) -> dict:
        """Check what has already been generated for a project."""
        project_dir = Path(self.projects_dir) / str(project_id)
        progress = {
            "strategy": (project_dir / "strategy.json").exists(),
            "style_guide": (project_dir / "style_guide.json").exists(),
            "outline": (project_dir / "outline.json").exists(),
            "manuscript": (project_dir / "manuscript.md").exists(),
            "cover": (project_dir / "cover" / "cover.png").exists(),
            "qa": (project_dir / "qa_report.json").exists(),
            "export": (project_dir / "exports" / "ebook.docx").exists(),
            "completed_chapters": 0,
            "total_chapters": 0,
        }

        chapters_dir = project_dir / "chapters"
        if chapters_dir.exists():
            chapter_files = sorted(
                [
                    f
                    for f in chapters_dir.iterdir()
                    if f.suffix == ".md" and f.name != "manuscript.md"
                ]
            )
            progress["completed_chapters"] = len(
                [f for f in chapter_files if f.stat().st_size > 0]
            )

        outline_file = project_dir / "outline.json"
        if outline_file.exists():
            with open(outline_file) as f:
                outline = json.load(f)
                progress["total_chapters"] = len(outline.get("chapters", []))

        return progress

    def _load_existing_data(self, project_id: int) -> dict:
        """Load already-generated data for resume."""
        project_dir = Path(self.projects_dir) / str(project_id)
        data = {}

        strategy_file = project_dir / "strategy.json"
        if strategy_file.exists():
            with open(strategy_file) as f:
                data["strategy"] = json.load(f)

        style_guide_file = project_dir / "style_guide.json"
        if style_guide_file.exists():
            with open(style_guide_file) as f:
                data["style_guide"] = json.load(f)

        outline_file = project_dir / "outline.json"
        if outline_file.exists():
            with open(outline_file) as f:
                data["outline"] = json.load(f)

        return data

    def run_full_pipeline(
        self,
        project_id: int,
        on_progress=None,
        manuscript_model: str | None = None,
        quality_level: str = "fast",
    ) -> dict:
        project = self.repo.get_project_unscoped(project_id)
        if not project:
            raise ValueError(f"Project {project_id} not found")

        COMICS_MODES = {"manga", "manhwa", "manhua", "comics"}
        if project.get("product_mode") in COMICS_MODES:
            comics = ComicsOrchestrator(
                db_path=self.db_path,
                projects_dir=self.projects_dir,
                ai_client=self.ai_client,
            )
            return comics.run(project_id, on_progress=on_progress)

        project_dir = Path(self.projects_dir) / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)

        (project_dir / "chapters").mkdir(exist_ok=True)
        (project_dir / "cover").mkdir(exist_ok=True)

        self.repo.update_project_status(project_id, "generating")
        self._fire_webhook_event("ebook.generation.started", {"project_id": project_id})

        try:
            return self._run_pipeline(
                project_id,
                project,
                project_dir,
                on_progress,
                manuscript_model,
                quality_level,
            )
        except Exception as exc:
            error_type = type(exc).__name__
            context = {
                "operation": "run_full_pipeline",
                "project_id": project_id,
                "project_title": project.get("title", ""),
            }
            logger.error(
                "Pipeline execution failed",
                error=str(exc),
                error_type=error_type,
                context=context,
                severity="error",
            )
            self.repo.update_project_status(project_id, "failed")
            if on_progress:
                on_progress(0, f"Pipeline failed: {exc}")
            raise

    def _fire_webhook_event(self, event: str, payload: dict) -> None:
        """Fire event to all configured integrations — non-blocking."""
        try:
            from services.ebook.integrations.manager import IntegrationManager
            mgr = IntegrationManager(db_path=self.db_path)
            for integration in mgr.list_integrations():
                integ_id = integration.get("id") or integration.get("name", "")
                if integ_id:
                    mgr.invoke_webhook(integ_id, event, payload)
        except Exception as e:
            error_type = type(e).__name__
            context = {
                "operation": "fire_webhook_event",
                "event": event,
            }
            logger.info(
                "Webhook event skipped",
                error=str(e),
                error_type=error_type,
                context=context,
                severity="info",
            )

    def _extract_failing_chapters(self, qa_report: dict) -> list:
        """Extract (chapter_idx, failure_context) pairs from QA report issues."""
        import re

        failing = []
        for issue in qa_report.get("issues", []):
            match = re.search(r"[Cc]hapter\s+(\d+)", issue)
            if match:
                ch_idx = int(match.group(1)) - 1  # 0-indexed
                failing.append((ch_idx, issue))
        return failing

    def _run_pipeline(
        self,
        project_id: int,
        project: dict,
        project_dir: Path,
        on_progress,
        manuscript_model: str | None = None,
        quality_level: str = "fast",
    ) -> dict:
        # Check if we can resume
        progress = self._check_progress(project_id)
        existing = self._load_existing_data(project_id)

        project_brief = {
            "id": project_id,
            "idea": project["idea"],
            "product_mode": project["product_mode"],
            "target_language": project["target_language"],
        }

        profile = get_profile(project_brief.get("product_mode", "lead_magnet"))

        # Strategy
        if not progress["strategy"]:
            if on_progress:
                on_progress(5, "Generating strategy...")
            strategy_planner = StrategyPlanner(
                self.ai_client, projects_dir=self.projects_dir
            )
            result = strategy_planner.generate(project_brief, profile=profile)
            style_guide = result.pop("style_guide", None)
            strategy = result
            self.repo.set_metadata(project_id, "stage:strategy", "completed")
        else:
            strategy = existing.get("strategy", {})
            style_guide = existing.get("style_guide", None)
            if on_progress:
                on_progress(5, "Strategy already exists — skipping...")

        # Outline
        if not progress["outline"]:
            if on_progress:
                on_progress(20, "Generating outline...")
            outline_generator = OutlineGenerator(
                self.ai_client, projects_dir=self.projects_dir
            )
            outline = outline_generator.generate(
                project_brief=project_brief,
                strategy=strategy,
                chapter_count=project["chapter_count"],
                profile=profile,
            )
            self.repo.set_metadata(project_id, "stage:outline", "completed")
        else:
            outline = existing.get("outline", {})
            if on_progress:
                on_progress(20, "Outline already exists — skipping...")

        # Manuscript
        style_ctx_path = project_dir / "style_context.json"
        if (
            not progress["manuscript"]
            and self.repo.get_metadata(project_id, "stage:manuscript") != "completed"
        ):
            if on_progress:
                on_progress(35, "Writing manuscript...")
            manuscript_engine = ManuscriptEngine(
                self.ai_client, projects_dir=self.projects_dir
            )

            def manuscript_progress(progress_pct, step):
                if on_progress:
                    scaled = 35 + int(progress_pct * 0.5)
                    on_progress(scaled, step)

            from services.ebook.pipeline.style_context import StyleContext

            style_ctx = (
                StyleContext.load_or_default(
                    style_ctx_path,
                    tone=strategy.get("tone", "conversational"),
                )
                if style_ctx_path.exists()
                else None
            )

            from services.ebook.pipeline.style_guide import StyleGuide

            style_guide_obj = (
                style_guide
                if isinstance(style_guide, StyleGuide)
                else (
                    StyleGuide(
                        **{
                            k: v
                            for k, v in style_guide.items()
                            if k in StyleGuide.__dataclass_fields__
                        }
                    )
                    if isinstance(style_guide, dict)
                    else None
                )
            )

            manuscript_engine.generate(
                project_id=project_id,
                outline=outline,
                strategy=strategy,
                on_progress=manuscript_progress,
                profile=profile,
                language=project_brief.get("target_language", "en"),
                manuscript_model=manuscript_model,
                quality_level=quality_level,
                style_ctx=style_ctx,
                style_guide=style_guide_obj,
            )
            self.repo.set_metadata(project_id, "stage:manuscript", "completed")
        else:
            completed = progress["completed_chapters"]
            total = progress["total_chapters"]
            if on_progress:
                on_progress(
                    35 + int((completed / max(total, 1)) * 50),
                    f"Manuscript already exists ({completed}/{total} chapters) — skipping...",
                )

        # Cover
        if not progress["cover"]:
            if on_progress:
                on_progress(85, "Generating cover...")
            cover_generator = CoverGenerator(
                self.ai_client, projects_dir=self.projects_dir
            )
            cover_generator.generate(
                project_id=project_id,
                title=outline.get("best_title", "Ebook"),
                topic=project["idea"],
                tone=strategy.get("tone", "conversational"),
                product_mode=project["product_mode"],
                profile=profile,
            )
            self.repo.set_metadata(project_id, "stage:cover", "completed")
        else:
            if on_progress:
                on_progress(85, "Cover already exists — skipping...")

        # QA
        qa_engine = QAEngine()
        if not progress["qa"]:
            if on_progress:
                on_progress(92, "Running QA checks...")
            with open(project_dir / "manuscript.json") as f:
                manuscript_data = json.load(f)

            chapters_dir = project_dir / "chapters"
            manuscript = {
                "chapters": [
                    {
                        "chapter": ch.get("chapter", i + 1),
                        "title": ch.get("title"),
                        "word_count": ch.get("word_count"),
                        "content": (
                            (
                                chapters_dir / f"{ch.get('chapter', i + 1)}.md"
                            ).read_text()
                            if (
                                chapters_dir / f"{ch.get('chapter', i + 1)}.md"
                            ).exists()
                            else ""
                        ),
                    }
                    for i, ch in enumerate(manuscript_data.get("chapters", []))
                ]
            }

            report = qa_engine.run(manuscript, outline, strategy, profile=profile)
            qa_engine.save_report(project_id, report, self.projects_dir)
            self.repo.set_metadata(project_id, "stage:qa", "completed")
            self._fire_webhook_event(
                "ebook.generation.completed", {"project_id": project_id}
            )
        else:
            if on_progress:
                on_progress(92, "QA already completed — skipping...")
            # Load existing report for potential retry evaluation
            qa_report_path = project_dir / "qa_report.json"
            if qa_report_path.exists():
                with open(qa_report_path) as f:
                    report = json.load(f)
            else:
                report = {"passed": True, "issues": []}

        # Post-QA retry loop
        from services.ebook.config import get_config

        config = get_config()
        if not report.get("passed", True) and config.qa_post_qa_retries > 0:
            logger.info(
                "post_qa_retry_starting",
                project_id=project_id,
                issues=len(report.get("issues", [])),
            )
            manuscript_engine = ManuscriptEngine(
                self.ai_client, projects_dir=self.projects_dir
            )
            manuscript_engine._project_id = project_id
            for attempt in range(config.qa_post_qa_retries):
                failing_chapters = self._extract_failing_chapters(report)
                if not failing_chapters:
                    break
                for ch_idx, failure_context in failing_chapters:
                    manuscript_engine.regenerate_chapter(ch_idx, failure_context)
                # Re-run QA
                with open(project_dir / "manuscript.json") as f:
                    manuscript_data = json.load(f)
                chapters_dir = project_dir / "chapters"
                manuscript = {
                    "chapters": [
                        {
                            "chapter": ch.get("chapter", i + 1),
                            "title": ch.get("title"),
                            "word_count": ch.get("word_count"),
                            "content": (
                                (
                                    chapters_dir / f"{ch.get('chapter', i + 1)}.md"
                                ).read_text()
                                if (
                                    chapters_dir / f"{ch.get('chapter', i + 1)}.md"
                                ).exists()
                                else ""
                            ),
                        }
                        for i, ch in enumerate(manuscript_data.get("chapters", []))
                    ]
                }
                report = qa_engine.run(manuscript, outline, strategy, profile=profile)
                qa_engine.save_report(project_id, report, self.projects_dir)
                if report.get("passed", False):
                    logger.info("post_qa_retry_succeeded", attempt=attempt + 1)
                    break
            if not report.get("passed", False):
                logger.warning("post_qa_retry_exhausted", project_id=project_id)
                self.repo.update_project_status(project_id, "failed")
                return {"success": False, "error": "QA failed after retries"}

        # Rebuild manuscript.md after any post-QA retries: QA reads the per-chapter
        # files, but DOCX/EPUB export reads manuscript.md, which would otherwise be
        # stale and silently drop regenerated content.
        if report.get("passed", False):
            manuscript_md = project_dir / "manuscript.md"
            manuscript_json_path = project_dir / "manuscript.json"
            chapters_dir = project_dir / "chapters"
            if manuscript_json_path.exists():
                with open(manuscript_json_path) as f:
                    _mdata = json.load(f)
                _parts = []
                for _ch in _mdata.get("chapters", []):
                    _num = _ch.get("chapter")
                    _title = _ch.get("title") or f"Chapter {_num}"
                    _fname = chapters_dir / f"{_num}.md"
                    if _fname.exists():
                        _parts.append(
                            f"\n\n---\n\n## Chapter {_num}: {_title}\n\n{_fname.read_text()}"
                        )
                if _parts:
                    manuscript_md.write_text("".join(_parts))

        if not progress["export"]:
            if on_progress:
                on_progress(95, "Exporting to DOCX and PDF...")
            export_orchestrator = ExportOrchestrator(
                db_path=self.db_path,
                projects_dir=self.projects_dir,
            )
            result = export_orchestrator.export(project_id)
            self.repo.set_metadata(project_id, "stage:export", "completed")
            self._fire_webhook_event("ebook.export.ready", {"project_id": project_id})
        else:
            if on_progress:
                on_progress(95, "Exports already exist — skipping...")
            result = {
                "status": "completed",
                "project_id": project_id,
                "exports": {
                    "docx": project_dir / "exports" / "ebook.docx",
                    "pdf": project_dir / "exports" / "ebook.pdf",
                },
            }

        # Marketing Kit
        try:
            from services.ebook.pipeline.marketing_kit import MarketingKitGenerator

            marketing_kit_gen = MarketingKitGenerator(
                ai_client=self.ai_client, projects_dir=self.projects_dir
            )
            marketing_kit = marketing_kit_gen.generate(
                project_id=project_id,
                title=project.get("title", ""),
                strategy=strategy,
                outline=outline,
            )
            result["marketing_kit"] = marketing_kit
        except Exception as e:
            error_type = type(e).__name__
            context = {
                "operation": "marketing_kit_generation",
                "project_id": project_id,
            }
            logger.warning(
                "Marketing kit generation failed",
                error=str(e),
                error_type=error_type,
                context=context,
                severity="warning",
            )

        self.repo.update_project_status(project_id, "completed")

        if on_progress:
            on_progress(100, "Complete!")

        return result
