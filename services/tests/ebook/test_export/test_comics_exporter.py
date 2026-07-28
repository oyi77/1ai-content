import io
import zipfile
import pytest
from pathlib import Path
from PIL import Image

from services.ebook.export.comics_exporter import ComicsExporter


def make_page(color=(200, 200, 200), size=(400, 566)) -> Image.Image:
    return Image.new("RGB", size, color=color)


@pytest.fixture
def exporter(tmp_path):
    return ComicsExporter(projects_dir=tmp_path)


@pytest.fixture
def pages():
    return [
        make_page((200, 200, 200)),
        make_page((180, 180, 180)),
        make_page((160, 160, 160)),
    ]


def test_cbz_is_valid_zip_with_pngs(exporter, pages, tmp_path):
    result = exporter.export(project_id=1, pages=pages, fmt="cbz", title="Test Comic")
    cbz_path = Path(result["cbz"])
    assert cbz_path.exists()
    with zipfile.ZipFile(cbz_path, "r") as zf:
        names = zf.namelist()
        png_files = [n for n in names if n.endswith(".png")]
        assert len(png_files) == len(pages)


def test_cbz_pages_ordered_correctly(exporter, pages, tmp_path):
    result = exporter.export(project_id=1, pages=pages, fmt="cbz")
    cbz_path = Path(result["cbz"])
    with zipfile.ZipFile(cbz_path, "r") as zf:
        png_files = sorted(n for n in zf.namelist() if n.endswith(".png"))
        assert png_files[0] == "page_001.png"
        assert png_files[1] == "page_002.png"


def test_cbz_rtl_has_comicinfo_xml(exporter, pages, tmp_path):
    result = exporter.export(project_id=1, pages=pages, fmt="cbz", comic_format="manga")
    cbz_path = Path(result["cbz"])
    with zipfile.ZipFile(cbz_path, "r") as zf:
        assert "ComicInfo.xml" in zf.namelist()
        xml_content = zf.read("ComicInfo.xml").decode()
        assert "YesAndRightToLeft" in xml_content


def test_webtoon_strip_is_single_tall_image(exporter, pages, tmp_path):
    result = exporter.export(project_id=1, pages=pages, fmt="webtoon")
    webtoon_path = Path(result["webtoon"])
    assert webtoon_path.exists()
    img = Image.open(webtoon_path)
    assert img.width == 800
    # Height should be greater than any single page
    assert img.height > pages[0].height


def test_pdf_export_creates_file(exporter, pages, tmp_path):
    result = exporter.export(project_id=1, pages=pages, fmt="pdf")
    pdf_path = Path(result["pdf"])
    assert pdf_path.exists()
    assert pdf_path.stat().st_size > 0
