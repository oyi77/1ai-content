import pytest
from unittest.mock import MagicMock, patch
import time


@pytest.fixture
def mock_ai_client():
    client = MagicMock()
    client.generate_text = MagicMock(
        return_value="Generated chapter content covering the topic in depth with multiple paragraphs."
    )
    return client


def test_generate_manuscript_chapters_created(mock_ai_client, temp_project_dir):
    from src.pipeline.manuscript_engine import ManuscriptEngine

    engine = ManuscriptEngine(mock_ai_client, projects_dir=temp_project_dir)
    outline = {
        "chapters": [
            {
                "title": "Getting Started",
                "summary": "Intro to blogging",
                "subchapters": [],
                "estimated_word_count": 500,
            },
            {
                "title": "Content Strategy",
                "summary": "Creating content",
                "subchapters": [],
                "estimated_word_count": 500,
            },
        ]
    }
    strategy = {"tone": "conversational", "audience": "beginners"}

    progress_updates = []

    def on_progress(progress, step):
        progress_updates.append((progress, step))

    engine.generate(
        project_id=1, outline=outline, strategy=strategy, on_progress=on_progress
    )

    chapter_file = temp_project_dir / "1" / "chapters" / "1.md"
    assert chapter_file.exists()
    assert len(progress_updates) > 0


def test_progress_callbacks_fire(test_db_path, temp_project_dir):
    from src.ai_client import OmnirouteClient
    from src.pipeline.manuscript_engine import ManuscriptEngine

    client = OmnirouteClient(base_url="http://test/v1")
    with patch.object(client.client, "chat") as mock:
        mock.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Chapter content here."))]
        )
        engine = ManuscriptEngine(client, projects_dir=temp_project_dir)
        outline = {
            "chapters": [
                {
                    "title": "Ch1",
                    "summary": "Summary",
                    "subchapters": [],
                    "estimated_word_count": 500,
                },
                {
                    "title": "Ch2",
                    "summary": "Summary",
                    "subchapters": [],
                    "estimated_word_count": 500,
                },
            ]
        }

        progress_updates = []
        engine.generate(
            project_id=1,
            outline=outline,
            strategy={"tone": "test", "audience": "test"},
            on_progress=lambda p, s: progress_updates.append((p, s)),
        )

        assert len(progress_updates) >= 2


def test_manuscript_json_created(test_db_path, temp_project_dir):
    from src.ai_client import OmnirouteClient
    from src.pipeline.manuscript_engine import ManuscriptEngine

    client = OmnirouteClient(base_url="http://test/v1")
    with patch.object(client.client, "chat") as mock:
        mock.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Content here."))]
        )
        engine = ManuscriptEngine(client, projects_dir=temp_project_dir)
        outline = {
            "chapters": [
                {
                    "title": "Ch1",
                    "summary": "Summary",
                    "subchapters": [],
                    "estimated_word_count": 500,
                }
            ]
        }

        engine.generate(
            project_id=1,
            outline=outline,
            strategy={"tone": "test", "audience": "test"},
        )

        manuscript_json = temp_project_dir / "1" / "manuscript.json"
        assert manuscript_json.exists()
