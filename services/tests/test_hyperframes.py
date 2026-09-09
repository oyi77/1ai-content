"""Tests for the HyperFrames video renderer wrapper."""

import asyncio
import json
import os
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest


def test_module_constants_default():
    """HF_DIR, RENDER_SCRIPT, OUTPUT_DIR resolve without env override."""
    import services.hyperframes
    import importlib
    importlib.reload(services.hyperframes)

    expected_base = (
        Path(__file__).resolve().parent.parent / "hyperframes"
    )
    assert services.hyperframes.HF_DIR == expected_base
    assert services.hyperframes.RENDER_SCRIPT == expected_base / "src" / "render.ts"
    assert services.hyperframes.OUTPUT_DIR == Path(__file__).resolve().parent.parent.parent / "data" / "hyperframes"


def test_module_constants_with_env():
    """HF_DIR respects HYPERFRAMES_DIR env var."""
    os.environ["HYPERFRAMES_DIR"] = "/tmp/custom-hyperframes"
    import services.hyperframes
    import importlib
    importlib.reload(services.hyperframes)

    try:
        assert services.hyperframes.HF_DIR == Path("/tmp/custom-hyperframes")
        assert services.hyperframes.OUTPUT_DIR == Path(__file__).resolve().parent.parent.parent / "data" / "hyperframes"
    finally:
        del os.environ["HYPERFRAMES_DIR"]
        importlib.reload(services.hyperframes)


@pytest.mark.asyncio
async def test_render_product_ad_success():
    """render_product_ad returns parsed result on success."""
    fake_result = {"success": True, "videoPath": "/tmp/test.mp4", "framesRendered": 60}
    fake_proc = AsyncMock()
    fake_proc.returncode = 0
    fake_proc.communicate = AsyncMock(return_value=(json.dumps(fake_result).encode(), b""))

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=fake_proc)):
        import services.hyperframes
        import importlib
        importlib.reload(services.hyperframes)

        result = await services.hyperframes.render_product_ad(
            image_url="https://example.com/img.jpg",
            title="Test Product",
            category="beauty",
        )

        assert result == fake_result


@pytest.mark.asyncio
async def test_render_product_ad_with_all_params():
    """All optional parameters are mapped into the payload."""
    fake_result = {"success": True}
    fake_proc = AsyncMock()
    fake_proc.returncode = 0
    fake_proc.communicate = AsyncMock(return_value=(json.dumps(fake_result).encode(), b""))

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=fake_proc)):
        import services.hyperframes
        import importlib
        importlib.reload(services.hyperframes)

        result = await services.hyperframes.render_product_ad(
            image_url="https://example.com/img.jpg",
            title="Test Product",
            category="beauty",
            affiliate_link="https://shopee.co.id/...",
            brand_name="Test Brand",
            ad_copy="Great product!",
            hook_text="Check this out!",
            cta_text="Buy Now!",
        )

        assert result == fake_result

        # Verify the payload was passed
        call_args = fake_proc.communicate.call_args
        assert call_args is not None


@pytest.mark.asyncio
async def test_render_product_ad_timeout():
    """RuntimeError raised on timeout, with proc killed."""
    fake_proc = AsyncMock()
    fake_proc.communicate = AsyncMock(side_effect=asyncio.TimeoutError())
    fake_proc.kill = AsyncMock()

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=fake_proc)):
        import services.hyperframes
        import importlib
        importlib.reload(services.hyperframes)

        with pytest.raises(RuntimeError, match="timed out"):
            await services.hyperframes.render_product_ad(
                image_url="https://example.com/img.jpg",
                title="Test Product",
                category="beauty",
            )

        fake_proc.kill.assert_called_once()


@pytest.mark.asyncio
async def test_render_product_ad_no_json_output():
    """RuntimeError raised when stdout has no valid JSON."""
    fake_proc = AsyncMock()
    fake_proc.returncode = 0
    fake_proc.communicate = AsyncMock(return_value=(b"no json here", b""))

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=fake_proc)):
        import services.hyperframes
        import importlib
        importlib.reload(services.hyperframes)

        with pytest.raises(RuntimeError, match="Could not parse render output"):
            await services.hyperframes.render_product_ad(
                image_url="https://example.com/img.jpg",
                title="Test Product",
                category="beauty",
            )


@pytest.mark.asyncio
async def test_render_product_ad_malformed_json():
    """RuntimeError raised when stdout contains invalid JSON."""
    fake_proc = AsyncMock()
    fake_proc.returncode = 0
    fake_proc.communicate = AsyncMock(return_value=(b"{invalid json}", b""))

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=fake_proc)):
        import services.hyperframes
        import importlib
        importlib.reload(services.hyperframes)

        with pytest.raises(RuntimeError, match="Could not parse render output"):
            await services.hyperframes.render_product_ad(
                image_url="https://example.com/img.jpg",
                title="Test Product",
                category="beauty",
            )


@pytest.mark.asyncio
async def test_render_product_ad_stderr_on_failure():
    """Stderr is surfaced when render process returns non-zero."""
    fake_proc = AsyncMock()
    fake_proc.returncode = 1
    fake_proc.communicate = AsyncMock(return_value=(b"", b"render failed: composition error"))

    with patch("asyncio.create_subprocess_exec", new=AsyncMock(return_value=fake_proc)):
        import services.hyperframes
        import importlib
        importlib.reload(services.hyperframes)

        with pytest.raises(RuntimeError, match="render failed"):
            await services.hyperframes.render_product_ad(
                image_url="https://example.com/img.jpg",
                title="Test Product",
                category="beauty",
            )
