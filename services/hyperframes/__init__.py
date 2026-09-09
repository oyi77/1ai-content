"""
HyperFrames video renderer for product ads.
Wraps the Node.js HyperFrames renderer for use by the Python API.
"""

import asyncio
import json
import os
from typing import Optional
from pathlib import Path

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_DEFAULT_HF_DIR = _PROJECT_ROOT / "services" / "hyperframes"
HF_DIR = Path(os.environ.get("HYPERFRAMES_DIR", str(_DEFAULT_HF_DIR)))
RENDER_SCRIPT = HF_DIR / "src" / "render.ts"

OUTPUT_DIR = _PROJECT_ROOT / "data" / "hyperframes"


async def render_product_ad(
    *,
    image_url: str,
    title: str,
    category: str,
    affiliate_link: str = "",
    brand_name: str = "Shopee Affiliate",
    ad_copy: Optional[str] = None,
    hook_text: Optional[str] = None,
    cta_text: Optional[str] = "Link di Bio! 🔗",
    output_path: Optional[str] = None,
) -> dict:
    """
    Render a product ad video using HyperFrames (9:16, 1080x1920, 15s).

    Args:
        image_url: Product image URL
        title: Product title
        category: Product category (beauty, fashion, hobi, kesehatan, homeliving)
        affiliate_link: Optional affiliate link
        brand_name: Brand name for the ad
        ad_copy: Optional ad copy (auto-generated if empty)
        hook_text: Optional hook text (auto-generated if empty)
        cta_text: Call-to-action text
        output_path: Optional custom output path

    Returns:
        dict with success, videoPath, framesRendered, duration, width, height, file_size
    """
    payload = {
        "image_url": image_url,
        "title": title,
        "category": category,
        "brand_name": brand_name,
        "cta_text": cta_text,
    }
    if ad_copy:
        payload["ad_copy"] = ad_copy
    if hook_text:
        payload["hook_text"] = hook_text
    payload["output_path"] = output_path or str(
        OUTPUT_DIR / f"product-ad-{category}-{os.urandom(4).hex()}.mp4"
    )

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    json_payload = json.dumps(payload)

    try:
        proc = await asyncio.create_subprocess_exec(
            "node",
            "--import",
            "tsx",
            str(RENDER_SCRIPT),
            json_payload,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(HF_DIR),
            env={**os.environ, "NODE_OPTIONS": "--max-old-space-size=4096"},
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=300
            )
        except asyncio.TimeoutError:
            proc.kill()
            raise RuntimeError("HyperFrames render timed out (300s)")

        if proc.returncode != 0:
            raise RuntimeError(
                f"HyperFrames render failed: {stderr.decode().strip() or 'unknown error'}"
            )

        # Parse JSON from last line of stdout
        lines = stdout.decode().strip().split("\n")
        for line in reversed(lines):
            line = line.strip()
            if line.startswith("{"):
                try:
                    result_json = json.loads(line)
                    return result_json
                except json.JSONDecodeError:
                    continue

        raise RuntimeError(f"Could not parse render output: {stdout.decode()[:500]}")

    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid JSON in render output: {e}")
