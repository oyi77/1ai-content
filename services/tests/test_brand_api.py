"""REST API tests for the /brand/* endpoints (router: services/routers/brand.py).

The BrandSettings service is an in-memory dict keyed by user_id — cheap to
instantiate, so unlike clipper/faceless we use the REAL service but install a
fresh instance per test (via monkeypatch.setitem on di._instances) for isolation.
The /brand/watermark overlay path degrades to a `cp` copy when the brand has no
watermark configured, and runs a real ffmpeg overlay otherwise.
"""

import shutil

import pytest

import services.di as di
from services.brand import BrandSettings

pytestmark = pytest.mark.usefixtures("client")


@pytest.fixture
def brand() -> BrandSettings:
    instance = BrandSettings()
    # Force the lazy DI getter to return this fresh instance.
    di._instances["brand"] = instance
    return instance


@pytest.fixture
def user_id() -> str:
    return "157228659"


def _set(instance: BrandSettings, user_id: str, **kwargs):
    result = instance.set_brand(user_id, kwargs)
    assert result["success"] is True
    return result


def test_set_and_get_brand(client, brand, user_id):
    _set(brand, user_id, name="Acme", primary_color="#FF6B35")
    resp = client.get(f"/brand/{user_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["success"] is True
    assert data["user_id"] == user_id
    assert data["settings"]["name"] == "Acme"
    assert data["settings"]["primary_color"] == "#FF6B35"


def test_get_brand_missing_returns_404(client, brand, user_id):
    resp = client.get("/brand/000000000")
    assert resp.status_code == 404
    assert resp.json()["detail"] == "No brand settings"


def test_set_brand_defaults(client, brand, user_id):
    _set(brand, user_id)
    resp = client.get(f"/brand/{user_id}")
    data = resp.json()["settings"]
    assert data["name"] == ""
    assert data["logo_path"] is None
    assert data["watermark_path"] is None
    assert data["primary_color"] == "#FF6B35"
    assert data["secondary_color"] == "#004E89"
    assert data["font_style"] == "default"
    assert data["tagline"] == ""
    assert data["platforms"] == []


def test_set_brand_missing_user_id_returns_422(client, brand):
    resp = client.post("/brand/set", json={})
    assert resp.status_code == 422


def test_apply_watermark_without_watermark_copies(client, brand, user_id, tmp_path):
    """No watermark configured -> apply_watermark does a plain `cp` copy."""
    source = tmp_path / "source.mp4"
    source.write_bytes(b"FAKE-VIDEO-BYTES")
    output = tmp_path / "output.mp4"
    result = brand.apply_watermark(str(source), user_id, str(output))
    assert result == str(output)
    assert output.read_bytes() == b"FAKE-VIDEO-BYTES"


@pytest.mark.skipif(
    shutil.which("ffmpeg") is None,
    reason="ffmpeg not available",
)
def test_apply_watermark_with_watermark_overlays(client, brand, user_id, tmp_path):
    """With a watermark configured, a real ffmpeg overlay runs to completion."""
    import subprocess

    video = tmp_path / "video.mp4"
    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "lavfi", "-i",
            "testsrc=duration=1:size=320x240:rate=10",
            "-pix_fmt", "yuv420p", str(video),
        ],
        check=True,
        capture_output=True,
    )
    watermark = tmp_path / "watermark.png"
    subprocess.run(
        [
            "ffmpeg", "-y", "-f", "lavfi", "-i",
            "color=c=red@0.5:size=64x64,format=rgba",
            "-frames:v", "1", str(watermark),
        ],
        check=True,
        capture_output=True,
    )

    _set(brand, user_id, watermark_path=str(watermark))
    output = tmp_path / "output.mp4"
    result = brand.apply_watermark(str(video), user_id, str(output))
    assert result == str(output)
    assert output.exists()
    assert output.stat().st_size > 0