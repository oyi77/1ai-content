"""
Remotion video renderer for product ads.
Wraps the Node.js Remotion renderer for use by the Python API.
"""

import asyncio
import json
import os
import subprocess
from typing import Optional
from pathlib import Path


# Allow override via env var for flexibility; default to project-relative path
_DEFAULT_REMOTION_DIR = Path(__file__).resolve().parent.parent.parent / "remotion-ads"
REMOTION_DIR = Path(os.environ.get("REMOTION_ADS_DIR", str(_DEFAULT_REMOTION_DIR)))
RENDER_SCRIPT = REMOTION_DIR / "src" / "render.ts"

# Default output directory
OUTPUT_DIR = REMOTION_DIR / "output"
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
    Render a product ad video using Remotion.

    Args:
        image_url: Product image URL
        title: Product title
        category: Product category (beauty, fashion, hobi, kesehatan, homeliving)
        affiliate_link: Shopee affiliate link
        brand_name: Brand/page name
        ad_copy: Ad copy text (auto-generated if not provided)
        hook_text: Hook text (auto-generated if not provided)
        cta_text: Call-to-action text
        output_path: Custom output file path

    Returns:
        dict with file_path, file_size, duration, width, height

    Raises:
        RuntimeError: If rendering fails
    """
    # Build input payload
    payload = {
        "imageUrl": image_url,
        "title": title,
        "category": category,
        "affiliateLink": affiliate_link,
        "brandName": brand_name,
        "ctaText": cta_text,
    }
    if ad_copy:
        payload["adCopy"] = ad_copy
    if hook_text:
        payload["hookText"] = hook_text
    if output_path:
        payload["outputPath"] = output_path

    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    # Run the Node.js renderer
    json_payload = json.dumps(payload)

    try:
        proc = await asyncio.create_subprocess_exec(
            "node",
            "--import", "tsx",
            str(RENDER_SCRIPT),
            json_payload,
            cwd=str(REMOTION_DIR),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={
                **os.environ,
                "NODE_OPTIONS": "--max-old-space-size=4096",
            },
        )

        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=300,  # 5 minutes max
        )

        stdout_str = stdout.decode("utf-8").strip()
        stderr_str = stderr.decode("utf-8").strip()

        if proc.returncode != 0:
            # Extract error from stderr (last few lines)
            error_lines = stderr_str.strip().split("\n")[-5:]
            error_msg = "\n".join(error_lines)
            raise RuntimeError(
                f"Remotion render failed (exit {proc.returncode}): {error_msg}"
            )

        # Parse the JSON result from stdout (last line)
        lines = stdout_str.split("\n")
        result_json = None
        for line in reversed(lines):
            line = line.strip()
            if line.startswith("{"):
                result_json = json.loads(line)
                break

        if not result_json:
            raise RuntimeError(
                f"No JSON result in output. stdout: {stdout_str[-500:]}"
            )

        return result_json

    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError("Remotion render timed out (300s)")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Invalid JSON in render output: {e}")

