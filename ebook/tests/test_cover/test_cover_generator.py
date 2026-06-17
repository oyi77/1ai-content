import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path


def test_cover_prompt_generated():
    from src.cover.cover_generator import CoverGenerator
    from src.ai_client import OmnirouteClient

    client = OmnirouteClient(base_url="http://test/v1")
    with patch.object(client.client, "chat") as mock:
        mock.completions.create.return_value = MagicMock(
            choices=[
                MagicMock(
                    message=MagicMock(
                        content="Abstract business growth visualization with ascending geometric shapes in navy blue"
                    )
                )
            ]
        )
        generator = CoverGenerator(client)
        prompt = generator.generate_prompt(
            title="Growth Strategy",
            topic="Business",
            tone="authoritative",
            product_mode="paid_ebook",
        )
        assert "abstract" in prompt.lower() or "visualization" in prompt.lower()


def test_cover_png_generated(temp_project_dir):
    from src.ai_client import OmnirouteClient
    from src.cover.cover_generator import CoverGenerator

    client = OmnirouteClient(base_url="http://test/v1")
    with patch.object(client.client, "chat") as mock:
        mock.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Test cover prompt"))]
        )
        generator = CoverGenerator(client, projects_dir=temp_project_dir)
        generator.generate(
            project_id=1,
            title="Test Ebook",
            topic="Business",
            tone="authoritative",
            product_mode="paid_ebook",
        )

        cover_file = temp_project_dir / "1" / "cover" / "cover.png"
        assert cover_file.exists()


def test_brief_json_created(temp_project_dir):
    from src.ai_client import OmnirouteClient
    from src.cover.cover_generator import CoverGenerator

    client = OmnirouteClient(base_url="http://test/v1")
    with patch.object(client.client, "chat") as mock:
        mock.completions.create.return_value = MagicMock(
            choices=[MagicMock(message=MagicMock(content="Test prompt"))]
        )
        generator = CoverGenerator(client, projects_dir=temp_project_dir)
        generator.generate(
            project_id=1,
            title="Test",
            topic="Test",
            tone="test",
            product_mode="lead_magnet",
        )

        brief_file = temp_project_dir / "1" / "cover" / "brief.json"
        assert brief_file.exists()
