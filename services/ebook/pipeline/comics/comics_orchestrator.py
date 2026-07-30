from __future__ import annotations
import json
from pathlib import Path
from typing import Callable, Optional

from PIL import Image

from services.ebook.ai_client import OmnirouteClient
from services.ebook.db.repository import ProjectRepository
from services.ebook.logger import get_logger

logger = get_logger(__name__)

RTL_FORMATS = {"manga"}


class ComicsOrchestrator:
    def __init__(
        self,
        db_path: str | Path = "data/ebook_generator.db",
        projects_dir: str | Path = "projects",
        ai_client: OmnirouteClient | None = None,
    ):
        self.db_path = str(db_path)
        self.projects_dir = Path(projects_dir)
        self.ai_client = ai_client or OmnirouteClient()

    def run(
        self,
        project_id: int,
        on_progress: Optional[Callable[[int, str], None]] = None,
    ) -> dict:
        def progress(pct: int, msg: str):
            if on_progress:
                on_progress(pct, msg)

        project = self._get_project(project_id)
        product_mode = project.get("product_mode", "manga")
        is_rtl = product_mode in RTL_FORMATS
        project_dir = self.projects_dir / str(project_id)
        project_dir.mkdir(parents=True, exist_ok=True)

        # Stage 1: Script
        progress(0, "Generating comics script...")
        script = self._run_script_stage(project, project_dir)
        self._set_metadata(project_id, "stage:script", "completed")
        progress(10, "Script complete")

        # Stage 2: Character sheet
        progress(10, "Building character sheet...")
        from services.ebook.pipeline.comics.character_sheet import CharacterSheet

        sheet = CharacterSheet()
        sheet.build_from_script(script)
        sheet.save(project_dir / "character_sheet.json")
        self._set_metadata(project_id, "stage:character_sheet", "completed")
        progress(20, "Character sheet complete")

        # Stage 3: Panel art generation
        progress(20, "Generating panel art...")
        from services.ebook.pipeline.comics.panel_art_generator import PanelArtGenerator
        from services.ebook.config import get_config

        cfg = get_config()
        generator = PanelArtGenerator(
            ai_client=self.ai_client, max_workers=cfg.comics_parallel_workers
        )
        panels_dir = project_dir / "panels"
        panels_dir.mkdir(parents=True, exist_ok=True)

        all_chapters = script.get("chapters", [])
        total_pages = sum(len(ch.get("pages", [])) for ch in all_chapters)
        done_pages = 0

        for chapter in all_chapters:
            for page in chapter.get("pages", []):
                generator.generate_page_panels(page, sheet, product_mode, panels_dir)
                done_pages += 1
                pct = 20 + int((done_pages / max(total_pages, 1)) * 60)
                progress(pct, f"Panels: {done_pages}/{total_pages} pages")

        self._set_metadata(project_id, "stage:panel_art", "completed")
        progress(80, "Panel art complete")

        # Stage 4: Page composition
        progress(80, "Composing pages...")
        from services.ebook.pipeline.comics.page_composer import PageComposer

        composer = PageComposer()
        pages_dir = project_dir / "pages"
        pages_dir.mkdir(parents=True, exist_ok=True)
        composed_pages: list[Image.Image] = []

        for chapter in all_chapters:
            for page in chapter.get("pages", []):
                panel_images: dict[str, Image.Image] = {}
                for panel in page.get("panels", []):
                    pid = panel["panel_id"]
                    panel_path = panels_dir / f"{pid}.png"
                    if panel_path.exists():
                        panel_images[pid] = Image.open(panel_path)

                composed = composer.compose_page(page, panel_images, rtl=is_rtl)
                page_num = len(composed_pages) + 1
                page_path = pages_dir / f"page_{page_num:03d}.png"
                composed.save(page_path)
                composed_pages.append(composed)

        self._set_metadata(project_id, "stage:pages", "completed")
        progress(90, "Pages composed")

        # Stage 5: QA — verify all page PNGs are valid
        progress(90, "Running comics QA...")
        for i, page_img in enumerate(composed_pages):
            try:
                Image.open(pages_dir / f"page_{i + 1:03d}.png")
            except Exception as e:
                logger.warning("qa_page_invalid", page=i + 1, error=str(e))
        self._set_metadata(project_id, "stage:qa", "completed")
        progress(95, "QA complete")

        # Stage 6: Export
        progress(95, "Exporting comics...")
        from services.ebook.export.comics_exporter import ComicsExporter

        exporter = ComicsExporter(projects_dir=self.projects_dir)
        exports = exporter.export(
            project_id=project_id,
            pages=composed_pages,
            fmt="all",
            title=script.get("title", "Untitled"),
            comic_format=product_mode,
        )
        self._set_metadata(project_id, "stage:export", "completed")
        self._update_status(project_id, "completed")
        progress(100, "Export complete!")

        return {
            "project_id": project_id,
            "script": str(project_dir / "script.json"),
            "exports": exports,
        }

    def _run_script_stage(self, project: dict, project_dir: Path) -> dict:
        script_file = project_dir / "script.json"
        if script_file.exists():
            return json.loads(script_file.read_text())

        from services.ebook.pipeline.comics.script_engine import ComicsScriptEngine

        # Build minimal strategy
        strategy = {
            "audience": "general readers",
            "promise": project.get("idea", "")[:50],
        }
        strategy_file = project_dir / "strategy.json"
        if strategy_file.exists():
            strategy = json.loads(strategy_file.read_text())

        engine = ComicsScriptEngine(
            ai_client=self.ai_client, projects_dir=self.projects_dir
        )
        return engine.generate(project, strategy)

    def _get_project(self, project_id: int) -> dict:
        repo = ProjectRepository(self.db_path)
        project = repo.get_project(project_id)
        if project is None:
            raise ValueError(f"Project {project_id} not found")
        return project

    def _set_metadata(self, project_id: int, key: str, value: str) -> None:
        try:
            repo = ProjectRepository(self.db_path)
            repo.set_metadata(project_id, key, value)
        except Exception as e:
            logger.debug("metadata_write_skipped", error=str(e))

    def _update_status(self, project_id: int, status: str) -> None:
        try:
            repo = ProjectRepository(self.db_path)
            repo.update_project_status(project_id, status)
        except Exception as e:
            logger.debug("status_update_skipped", error=str(e))
