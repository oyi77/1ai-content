"""API + engine tests for the interactive router (/video/interactive).

InteractiveEngine is stubbed via ``di._instances`` so routing / validation /
passthrough tests avoid writing real manifests; engine-level tests exercise the
real class directly (pure python, no network).
"""
import json
import os

import pytest

import services.di as di
from services.interactive.engine import InteractiveEngine


class _StubInteractive:
    def build(self, **kwargs):
        return {
            "success": True,
            "manifest_path": "/tmp/interactive_stub/manifest.json",
            "title": kwargs.get("title"),
            "nodes": kwargs.get("nodes"),
            "reachable": kwargs.get("nodes"),
            "kwargs": kwargs,
        }


@pytest.fixture
def stub_interactive(monkeypatch):
    stub = _StubInteractive()
    monkeypatch.setitem(di._instances, "interactive", stub)
    return stub


def test_build_missing_fields_returns_422(client):
    resp = client.post("/video/interactive", json={})
    assert resp.status_code == 422


def test_build_success_passthrough(client, stub_interactive):
    resp = client.post(
        "/video/interactive",
        json={
            "title": "My Branching Story",
            "start_id": "A",
            "nodes": [
                {"id": "A", "text": "Start", "choices": ["B"]},
                {"id": "B", "text": "End", "choices": [], "media": "clip.mp4"},
            ],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["kwargs"]["title"] == "My Branching Story"
    assert body["kwargs"]["start_id"] == "A"
    assert [n["id"] for n in body["kwargs"]["nodes"]] == ["A", "B"]
    assert body["kwargs"]["output_dir"] is None


def test_build_defaults_forwarded(client, stub_interactive):
    resp = client.post(
        "/video/interactive",
        json={"title": "t", "start_id": "A", "nodes": [{"id": "A", "text": "x"}]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["kwargs"]["output_dir"] is None
    assert body["kwargs"]["title"] == "t"
    assert body["kwargs"]["start_id"] == "A"


def test_validate_graph_ok():
    engine = InteractiveEngine()
    nodes = [
        {"id": "A", "text": "Start", "choices": ["B"]},
        {"id": "B", "text": "End", "choices": [], "media": "clip.mp4"},
    ]
    assert engine.validate_graph("A", nodes) == []


def test_validate_graph_dangling_choice():
    engine = InteractiveEngine()
    nodes = [
        {"id": "A", "text": "Start", "choices": ["B"]},
        {"id": "B", "text": "Mid", "choices": ["C"]},
        {"id": "D", "text": "Unrelated", "choices": []},
    ]
    errors = engine.validate_graph("A", nodes)
    assert any("C" in e for e in errors)


def test_build_dangling_target_returns_failure():
    engine = InteractiveEngine()
    nodes = [
        {"id": "A", "text": "Start", "choices": ["B"]},
        {"id": "B", "text": "Mid", "choices": ["C"]},
        {"id": "D", "text": "Unrelated", "choices": []},
    ]
    result = engine.build("t", "A", nodes)
    assert result["success"] is False
    assert isinstance(result["errors"], list)
    assert any("C" in e for e in result["errors"])


def test_build_valid_graph_writes_manifest(tmp_path):
    engine = InteractiveEngine()
    nodes = [
        {"id": "A", "text": "Start", "choices": ["B"]},
        {"id": "B", "text": "End", "choices": [], "media": "clip.mp4"},
    ]
    result = engine.build("My Story", "A", nodes, output_dir=str(tmp_path))
    assert result["success"] is True
    assert result["title"] == "My Story"
    assert result["nodes"] == 2
    assert result["reachable"] == 2

    manifest_path = result["manifest_path"]
    assert os.path.isfile(manifest_path)
    with open(manifest_path, "r", encoding="utf-8") as fh:
        manifest = json.load(fh)
    assert manifest["format"] == "interactive/v1"
    assert manifest["title"] == "My Story"
    assert manifest["start_id"] == "A"
    assert len(manifest["nodes"]) == 2