import json
import pytest
from pathlib import Path
from services.ebook.pipeline.comics.character_sheet import Character, CharacterSheet


@pytest.fixture
def sample_script():
    return {
        "characters": [
            {
                "name": "Akira",
                "visual_description": "tall, dark spiky hair, red jacket",
                "role": "protagonist",
            },
            {
                "name": "Villain",
                "visual_description": "pale, long white hair, black coat",
                "role": "antagonist",
            },
        ],
        "chapters": [],
    }


def test_build_from_script_extracts_characters(sample_script):
    sheet = CharacterSheet()
    sheet.build_from_script(sample_script)
    assert "Akira" in sheet.characters
    assert "Villain" in sheet.characters
    assert sheet.characters["Akira"].role == "protagonist"


def test_panel_prompt_context_contains_descriptions(sample_script):
    sheet = CharacterSheet()
    sheet.build_from_script(sample_script)
    ctx = sheet.get_panel_prompt_context(["Akira"])
    assert "Akira" in ctx
    assert "spiky hair" in ctx


def test_missing_character_gracefully_omitted(sample_script):
    sheet = CharacterSheet()
    sheet.build_from_script(sample_script)
    # "Unknown" not in sheet — should not raise, just omit
    ctx = sheet.get_panel_prompt_context(["Unknown"])
    assert ctx == ""


def test_save_load_roundtrip(sample_script, tmp_path):
    sheet = CharacterSheet()
    sheet.build_from_script(sample_script)
    save_path = tmp_path / "character_sheet.json"
    sheet.save(save_path)

    loaded = CharacterSheet()
    loaded.load(save_path)
    assert (
        loaded.characters["Akira"].visual_description
        == sheet.characters["Akira"].visual_description
    )
    assert loaded.characters["Villain"].role == "antagonist"
