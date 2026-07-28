"""E2E comics pipeline tests — uses mocked AI client."""

import io
import json
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from PIL import Image

from services.ebook.pipeline.orchestrator import PipelineOrchestrator


def _png_bytes(w=64, h=64) -> bytes:
    img = Image.new("RGB", (w, h), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _make_mock_ai_client():
    client = MagicMock()
    client.generate_image = MagicMock(return_value=_png_bytes())

    # Script response: characters call
    char_response = {
        "characters": [
            {
                "name": "Hero",
                "visual_description": "tall, blue eyes, silver armor",
                "role": "protagonist",
            }
        ]
    }
    # Chapter script
    chapter_response = {
        "number": 1,
        "title": "The Beginning",
        "pages": [
            {
                "page_number": 1,
                "layout": "2x2",
                "panels": [
                    {
                        "panel_id": "ch1-p1-pan1",
                        "scene_description": "Hero stands on a hill",
                        "characters_present": ["Hero"],
                        "dialogue": [
                            {
                                "character": "Hero",
                                "text": "I am ready.",
                                "is_sfx": False,
                            }
                        ],
                        "sfx": [],
                        "framing": "wide_shot",
                        "panel_size": "normal",
                    }
                ],
            }
        ],
    }
    client.generate_structured = MagicMock(
        side_effect=[char_response, chapter_response]
    )
    client.generate_text = MagicMock(return_value="Generated text")
    return client


def test_comics_mode_routes_to_comics_orchestrator(tmp_path):
    """AC-10: manga product_mode routes to ComicsOrchestrator.run()"""
    from services.ebook.pipeline.comics.comics_orchestrator import ComicsOrchestrator

    db_path = tmp_path / "test.db"

    # Create project in DB manually
    import sqlite3
    from services.ebook.db.schema import create_tables

    conn = sqlite3.connect(str(db_path))
    create_tables(conn)
    conn.execute(
        "INSERT INTO projects (title, idea, product_mode, target_language, chapter_count, status) VALUES (?,?,?,?,?,?)",
        ("Test Manga", "A hero saves the world", "manga", "en", 1, "draft"),
    )
    conn.commit()
    conn.close()

    mock_client = _make_mock_ai_client()
    orchestrator = PipelineOrchestrator(
        db_path=str(db_path), projects_dir=str(tmp_path / "projects")
    )
    orchestrator.ai_client = mock_client

    with patch("services.ebook.pipeline.orchestrator.ComicsOrchestrator") as MockComics:
        mock_comics_instance = MagicMock()
        mock_comics_instance.run = MagicMock(
            return_value={"project_id": 1, "exports": {"cbz": "x.cbz"}}
        )
        MockComics.return_value = mock_comics_instance

        result = orchestrator.run_full_pipeline(1, on_progress=None)
        MockComics.assert_called_once()
        mock_comics_instance.run.assert_called_once_with(1, on_progress=None)


def test_e2e_manga_pipeline(tmp_path):
    """AC-11: manga mode -> script -> pages -> CBZ exists on disk"""
    from services.ebook.pipeline.comics.comics_orchestrator import ComicsOrchestrator

    db_path = tmp_path / "test.db"
    projects_dir = tmp_path / "projects"

    import sqlite3
    from services.ebook.db.schema import create_tables

    conn = sqlite3.connect(str(db_path))
    create_tables(conn)
    conn.execute(
        "INSERT INTO projects (title, idea, product_mode, target_language, chapter_count, status) VALUES (?,?,?,?,?,?)",
        ("Test Manga", "A hero saves the world", "manga", "en", 1, "draft"),
    )
    conn.commit()
    conn.close()

    mock_client = _make_mock_ai_client()
    orchestrator = ComicsOrchestrator(
        db_path=str(db_path),
        projects_dir=str(projects_dir),
        ai_client=mock_client,
    )

    result = orchestrator.run(project_id=1)

    assert "exports" in result
    cbz_path = Path(result["exports"]["cbz"])
    assert cbz_path.exists(), f"CBZ not found at {cbz_path}"
