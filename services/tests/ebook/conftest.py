"""Root conftest for ebook tests — shared fixtures."""

import pytest
from unittest.mock import MagicMock


@pytest.fixture
def test_db_path(tmp_path):
    """Path to an isolated SQLite database file."""
    return tmp_path / "test.db"


@pytest.fixture
def temp_project_dir(tmp_path):
    """Temporary directory for project artifacts."""
    return tmp_path


@pytest.fixture
def mock_ai_client():
    """Mock OmnirouteClient with sensible defaults for pipeline stages."""
    client = MagicMock()
    client.generate_text = MagicMock(
        return_value="Generated content covering the topic in depth."
    )
    client.generate_structured = MagicMock(
        return_value={
            "title": "Test Ebook",
            "chapters": [],
            "audience": "beginners",
            "tone": "conversational",
            "positioning": "authority",
        }
    )
    return client


@pytest.fixture
def sample_project_brief():
    return {
        "id": 1,
        "idea": "How to start a successful blog from scratch",
        "title": "Blogging 101",
        "chapter_count": 5,
        "product_mode": "lead_magnet",
    }


@pytest.fixture
def sample_strategy():
    return {
        "audience": "beginner bloggers",
        "tone": "conversational",
        "positioning": "step-by-step guide",
        "outline_focus": "practical tips",
    }


@pytest.fixture
def sample_outline():
    return {
        "best_title": "Blogging 101",
        "chapters": [
            {"id": 1, "title": "Introduction", "description": "Getting started"},
            {"id": 2, "title": "Setup", "description": "Setting up your blog"},
            {"id": 3, "title": "Content", "description": "Writing content"},
        ],
    }
