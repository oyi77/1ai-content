from __future__ import annotations
import io
import zipfile
from pathlib import Path

from PIL import Image

from src.logger import get_logger

logger = get_logger(__name__)

RTL_FORMATS = {"manga"}

COMICINFO_XML_TEMPLATE = """<?xml version="1.0" encoding="utf-8"?>
<ComicInfo xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">
  <Title>{title}</Title>
  <Manga>{manga_flag}</Manga>
</ComicInfo>"""


class ComicsExporter:
    def __init__(self, projects_dir: Path | str = "projects"):
        self.projects_dir = Path(projects_dir)

    def export(
        self,
        project_id: str | int,
        pages: list[Image.Image],
        fmt: str,
        title: str = "Untitled",
        comic_format: str = "comics",
    ) -> dict:
        exports_dir = self.projects_dir / str(project_id) / "exports"
        exports_dir.mkdir(parents=True, exist_ok=True)

        result = {}
        if fmt in ("cbz", "all"):
            cbz_path = self._export_cbz(
                pages, exports_dir / "comic.cbz", title, comic_format
            )
            result["cbz"] = str(cbz_path)
        if fmt in ("webtoon", "all"):
            webtoon_path = self._export_webtoon(pages, exports_dir / "webtoon.png")
            result["webtoon"] = str(webtoon_path)
        if fmt in ("pdf", "all"):
            pdf_path = self._export_pdf(pages, exports_dir / "comic.pdf")
            result["pdf"] = str(pdf_path)
        return result

    def _export_cbz(
        self,
        pages: list[Image.Image],
        output_path: Path,
        title: str = "Untitled",
        comic_format: str = "comics",
    ) -> Path:
        is_rtl = comic_format in RTL_FORMATS
        manga_flag = "YesAndRightToLeft" if is_rtl else "No"

        with zipfile.ZipFile(output_path, "w", zipfile.ZIP_STORED) as zf:
            for i, page in enumerate(pages):
                buf = io.BytesIO()
                page.save(buf, format="PNG")
                zf.writestr(f"page_{i + 1:03d}.png", buf.getvalue())

            # Always include ComicInfo.xml
            xml = COMICINFO_XML_TEMPLATE.format(title=title, manga_flag=manga_flag)
            zf.writestr("ComicInfo.xml", xml)

        return output_path

    def _export_webtoon(self, pages: list[Image.Image], output_path: Path) -> Path:
        from src.pipeline.comics.page_composer import PageComposer

        composer = PageComposer()
        strip = composer.compose_webtoon_strip(pages, panel_width=800)
        strip.save(output_path, format="PNG")
        return output_path

    def _export_pdf(self, pages: list[Image.Image], output_path: Path) -> Path:
        try:
            from fpdf import FPDF

            pdf = FPDF()
            pdf.set_auto_page_break(False)
            for page_img in pages:
                buf = io.BytesIO()
                page_img.save(buf, format="PNG")
                buf.seek(0)
                w_mm = 210
                h_mm = int(w_mm * page_img.height / page_img.width)
                pdf.add_page(format=(w_mm, h_mm))
                pdf.image(buf, x=0, y=0, w=w_mm, h=h_mm)
            pdf.output(str(output_path))
        except ImportError:
            logger.warning("fpdf2 not installed, saving PDF as ZIP of PNGs fallback")
            self._export_cbz(pages, output_path.with_suffix(".cbz"))
            output_path.write_bytes(b"PDF export requires fpdf2")
        return output_path
