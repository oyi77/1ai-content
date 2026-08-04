"""API tests for the screenrec router (/video/screen-rec)."""
import pytest

import services.di as di
from services.screenrec.engine import ScreenRecEngine


class _StubScreenRec:
    def capture(self, **kwargs):
        return {
            "success": True,
            "video_path": "/tmp/screen_rec_stub.mp4",
            "duration": kwargs.get("duration"),
            "fps": kwargs.get("fps"),
            "narration": bool(kwargs.get("narration")),
            "region": kwargs.get("region"),
            "kwargs": kwargs,
        }


@pytest.fixture
def stub_screenrec(monkeypatch):
    stub = _StubScreenRec()
    monkeypatch.setitem(di._instances, "screenrec", stub)
    return stub


def test_capture_constraint_violation_returns_422(client):
    # NOTE: every ScreenRecRequest field has a default, so json={} is VALID
    # (200 via stub). The 422 case is the constraint violation: duration=0
    # breaks ge=1.
    resp = client.post("/video/screen-rec", json={"duration": 0})
    assert resp.status_code == 422


def test_capture_empty_body_ok_via_stub(client, stub_screenrec):
    # json={} is accepted (all defaults) and forwarded to the engine.
    resp = client.post("/video/screen-rec", json={})
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    kwargs = body["kwargs"]
    assert kwargs["duration"] == 10
    assert kwargs["region"] is None
    assert kwargs["fps"] == 15
    assert kwargs["narration"] is None
    assert kwargs["voice"] is None
    assert kwargs["allow_headless"] is False
    assert kwargs["output_dir"] is None


def test_capture_success_passthrough(client, stub_screenrec):
    resp = client.post(
        "/video/screen-rec",
        json={
            "duration": 30,
            "region": "800x600+10+20",
            "fps": 30,
            "narration": "hello",
            "voice": "id-ID-GadisNeural",
            "allow_headless": True,
            "output_dir": "/tmp/rec",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["success"] is True
    kwargs = body["kwargs"]
    assert kwargs["duration"] == 30
    assert kwargs["region"] == "800x600+10+20"
    assert kwargs["fps"] == 30
    assert kwargs["narration"] == "hello"
    assert kwargs["voice"] == "id-ID-GadisNeural"
    assert kwargs["allow_headless"] is True
    assert kwargs["output_dir"] == "/tmp/rec"


def test_build_ffmpeg_cmd_pure():
    # Engine-level pure builder: no subprocess, no display required.
    # x11grab takes the offset attached to the display (`-i <display>+<x>,<y>`),
    # so "contains" is checked as a substring across tokens (DISPLAY may be set).
    eng = ScreenRecEngine()
    cmd = eng.build_ffmpeg_cmd(10, fps=15, region="800x600+10+20")
    assert "-video_size" in cmd
    assert "800x600" in cmd
    assert any("+10,20" in token for token in cmd)
    assert "-t" in cmd
    assert "10" in cmd
    assert "-f" in cmd
    assert "x11grab" in cmd
    # region-less default: size from env SCREENREC_SIZE or 1280x720, offset +0,0
    cmd2 = eng.build_ffmpeg_cmd(5)
    assert "1280x720" in cmd2
    assert any("+0,0" in token for token in cmd2)
