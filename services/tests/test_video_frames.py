"""Tests for POST /video/frames — content-factory reference frame extraction."""
import os
import subprocess

import pytest
from fastapi import status

FFMPEG = "/usr/bin/ffmpeg"


@pytest.fixture(scope="module")
def sample_video(tmp_path_factory):
    """Synthetic 16:9 test video (testsrc + sine tone), ~4s."""
    path = str(tmp_path_factory.mktemp("frames") / "src.mp4")
    subprocess.run(
        [
            FFMPEG, "-y",
            "-f", "lavfi", "-i", "testsrc=duration=4:size=640x360:rate=30",
            "-f", "lavfi", "-i", "sine=frequency=440:duration=4",
            "-c:v", "libx264", "-crf", "28", "-preset", "ultrafast",
            "-c:a", "aac", "-b:a", "64k",
            "-pix_fmt", "yuv420p", "-shortest",
            path,
        ],
        capture_output=True, text=True, check=True,
    )
    return path


def test_video_frames_extracts_n_frames(client, sample_video, tmp_path):
    """POST /video/frames returns N evenly-spaced frames at k*duration/(N+1)."""
    out_dir = str(tmp_path / "out")
    resp = client.post(
        "/video/frames",
        json={"file_path": sample_video, "num_frames": 3, "output_dir": out_dir},
    )
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()["data"]
    assert data["status"] == "ok"
    assert data["num_frames"] == 3

    frames = data["frames"]
    assert len(frames) == 3
    for idx, fr in enumerate(frames, start=1):
        assert fr["index"] == idx
        assert fr["timestamp"] > 0
        assert fr["file_path"].endswith(".jpg")
        assert os.path.isfile(fr["file_path"]), f"frame file missing: {fr['file_path']}"
        assert os.path.getsize(fr["file_path"]) > 1000, "frame file has no image content"

    # Timestamps at k*duration/(N+1): 1.0, 2.0, 3.0 for a 4s video with N=3
    assert frames[0]["timestamp"] == pytest.approx(1.0, abs=0.05)
    assert frames[1]["timestamp"] == pytest.approx(2.0, abs=0.05)
    assert frames[2]["timestamp"] == pytest.approx(3.0, abs=0.05)


def test_video_frames_defaults_to_five(client, sample_video):
    """num_frames defaults to 5 when omitted."""
    resp = client.post("/video/frames", json={"file_path": sample_video})
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()["data"]
    assert data["status"] == "ok"
    assert data["num_frames"] == 5
    assert len(data["frames"]) == 5


def test_video_frames_missing_file_404(client):
    """A non-existent local file returns 404 before any ffmpeg work."""
    resp = client.post(
        "/video/frames",
        json={"file_path": "/no/such/file.mp4", "num_frames": 2},
    )
    assert resp.status_code == status.HTTP_404_NOT_FOUND


def test_video_frames_rejects_zero(client, sample_video):
    """num_frames < 1 is a 400 validation error."""
    resp = client.post(
        "/video/frames",
        json={"file_path": sample_video, "num_frames": 0},
    )
    assert resp.status_code == status.HTTP_400_BAD_REQUEST
