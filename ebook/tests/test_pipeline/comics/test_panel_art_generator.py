import io
import pytest
from pathlib import Path
from unittest.mock import MagicMock, patch
from PIL import Image

from src.pipeline.comics.panel_art_generator import PanelArtGenerator
from src.pipeline.comics.character_sheet import CharacterSheet


def _png_bytes(w=64, h=64) -> bytes:
    img = Image.new("RGB", (w, h), color=(100, 100, 100))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


@pytest.fixture
def mock_ai():
    client = MagicMock()
    client.generate_image = MagicMock(return_value=_png_bytes())
    return client


@pytest.fixture
def char_sheet():
    sheet = CharacterSheet()
    sheet.build_from_script(
        {
            "characters": [
                {
                    "name": "Akira",
                    "visual_description": "tall, spiky hair",
                    "role": "protagonist",
                }
            ]
        }
    )
    return sheet


@pytest.fixture
def sample_panel():
    return {
        "panel_id": "ch1-p1-pan1",
        "scene_description": "Hero stands on rooftop",
        "characters_present": ["Akira"],
        "framing": "wide_shot",
    }


def test_panel_cached_if_exists(mock_ai, char_sheet, sample_panel, tmp_path):
    panels_dir = tmp_path / "panels"
    panels_dir.mkdir()
    # Pre-create the panel file
    existing = panels_dir / "ch1-p1-pan1.png"
    existing.write_bytes(_png_bytes())

    gen = PanelArtGenerator(ai_client=mock_ai, max_workers=1)
    page = {"panels": [sample_panel]}
    gen.generate_page_panels(page, char_sheet, "manga", panels_dir)

    # generate_image should NOT be called because file already exists
    mock_ai.generate_image.assert_not_called()


def test_fallback_creates_valid_png(char_sheet, sample_panel, tmp_path):
    failing_client = MagicMock()
    failing_client.generate_image = MagicMock(side_effect=Exception("API error"))

    gen = PanelArtGenerator(ai_client=failing_client, max_workers=1)
    page = {"panels": [sample_panel]}
    panels_dir = tmp_path / "panels"
    result = gen.generate_page_panels(page, char_sheet, "manga", panels_dir)

    panel_path = result["ch1-p1-pan1"]
    assert panel_path.exists()
    # Must be openable as a valid image
    img = Image.open(panel_path)
    assert img.size[0] > 0


def test_fallback_image_correct_dimensions(char_sheet, sample_panel, tmp_path):
    failing_client = MagicMock()
    failing_client.generate_image = MagicMock(side_effect=Exception("fail"))

    gen = PanelArtGenerator(ai_client=failing_client, max_workers=1)
    placeholder = gen._make_placeholder(sample_panel, tmp_path / "panels")
    img = Image.open(placeholder)
    assert img.size == (400, 300)


def test_style_prompt_contains_format_keywords(
    mock_ai, char_sheet, sample_panel, tmp_path
):
    gen = PanelArtGenerator(ai_client=mock_ai, max_workers=1)
    page = {"panels": [sample_panel]}
    gen.generate_page_panels(page, char_sheet, "manga", tmp_path / "panels")

    call_args = mock_ai.generate_image.call_args
    prompt = call_args[1].get("prompt") or call_args[0][0]
    assert "manga" in prompt.lower() or "japanese" in prompt.lower()


def test_parallel_failure_uses_placeholder(char_sheet, tmp_path):
    panels = [
        {
            "panel_id": f"ch1-p1-pan{i}",
            "scene_description": f"Scene {i}",
            "characters_present": [],
            "framing": "medium",
        }
        for i in range(3)
    ]

    call_count = [0]

    def selective_fail(prompt):
        call_count[0] += 1
        if call_count[0] == 2:
            raise RuntimeError("simulated API error")
        return _png_bytes()

    client = MagicMock()
    client.generate_image = MagicMock(side_effect=selective_fail)

    gen = PanelArtGenerator(ai_client=client, max_workers=2)
    page = {"panels": panels}
    result = gen.generate_page_panels(page, char_sheet, "comics", tmp_path / "panels")

    # All 3 panels should have been produced (2 real + 1 fallback)
    assert len(result) == 3
    for panel_id, path in result.items():
        assert path.exists(), f"Missing: {panel_id}"
