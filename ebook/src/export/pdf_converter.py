import shutil
import subprocess
from pathlib import Path

from src.utils.path_validator import PathValidator


class PdfConverter:
    def __init__(
        self, libreoffice_path: str | None = None, projects_dir: Path | str = "projects"
    ):
        if libreoffice_path:
            self.libreoffice_path = libreoffice_path
        else:
            self.libreoffice_path = shutil.which("libreoffice") or shutil.which(
                "soffice"
            )
        self.projects_dir = Path(projects_dir)

    def convert(self, docx_file: Path | str) -> dict:
        docx_file = Path(docx_file)

        validator = PathValidator(self.projects_dir)

        try:
            resolved_path = validator.validate_project_path(docx_file)
        except ValueError as e:
            raise ValueError(f"Invalid file path: {docx_file}") from e

        if not resolved_path.exists():
            raise ValueError(f"File does not exist: {docx_file}")

        try:
            validator.validate_file_extension(resolved_path, {".docx"})
        except ValueError as e:
            raise ValueError(str(e)) from e

        if not self.libreoffice_path:
            raise RuntimeError("LibreOffice not found. Please install libreoffice.")

        output_dir = resolved_path.parent

        try:
            result = subprocess.run(
                [
                    self.libreoffice_path,
                    "--headless",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    str(output_dir),
                    str(resolved_path),
                ],
                capture_output=True,
                text=True,
                timeout=120,
            )
        except FileNotFoundError as e:
            raise RuntimeError(
                "LibreOffice not found. Please install libreoffice."
            ) from e

        if result.returncode != 0:
            raise RuntimeError(f"PDF conversion failed: {result.stderr}")

        pdf_file = output_dir / f"{resolved_path.stem}.pdf"

        if not pdf_file.exists():
            raise RuntimeError(f"PDF file not created at {pdf_file}")

        return {"pdf": pdf_file}

    def check_installation(self) -> bool:
        return self.libreoffice_path is not None
