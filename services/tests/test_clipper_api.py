"""API tests for the clipper router (/clipper/clip).

ClipperEngine.__init__ loads a whisper Transcriber (heavy), so the engine is
stubbed via ``di._instances`` before any request — this keeps routing /
validation / passthrough coverage without instantiating the real engine.
"""
import pytest

import services.di as di


class _StubClipper:
    def clip_video(self, **kwargs):
        return {
            "success": True,
            "index": 0,
            "clip_path": "/tmp/c0.mp4",
            "thumbnail_path": "/tmp/c0.jpg",
            "start": 0.0,
            "end": 60.0,
            "duration": 60.0,
            "kwargs": kwargs,
        }


@pytest.fixture
def stub_clipper(monkeypatch):
    stub = _StubClipper()
    monkeypatch.setitem(di._instances, "clipper", stub)
    return stub


def test_clip_missing_source_returns_422(client):
    resp = client.post("/clipper/clip", json={})
    assert resp.status_code == 422


def test_clip_success_passthrough(client, stub_clipper):
    resp = client.post(
        "/clipper/clip",
        json={
            "source": "/tmp/input.mp4",
            "num_clips": 3,
            "clip_duration": 30,
            "platform": "tiktok",
            "language": "id",
            "reframe_vertical": True,
            "add_subtitles": True,
            "add_thumbnails": False,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["clip_path"] == "/tmp/c0.mp4"
    assert body["duration"] == 60.0
    # kwargs must be forwarded verbatim to the engine
    assert body["kwargs"]["source"] == "/tmp/input.mp4"
    assert body["kwargs"]["num_clips"] == 3
    assert body["kwargs"]["clip_duration"] == 30
    assert body["kwargs"]["add_thumbnails"] is False


def test_clip_defaults_forwarded(client, stub_clipper):
    resp = client.post("/clipper/clip", json={"source": "/tmp/input.mp4"})
    assert resp.status_code == 200
    kwargs = resp.json()["kwargs"]
    assert kwargs["num_clips"] == 5
    assert kwargs["clip_duration"] == 60
    assert kwargs["platform"] == "tiktok"
    assert kwargs["language"] is None
    assert kwargs["reframe_vertical"] is True
    assert kwargs["add_subtitles"] is True
    assert kwargs["add_thumbnails"] is True
