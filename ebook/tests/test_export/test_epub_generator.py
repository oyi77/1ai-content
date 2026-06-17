import pytest

ebooklib = pytest.importorskip("ebooklib")

from pathlib import Path
from src.export.epub_generator import EpubGenerator

SAMPLE_MANUSCRIPT = """\
# My Ebook

Introduction text.

## Chapter One

This is the first chapter.

It has multiple paragraphs with **bold** and *italic* text.

## Chapter Two

Second chapter content here.

Short but complete.

## Chapter Three

Final chapter wraps things up.

The end.
"""


def test_epub_file_created(tmp_path):
    project_dir = tmp_path / "42"
    project_dir.mkdir()
    (project_dir / "manuscript.md").write_text(SAMPLE_MANUSCRIPT)

    gen = EpubGenerator(projects_dir=tmp_path)
    result = gen.generate(project_id=42, title="My Ebook", author="Test Author")

    epub_file = result["epub"]
    assert epub_file.exists(), "epub file should exist"
    assert epub_file.stat().st_size > 0, "epub file should not be empty"


def test_epub_at_expected_path(tmp_path):
    project_dir = tmp_path / "1"
    project_dir.mkdir()
    (project_dir / "manuscript.md").write_text(SAMPLE_MANUSCRIPT)

    gen = EpubGenerator(projects_dir=tmp_path)
    gen.generate(project_id=1, title="Test")

    expected = tmp_path / "1" / "exports" / "ebook.epub"
    assert expected.exists()


def test_epub_is_zip(tmp_path):
    """EPUB files are ZIP archives."""
    import zipfile

    project_dir = tmp_path / "1"
    project_dir.mkdir()
    (project_dir / "manuscript.md").write_text(SAMPLE_MANUSCRIPT)

    gen = EpubGenerator(projects_dir=tmp_path)
    result = gen.generate(project_id=1, title="Test")

    assert zipfile.is_zipfile(result["epub"]), "EPUB must be a valid ZIP"


def test_epub_title_and_chapters(tmp_path):
    """Open with ebooklib and verify title and chapter items."""
    from ebooklib import epub as ebooklib_epub

    project_dir = tmp_path / "1"
    project_dir.mkdir()
    (project_dir / "manuscript.md").write_text(SAMPLE_MANUSCRIPT)

    gen = EpubGenerator(projects_dir=tmp_path)
    result = gen.generate(project_id=1, title="My Ebook", author="Test Author")

    book = ebooklib_epub.read_epub(str(result["epub"]))
    assert book.title == "My Ebook"

    # Should have 3 chapter items (chapter_001..003.xhtml)
    from ebooklib import ITEM_DOCUMENT

    docs = list(book.get_items_of_type(ITEM_DOCUMENT))
    chapter_docs = [d for d in docs if d.file_name.startswith("chapter_")]
    assert len(chapter_docs) == 3


def test_epub_no_manuscript_fallback(tmp_path):
    """Missing manuscript.md should produce a valid epub with title page."""
    project_dir = tmp_path / "99"
    project_dir.mkdir()

    gen = EpubGenerator(projects_dir=tmp_path)
    result = gen.generate(project_id=99, title="Fallback Ebook")

    assert result["epub"].exists()
    assert result["epub"].stat().st_size > 0


def test_epub_with_cover_image(tmp_path):
    """When cover.png exists it should be included without error."""
    from PIL import Image

    project_dir = tmp_path / "1"
    project_dir.mkdir()
    cover_dir = project_dir / "cover"
    cover_dir.mkdir()
    img = Image.new("RGB", (200, 300), color=(30, 60, 120))
    img.save(cover_dir / "cover.png")
    (project_dir / "manuscript.md").write_text(SAMPLE_MANUSCRIPT)

    gen = EpubGenerator(projects_dir=tmp_path)
    result = gen.generate(project_id=1, title="Covered Ebook")

    assert result["epub"].exists()
    assert result["epub"].stat().st_size > 0
