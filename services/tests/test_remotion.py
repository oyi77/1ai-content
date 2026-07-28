"""Tests for the Remotion video renderer wrapper."""

import asyncio
import json
import os
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def test_module_constants_default():
    """REMOTION_DIR, RENDER_SCRIPT, OUTPUT_DIR resolve without env override."""
    import services.remotion
    import importlib
    importlib.reload(services.remotion)

    expected_base = (
        Path(__file__).resolve().parent.parent.parent / "remotion-ads"
    )
    assert services.remotion.REMOTION_DIR == expected_base
    assert services.remotion.RENDER_SCRIPT == expected_base / "src" / "render.ts"
    assert services.remotion.OUTPUT_DIR == expected_base / "output"


def test_module_constants_with_env():
    """REMOTION_DIR respects REMOTION_ADS_DIR env var."""
    os.environ["REMOTION_ADS_DIR"] = "/tmp/custom-remotion"
    import services.remotion  # noqa: F811
    import importlib
    importlib.reload(services.remotion)
    try:
        assert services.remotion.REMOTION_DIR == Path("/tmp/custom-remotion")
        assert services.remotion.OUTPUT_DIR == Path("/tmp/custom-remotion") / "output"
    finally:
        del os.environ["REMOTION_ADS_DIR"]
        importlib.reload(services.remotion)


@pytest.mark.asyncio
async def test_render_product_ad_success():
    """render_product_ad returns parsed result on success."""
    fake_result = {"success": True, "videoPath": "/tmp/test.mp4", "framesRendered": 60}
    fake_proc = AsyncMock()
    fake_proc.returncode = 0
    fake_proc.communicate = AsyncMock(
        return_value=(json.dumps(fake_result).encode(), b"")
    )

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=fake_proc)):
        from services.remotion import render_product_ad

        result = await render_product_ad(
            image_url="https://example.com/img.jpg",
            title="Test Product",
            category="electronics",
        )

    assert result == fake_result


@pytest.mark.asyncio
async def test_render_product_ad_with_all_params():
    """All optional parameters are mapped into the payload."""
    fake_result = {"success": True}
    fake_proc = AsyncMock()
    fake_proc.returncode = 0
    fake_proc.communicate = AsyncMock(
        return_value=(json.dumps(fake_result).encode(), b"")
    )

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=fake_proc)):
        from services.remotion import render_product_ad

        result = await render_product_ad(
            image_url="https://example.com/img.jpg",
            title="Premium Widget",
            category="home",
            affiliate_link="https://shop.example.com/123",
            brand_name="WidgetCo",
            ad_copy="Buy now!",
            hook_text="Amazing deal",
            cta_text="Shop Now!",
            output_path="/custom/output.mp4",
        )

    assert result == fake_result


@pytest.mark.asyncio
async def test_render_product_ad_timeout():
    """RuntimeError raised on timeout, with proc killed."""
    fake_proc = MagicMock()
    fake_proc.kill = MagicMock()
    fake_proc.communicate = AsyncMock(side_effect=asyncio.TimeoutError())

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=fake_proc)):
        from services.remotion import render_product_ad

        with pytest.raises(RuntimeError, match="timed out"):
            await render_product_ad(
                image_url="https://example.com/img.jpg",
                title="Test",
                category="test",
            )

    fake_proc.kill.assert_called_once()


@pytest.mark.asyncio
async def test_render_product_ad_no_json_output():
    """RuntimeError raised when stdout has no valid JSON."""
    fake_proc = AsyncMock()
    fake_proc.returncode = 0
    fake_proc.communicate = AsyncMock(return_value=(b"not json", b""))

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=fake_proc)):
        from services.remotion import render_product_ad

        with pytest.raises(RuntimeError, match="No JSON result"):
            await render_product_ad(
                image_url="https://example.com/img.jpg",
                title="Test",
                category="test",
            )


@pytest.mark.asyncio
async def test_render_product_ad_stderr_on_failure():
    """Stderr is surfaced when render process returns non-zero."""
    fake_proc = AsyncMock()
    fake_proc.returncode = 1
    fake_proc.communicate = AsyncMock(
        return_value=(b"{}", b"Video render failed: out of memory")
    )

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=fake_proc)):
        from services.remotion import render_product_ad

        with pytest.raises(RuntimeError, match="Remotion render failed"):
            await render_product_ad(
                image_url="https://example.com/img.jpg",
                title="Test",
                category="test",
            )
