import pytest
from unittest.mock import MagicMock, patch


@pytest.fixture
def mock_ai_client():
    client = MagicMock()
    client.generate_structured = MagicMock(
        return_value={
            "titles": [
                "The Blogging Playbook",
                "Blogging Mastery",
                "The Complete Guide",
            ],
            "subtitles": [
                "A Practical Guide",
                "From Zero to Hero",
                "Everything You Need",
            ],
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
    )
    return client


def test_generate_outline_returns_structure(mock_ai_client):
    from src.pipeline.outline_generator import OutlineGenerator

    generator = OutlineGenerator(mock_ai_client)
    outline = generator.generate(
        project_brief={"id": 1, "idea": "Test", "chapter_count": 5},
        strategy={"audience": "test", "tone": "conversational", "positioning": "test"},
        chapter_count=5,
    )

    assert "titles" in outline
    assert "chapters" in outline
    assert len(outline["chapters"]) == 2


def test_outline_chapter_count_matches(test_db_path):
    from src.ai_client import OmnirouteClient
    from src.pipeline.outline_generator import OutlineGenerator

    client = OmnirouteClient(base_url="http://test/v1")
    with patch.object(client.client, "chat") as mock:
        mock.completions.create.return_value = MagicMock(
            choices=[
                MagicMock(
                    message=MagicMock(
                        content='{"titles": ["Test"], "subtitles": ["Test"], "best_title": "Test", "best_subtitle": "Test", "chapters": [{"title": "Ch1", "summary": "Summary", "subchapters": [], "estimated_word_count": 500}, {"title": "Ch2", "summary": "Summary", "subchapters": [], "estimated_word_count": 500}, {"title": "Ch3", "summary": "Summary", "subchapters": [], "estimated_word_count": 500}]}'
                    )
                )
            ]
        )
        generator = OutlineGenerator(client)
        outline = generator.generate(
            project_brief={"id": 1, "idea": "Test"},
            strategy={"audience": "test", "tone": "test", "positioning": "test"},
            chapter_count=3,
        )
        assert len(outline["chapters"]) == 3


def test_toc_md_generated(test_db_path, temp_project_dir):
    from src.ai_client import OmnirouteClient
    from src.pipeline.outline_generator import OutlineGenerator
    from src.db.repository import ProjectRepository

    repo = ProjectRepository(test_db_path)
    project_id = repo.create_project(
        title="Test", idea="Test idea", product_mode="lead_magnet"
    )

    client = OmnirouteClient(base_url="http://test/v1")
    with patch.object(client.client, "chat") as mock:
        mock.completions.create.return_value = MagicMock(
            choices=[
                MagicMock(
                    message=MagicMock(
                        content='{"titles": ["Test"], "subtitles": ["Test"], "best_title": "Test", "best_subtitle": "Test", "chapters": [{"title": "Ch1", "summary": "Summary", "subchapters": ["S1"], "estimated_word_count": 500}]}'
                    )
                )
            ]
        )
        generator = OutlineGenerator(client, projects_dir=temp_project_dir)
        generator.generate(
            project_brief={"id": project_id, "idea": "Test"},
            strategy={"audience": "test", "tone": "test", "positioning": "test"},
            chapter_count=1,
        )

        toc_file = temp_project_dir / str(project_id) / "toc.md"
        assert toc_file.exists()
