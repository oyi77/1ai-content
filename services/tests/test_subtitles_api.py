"""API tests for the subtitles router (/video/subtitles).

Includes an engine-level pure test for build_ffmpeg_cmd that never touches
subprocesses or the network.
"""
import pytest

import services.di as di
from services.subtitles.engine import SubtitlesEngine, _escape_drawtext


class _StubSubtitles:
    def burn(self, **kwargs):
        return {
            "success": True,
            "output_path": "/tmp/out_captioned.mp4",
            "segments": len(kwargs.get("segments") or []),
            "style": kwargs.get("style"),
            "ffmpeg_cmd": ["ffmpeg", "-y"],
            "kwargs": kwargs,
        }


@pytest.fixture
def stub_subtitles(monkeypatch):
    stub = _StubSubtitles()
    monkeypatch.setitem(di._instances, "subtitles", stub)
    return stub


def test_burn_missing_fields_returns_422(client):
    resp = client.post("/video/subtitles", json={})
    assert resp.status_code == 422


def test_burn_success_passthrough(client, stub_subtitles):
    resp = client.post(
        "/video/subtitles",
        json={
            "video_path": "/tmp/in.mp4",
            "segments": [
                {"start": 0.0, "end": 2.0, "text": "Hello world"},
                {"start": 2.0, "end": 4.5, "text": "Second line", "style": "highlight"},
            ],
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    assert body["segments"] == 2
    kwargs = body["kwargs"]
    assert kwargs["video_path"] == "/tmp/in.mp4"
    segs = kwargs["segments"]
    assert segs[0] == {"start": 0.0, "end": 2.0, "text": "Hello world", "style": None}
    assert segs[1]["style"] == "highlight"
    assert segs[1]["text"] == "Second line"


def test_burn_defaults_forwarded(client, stub_subtitles):
    resp = client.post(
        "/video/subtitles",
        json={
            "video_path": "/tmp/in.mp4",
            "segments": [{"start": 0, "end": 1, "text": "t"}],
        },
    )
    assert resp.status_code == 200
    kwargs = resp.json()["kwargs"]
    assert kwargs["style"] == "default"
    assert kwargs["font_size"] == 24
    assert kwargs["output_dir"] is None


def test_build_ffmpeg_cmd_pure():
    """Pure builder: no subprocess, escapes text, defaults output naming."""
    eng = SubtitlesEngine()
    cmd = eng.build_ffmpeg_cmd(
        "/tmp/input.mp4",
        [{"start": 0.0, "end": 2.5, "text": "Hello, world!"}],
        style="default",
        font_size=24,
    )
    assert cmd[0] == "ffmpeg"
    assert "-i" in cmd
    vf = cmd[cmd.index("-vf") + 1]
    assert "drawtext=" in vf
    assert "Hello" in vf
    assert "\\," in vf  # comma escaped inside the filter value
    assert "between(t,0,2.5)" in vf
    assert cmd[-1].endswith("_captioned.mp4")


def test_escape_drawtext_pure():
    assert _escape_drawtext("plain text") == "plain text"
    assert _escape_drawtext("a,b:c") == "a\\,b\\:c"
    assert _escape_drawtext("it's") == "it'\\''s"
    assert _escape_drawtext("a\\b") == "a\\\\b"


def test_build_ffmpeg_cmd_per_segment_style():
    eng = SubtitlesEngine()
    cmd = eng.build_ffmpeg_cmd(
        "/tmp/input.mp4",
        [
            {"start": 0.0, "end": 1.0, "text": "one"},
            {"start": 1.0, "end": 2.0, "text": "two", "style": "caption"},
        ],
        style="default",
        font_size=20,
    )
    vf = cmd[cmd.index("-vf") + 1]
    filters = vf.split(",")
    # caption style scales fontsize x1.2 and moves y
    assert any("fontsize=24" in f and "y=h*0.6" in f for f in filters)
    # default style keeps the bottom position
    assert any("fontsize=20" in f and "y=h-th-80" in f for f in filters)
