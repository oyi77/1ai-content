"""API tests for the infographic router (/infographic/generate).

Also includes an engine-level Pillow render test (no network).
"""
import os

import pytest

import services.di as di


class _StubInfographic:
    def generate(self, **kwargs):
        return {
            "success": True,
            "image_path": "/tmp/infographic.png",
            "width": 1200,
            "height": 1600,
            "data_points": len(kwargs.get("data_points", [])),
            "chart_kind": kwargs.get("chart_kind"),
            "theme": kwargs.get("theme"),
            "kwargs": kwargs,
        }


@pytest.fixture
def stub_infographic(monkeypatch):
    stub = _StubInfographic()
    monkeypatch.setitem(di._instances, "infographic", stub)
    return stub


def test_generate_missing_fields_returns_422(client):
    resp = client.post("/infographic/generate", json={})
    assert resp.status_code == 422


def test_generate_success_passthrough(client, stub_infographic):
    resp = client.post(
        "/infographic/generate",
        json={
            "title": "Trafik Bulanan",
            "data_points": [
                {"label": "Jan", "value": 120},
                {"label": "Feb", "value": 90},
                {"label": "Mar", "value": 150},
            ],
            "chart_kind": "bar",
            "theme": "dark",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["kwargs"]["title"] == "Trafik Bulanan"
    assert len(body["kwargs"]["data_points"]) == 3
    assert body["kwargs"]["data_points"][2] == {"label": "Mar", "value": 150}
    assert body["kwargs"]["chart_kind"] == "bar"
    assert body["kwargs"]["theme"] == "dark"


def test_generate_defaults_forwarded(client, stub_infographic):
    resp = client.post(
        "/infographic/generate",
        json={"title": "Grafik", "data_points": [{"label": "A", "value": 1}]},
    )
    assert resp.status_code == 200
    kwargs = resp.json()["kwargs"]
    assert kwargs["chart_kind"] == "bar"
    assert kwargs["theme"] == "dark"
    assert kwargs["output_dir"] is None


def test_engine_render_png(tmp_path, client):
    """Engine-level render: pure Pillow, no network, always local."""
    from services.infographic.engine import InfographicEngine

    engine = InfographicEngine()
    result = engine.generate(
        title="Penjualan",
        data_points=[
            {"label": "Q1", "value": 250},
            {"label": "Q2", "value": 180},
            {"label": "Q3", "value": 420},
        ],
        chart_kind="bar",
        theme="dark",
        output_dir=str(tmp_path),
    )
    assert result["success"] is True
    assert os.path.exists(result["image_path"])
    assert result["width"] == 1200
    assert result["height"] == 1600
    assert result["data_points"] == 3
    assert result["chart_kind"] == "bar"
    assert result["theme"] == "dark"


def test_engine_raises_on_empty_data_points(tmp_path):
    from services.infographic.engine import InfographicEngine

    engine = InfographicEngine()
    with pytest.raises(RuntimeError):
        engine.generate(title="x", data_points=[], output_dir=str(tmp_path))