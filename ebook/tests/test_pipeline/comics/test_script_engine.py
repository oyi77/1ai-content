import json
import pytest
from pathlib import Path
from unittest.mock import MagicMock

from src.pipeline.comics.script_engine import ComicsScriptEngine, PANEL_SCHEMA


@pytest.fixture
def mock_script_response():
    """Minimal valid script chapter with all PANEL_SCHEMA fields."""
    return {
        "number": 1,
        "title": "The Beginning",
        "pages": [
            {
                "page_number": 1,
                "layout": "2x2",
                "panels": [
                    {
                        "panel_id": "ch1-p1-pan1",
                        "scene_description": "Wide shot of a city rooftop at dusk",
                        "characters_present": ["Akira"],
                        "dialogue": [
                            {
                                "character": "Akira",
                                "text": "I must protect them.",
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


@pytest.fixture
def engine(tmp_path, mock_script_response):
    client = MagicMock()
    client.generate_structured = MagicMock(
        side_effect=[
            # First call: characters
            {
                "characters": [
                    {
                        "name": "Akira",
                        "visual_description": "spiky black hair, red jacket",
                        "role": "protagonist",
                    }
                ]
            },
            # Subsequent calls: chapter scripts
            mock_script_response,
        ]
    )
    return ComicsScriptEngine(ai_client=client, projects_dir=tmp_path), client


@pytest.fixture
def project_brief():
    return {
        "id": 1,
        "idea": "A hero fights to save his city",
        "product_mode": "manga",
        "chapter_count": 1,
        "pages_per_chapter": 1,
        "panel_layout": "2x2",
    }


@pytest.fixture
def strategy():
    return {"audience": "teens and young adults", "promise": "Epic hero's journey"}


def test_script_has_required_fields(engine, project_brief, strategy):
    eng, _ = engine
    script = eng.generate(project_brief, strategy)
    assert "title" in script
    assert "format" in script
    assert "characters" in script
    assert "chapters" in script
    # Check first panel has all PANEL_SCHEMA keys
    panel = script["chapters"][0]["pages"][0]["panels"][0]
    for key in PANEL_SCHEMA:
        assert key in panel, f"Missing panel key: {key}"


def test_panels_have_scene_descriptions(engine, project_brief, strategy):
    eng, _ = engine
    script = eng.generate(project_brief, strategy)
    panel = script["chapters"][0]["pages"][0]["panels"][0]
    assert len(panel["scene_description"]) > 0


def test_dialogue_structure_valid(engine, project_brief, strategy):
    eng, _ = engine
    script = eng.generate(project_brief, strategy)
    panel = script["chapters"][0]["pages"][0]["panels"][0]
    for dlg in panel["dialogue"]:
        assert "character" in dlg
        assert "text" in dlg
        assert "is_sfx" in dlg


def test_manga_format_recorded_in_script(engine, project_brief, strategy):
    eng, _ = engine
    script = eng.generate(project_brief, strategy)
    assert script["format"] == "manga"


def test_script_saved_to_disk(engine, project_brief, strategy, tmp_path):
    eng, _ = engine
    eng.generate(project_brief, strategy)
    script_file = tmp_path / "1" / "script.json"
    assert script_file.exists()
    data = json.loads(script_file.read_text())
    assert data["format"] == "manga"
