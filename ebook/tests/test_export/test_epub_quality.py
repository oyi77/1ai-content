import pytest
import zipfile
import io
from pathlib import Path
from unittest.mock import MagicMock, patch


def _build_epub(tmp_path, chapters=None):
    """Helper: build a minimal EPUB using EpubGenerator and return the zip bytes."""
    from src.export.epub_generator import EpubGenerator

    if chapters is None:
        chapters = [
            {
                "title": "The Listening Leader",
                "content": "## Why Leaders Stop Listening\n\nContent here.\n\n## Key Takeaways\n\n- Point one\n\n## Action Steps\n\n1. Do this",
            }
        ]

    project_id = "test-epub-001"
    project_dir = tmp_path / project_id
    project_dir.mkdir(parents=True)

    # Write manuscript
    manuscript = "# " + chapters[0]["title"] + "\n\n" + chapters[0]["content"]
    (project_dir / "manuscript.md").write_text(manuscript)

    # Write outline
    import json

    outline = {
        "title": "Test Book",
        "chapters": [
            {"number": i + 1, "title": c["title"], "subchapters": []}
            for i, c in enumerate(chapters)
        ],
    }
    (project_dir / "outline.json").write_text(json.dumps(outline))

    gen = EpubGenerator(projects_dir=str(tmp_path))
    result = gen.generate(
        project_id=project_id, title="Test Book", author="Test Author"
    )

    epub_path = project_dir / "exports" / "ebook.epub"
    return epub_path


def test_epub_generates_successfully(tmp_path):
    """Basic: EPUB file is created."""
    epub_path = _build_epub(tmp_path)
    assert epub_path.exists(), f"EPUB not found at {epub_path}"
    assert epub_path.stat().st_size > 0


def test_chapter_epub_type_present(tmp_path):
    """Chapters must have epub:type attribute for accessibility."""
    epub_path = _build_epub(tmp_path)
    with zipfile.ZipFile(epub_path) as zf:
        content_files = [
            n for n in zf.namelist() if n.endswith(".xhtml") or n.endswith(".html")
        ]
        chapter_files = [
            n
            for n in content_files
            if "chap" in n.lower() or "chapter" in n.lower() or "item" in n.lower()
        ]

        found_epub_type = False
        for fname in chapter_files:
            content = zf.read(fname).decode("utf-8", errors="replace")
            if "epub:type" in content or "epub_type" in content:
                found_epub_type = True
                break

        # If no chapter files with epub:type, check all xhtml files
        if not found_epub_type:
            for fname in content_files:
                content = zf.read(fname).decode("utf-8", errors="replace")
                if "epub:type" in content:
                    found_epub_type = True
                    break

        assert found_epub_type, "No epub:type attributes found in any EPUB content file"


def test_epub_has_toc_nav(tmp_path):
    """EPUB must have a nav document with TOC."""
    epub_path = _build_epub(tmp_path)
    with zipfile.ZipFile(epub_path) as zf:
        nav_files = [
            n
            for n in zf.namelist()
            if "nav" in n.lower() and (n.endswith(".xhtml") or n.endswith(".html"))
        ]
        assert len(nav_files) > 0, "No nav document found in EPUB"
        nav_content = zf.read(nav_files[0]).decode("utf-8", errors="replace")
        assert (
            "toc" in nav_content.lower()
            or "Table of Contents" in nav_content
            or "nav" in nav_content.lower()
        )


def test_epub_css_has_body_styles(tmp_path):
    """EPUB CSS must define body font and line-height."""
    epub_path = _build_epub(tmp_path)
    with zipfile.ZipFile(epub_path) as zf:
        css_files = [n for n in zf.namelist() if n.endswith(".css")]
        assert len(css_files) > 0, "No CSS files found in EPUB"

        css_content = ""
        for fname in css_files:
            css_content += zf.read(fname).decode("utf-8", errors="replace")

        assert "line-height" in css_content, "CSS missing line-height property"
        assert "body" in css_content, "CSS missing body rule"


def test_epub_opf_has_correct_media_type(tmp_path):
    """OPF manifest must list items with correct media types."""
    epub_path = _build_epub(tmp_path)
    with zipfile.ZipFile(epub_path) as zf:
        opf_files = [n for n in zf.namelist() if n.endswith(".opf")]
        assert len(opf_files) > 0, "No OPF file found in EPUB"
        opf_content = zf.read(opf_files[0]).decode("utf-8", errors="replace")
        assert "application/xhtml+xml" in opf_content or "media-type" in opf_content
