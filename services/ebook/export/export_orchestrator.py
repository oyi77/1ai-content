import json
from datetime import datetime
from pathlib import Path

from services.ebook.db.repository import ProjectRepository
from services.ebook.export.docx_generator import DocxGenerator
from services.ebook.export.epub_generator import EpubGenerator
from services.ebook.export.pdf_converter import PdfConverter
from services.ebook.logger import get_logger

logger = get_logger(__name__)


class ExportOrchestrator:
    def __init__(
        self,
        db_path: Path | str = "data/ebook_generator.db",
        projects_dir: Path | str = "projects",
    ):
        self.db_path = db_path
        self.projects_dir = projects_dir
        self.repo = ProjectRepository(db_path)

    def export(self, project_id: int) -> dict:
        project_dir = Path(self.projects_dir) / str(project_id)
        exports_dir = project_dir / "exports"
        exports_dir.mkdir(parents=True, exist_ok=True)

        docx_result = self._generate_docx(project_id, project_dir)
        pdf_result = self._generate_pdf(project_dir)
        epub_result = self._generate_epub(project_id, project_dir)

        format_results = {
            "docx": docx_result,
            "pdf": pdf_result,
            "epub": epub_result,
        }

        self._create_manifest(project_id, exports_dir, format_results)

        self.repo.update_project_status(project_id, "completed")

        return {
            "status": "completed",
            "project_id": project_id,
            "exports": {
                "docx": exports_dir / "ebook.docx",
                "pdf": exports_dir / "ebook.pdf",
                "epub": exports_dir / "ebook.epub",
            },
        }

    def _generate_docx(self, project_id: int, project_dir: Path) -> dict:
        try:
            generator = DocxGenerator(projects_dir=project_dir.parent)
            title = "Ebook"

            outline_file = project_dir / "outline.json"
            if outline_file.exists():
                with open(outline_file) as f:
                    outline = json.load(f)
                    title = outline.get("best_title", "Ebook")

            result = generator.generate(project_id, title=title)
            docx_path = project_dir / "exports" / "ebook.docx"
            path_str = (
                str(result["docx"])
                if isinstance(result, dict) and result.get("docx")
                else (str(docx_path) if docx_path.exists() else None)
            )
            return {"status": "success", "path": path_str, "error": None}
        except Exception as e:
            error_type = type(e).__name__
            context = {
                "operation": "docx_generation",
                "project_id": project_id,
            }
            logger.warning(
                "DOCX generation failed",
                error=str(e),
                error_type=error_type,
                context=context,
                severity="warning",
            )
            return {"status": "failed", "path": None, "error": str(e)}

    def _generate_epub(self, project_id: int, project_dir: Path) -> dict:
        try:
            title = "Ebook"
            outline_file = project_dir / "outline.json"
            if outline_file.exists():
                with open(outline_file) as f:
                    outline = json.load(f)
                    title = outline.get("best_title", "Ebook")

            generator = EpubGenerator(projects_dir=project_dir.parent)
            result = generator.generate(project_id, title=title)
            path_str = (
                str(result["epub"])
                if isinstance(result, dict) and result.get("epub")
                else str(project_dir / "exports" / "ebook.epub")
            )
            return {"status": "success", "path": path_str, "error": None}
        except Exception as e:
            error_type = type(e).__name__
            context = {
                "operation": "epub_generation",
                "project_id": project_id,
            }
            logger.warning(
                "EPUB generation failed",
                error=str(e),
                error_type=error_type,
                context=context,
                severity="warning",
            )
            return {"status": "failed", "path": None, "error": str(e)}

    def _generate_pdf(self, project_dir: Path) -> dict:
        converter = PdfConverter(projects_dir=self.projects_dir)
        docx_file = project_dir / "exports" / "ebook.docx"

        if not docx_file.exists():
            return {"status": "skipped", "path": None, "error": "DOCX file not found"}

        try:
            converter.convert(docx_file)
            pdf_path = project_dir / "exports" / "ebook.pdf"
            path_str = str(pdf_path) if pdf_path.exists() else None
            return {"status": "success", "path": path_str, "error": None}
        except RuntimeError as e:
            error_type = type(e).__name__
            context = {
                "operation": "pdf_conversion",
                "docx_file": str(docx_file),
            }
            if "LibreOffice not found" in str(e):
                logger.info(
                    "LibreOffice not found, skipping PDF conversion",
                    error=str(e),
                    error_type=error_type,
                    context=context,
                    severity="info",
                )
            else:
                logger.warning(
                    "PDF conversion failed",
                    error=str(e),
                    error_type=error_type,
                    context=context,
                    severity="warning",
                )
            return {"status": "failed", "path": None, "error": str(e)}
        except Exception as e:
            error_type = type(e).__name__
            context = {
                "operation": "pdf_conversion",
                "docx_file": str(docx_file),
            }
            logger.warning(
                "PDF generation failed",
                error=str(e),
                error_type=error_type,
                context=context,
                severity="warning",
            )
            return {"status": "failed", "path": None, "error": str(e)}

    def _create_manifest(
        self, project_id: int, exports_dir: Path, format_results: dict | None = None
    ) -> None:
        manifest = {
            "project_id": project_id,
            "generated_at": datetime.now().isoformat(),
            "formats": {},
        }

        for fmt, result in (format_results or {}).items():
            entry: dict = {"status": result.get("status", "unknown")}
            if result.get("path"):
                path = Path(result["path"])
                entry["path"] = result["path"]
                if path.exists():
                    entry["size_bytes"] = path.stat().st_size
            if result.get("error"):
                entry["error"] = result["error"]
            manifest["formats"][fmt] = entry

        with open(exports_dir / "manifest.json", "w") as f:
            json.dump(manifest, f, indent=2)
