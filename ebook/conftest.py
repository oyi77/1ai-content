import io
import os
import tempfile
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from PIL import Image


@pytest.fixture
def temp_project_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        yield Path(tmpdir)


@pytest.fixture
def test_db_path(tmp_path):
    return tmp_path / "test.db"


@pytest.fixture
def mock_ai_client():
    client = MagicMock()
    client.generate_text = MagicMock(return_value="Generated text content")
    client.generate_structured = MagicMock(return_value={"key": "value"})

    def _make_minimal_png(width=64, height=64):
        img = Image.new("RGB", (width, height), color=(128, 128, 128))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    client.generate_image = MagicMock(return_value=_make_minimal_png())
    return client


@pytest.fixture
def sample_project_brief():
    return {
        "id": 1,
        "title": "Test Ebook",
        "idea": "How to start a successful blog",
        "product_mode": "lead_magnet",
        "target_language": "en",
        "chapter_count": 5,
        "status": "draft",
    }


@pytest.fixture
def sample_strategy():
    return {
        "audience": "Small business owners",
        "pain_points": ["no time", "no expertise"],
        "promise": "save 10hrs/week",
        "positioning": "practical guide",
        "tone": "conversational",
        "goal": "email signup",
    }


@pytest.fixture
def sample_outline():
    return {
        "titles": ["The Blogging Playbook", "Blogging Mastery", "The Complete Guide"],
        "subtitles": ["A Practical Guide", "From Zero to Hero", "Everything You Need"],
        "best_title": "The Blogging Playbook",
        "best_subtitle": "A Practical Guide",
        "chapters": [
            {
                "title": "Getting Started",
                "summary": "Introduction to blogging basics",
                "subchapters": ["Choosing a Niche", "Setting Up"],
                "estimated_word_count": 500,
            },
            {
                "title": "Content Strategy",
                "summary": "How to create engaging content",
                "subchapters": ["Topic Research", "Writing Tips"],
                "estimated_word_count": 600,
            },
        ],
    }
