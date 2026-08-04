"""API tests for the meme router (/meme/generate).

NOTE: services.api_models.MemeRequest currently defaults ``top_text=""``, so
``json={}`` validates (200 once the router is wired). The 422 validation test
uses ``{"top_text": None}`` (None is invalid for a str field), which is green
under the current model and would also be green if top_text ever becomes
required.
"""
from pathlib import Path

import pytest

import services.di as di


class _StubMeme:
    def generate(self, **kwargs):
        return {
            "success": True,
            "image_path": "/tmp/meme_stub.png",
            "template_id": kwargs.get("template_id"),
            "width": 800,
            "height": 600,
            "image_url": bool(kwargs.get("image_url")),
            "kwargs": kwargs,
        }


@pytest.fixture
def stub_meme(monkeypatch):
    stub = _StubMeme()
    monkeypatch.setitem(di._instances, "meme", stub)
    return stub


def test_generate_null_top_text_returns_422(client):
    resp = client.post("/meme/generate", json={"top_text": None})
    assert resp.status_code == 422


def test_generate_success_passthrough(client, stub_meme):
    resp = client.post(
        "/meme/generate",
        json={
            "template_id": "galaxy",
            "top_text": "When the test passes",
            "bottom_text": "first try",
            "image_url": "https://example.com/img.png",
            "output_dir": "/tmp/meme_out",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["image_path"] == "/tmp/meme_stub.png"
    assert body["kwargs"]["template_id"] == "galaxy"
    assert body["kwargs"]["top_text"] == "When the test passes"
    assert body["kwargs"]["bottom_text"] == "first try"
    assert body["kwargs"]["image_url"] == "https://example.com/img.png"
    assert body["kwargs"]["output_dir"] == "/tmp/meme_out"


def test_generate_defaults_forwarded(client, stub_meme):
    resp = client.post("/meme/generate", json={"top_text": "t"})
    assert resp.status_code == 200
    kwargs = resp.json()["kwargs"]
    assert kwargs["template_id"] == "default"
    assert kwargs["top_text"] == "t"
    assert kwargs["bottom_text"] == ""
    assert kwargs["image_url"] is None
    assert kwargs["output_dir"] is None


def test_engine_generate_renders_png(tmp_path):
    from services.meme.engine import MemeEngine

    eng = MemeEngine()
    result = eng.generate(
        template_id="default",
        top_text="A",
        bottom_text="B",
        output_dir=str(tmp_path),
    )
    assert result["success"] is True
    assert result["template_id"] == "default"
    assert result["width"] == 800
    assert result["height"] == 600
    assert result["image_url"] is False
    assert Path(result["image_path"]).exists()
    assert Path(result["image_path"]).stat().st_size > 0
