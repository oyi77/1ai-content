import pytest
from pathlib import Path
from unittest.mock import MagicMock
from services.ebook.pipeline.book_structure import BookStructureGenerator


@pytest.fixture
def tmp_project_dir(tmp_path):
    project_dir = tmp_path / "projects" / "test-proj-123"
    project_dir.mkdir(parents=True)
    return project_dir


@pytest.fixture
def mock_ai():
    client = MagicMock()
    client.generate_text.return_value = (
        "A heartfelt dedication to all who seek knowledge."
    )
    client.generate_structured.return_value = {}
    return client


@pytest.fixture
def sample_outline():
    return {
        "title": "The Art of Leadership",
        "subtitle": "Practical Wisdom for Modern Managers",
        "chapters": [
            {"number": 1, "title": "The Listening Leader", "subchapters": []},
            {"number": 2, "title": "Building Trust", "subchapters": []},
            {"number": 3, "title": "Leading Through Change", "subchapters": []},
        ],
    }


@pytest.fixture
def sample_project():
    return {
        "id": "test-proj-123",
        "title": "The Art of Leadership",
        "author": "Alex Johnson",
        "target_language": "English",
        "product_mode": "paid_ebook",
    }


@pytest.fixture
def sample_style_ctx():
    ctx = MagicMock()
    ctx.established_terminology = {
        "servant leadership": "A leadership philosophy where the leader's primary goal is to serve",
        "psychological safety": "The belief that one won't be punished for speaking up",
    }
    return ctx


def test_front_matter_title_page_written(
    tmp_project_dir, mock_ai, sample_project, sample_outline
):
    gen = BookStructureGenerator(
        ai_client=mock_ai, projects_dir=str(tmp_project_dir.parent.parent)
    )
    gen.generate_front_matter(
        sample_project, sample_outline, project_dir=str(tmp_project_dir)
    )
    title_page = tmp_project_dir / "front_matter" / "title_page.md"
    assert title_page.exists()
    content = title_page.read_text()
    assert "The Art of Leadership" in content


def test_front_matter_toc_matches_outline(
    tmp_project_dir, mock_ai, sample_project, sample_outline
):
    gen = BookStructureGenerator(
        ai_client=mock_ai, projects_dir=str(tmp_project_dir.parent.parent)
    )
    gen.generate_front_matter(
        sample_project, sample_outline, project_dir=str(tmp_project_dir)
    )
    toc = tmp_project_dir / "front_matter" / "toc_page.md"
    assert toc.exists()
    content = toc.read_text()
    assert "The Listening Leader" in content
    assert "Building Trust" in content
    assert "Leading Through Change" in content


def test_front_matter_copyright_contains_year(
    tmp_project_dir, mock_ai, sample_project, sample_outline
):
    gen = BookStructureGenerator(
        ai_client=mock_ai, projects_dir=str(tmp_project_dir.parent.parent)
    )
    gen.generate_front_matter(
        sample_project, sample_outline, project_dir=str(tmp_project_dir)
    )
    copyright_page = tmp_project_dir / "front_matter" / "copyright.md"
    assert copyright_page.exists()
    content = copyright_page.read_text()
    assert "©" in content or "Copyright" in content


def test_back_matter_has_about_author(
    tmp_project_dir, mock_ai, sample_project, sample_style_ctx
):
    gen = BookStructureGenerator(
        ai_client=mock_ai, projects_dir=str(tmp_project_dir.parent.parent)
    )
    gen.generate_back_matter(
        sample_project, sample_style_ctx, project_dir=str(tmp_project_dir)
    )
    about = tmp_project_dir / "back_matter" / "about_author.md"
    assert about.exists()
    content = about.read_text()
    assert len(content) > 50


def test_glossary_contains_established_terms(
    tmp_project_dir, mock_ai, sample_project, sample_style_ctx
):
    gen = BookStructureGenerator(
        ai_client=mock_ai, projects_dir=str(tmp_project_dir.parent.parent)
    )
    gen.generate_back_matter(
        sample_project, sample_style_ctx, project_dir=str(tmp_project_dir)
    )
    glossary = tmp_project_dir / "back_matter" / "glossary.md"
    assert glossary.exists()
    content = glossary.read_text()
    assert "servant leadership" in content
    assert "psychological safety" in content
