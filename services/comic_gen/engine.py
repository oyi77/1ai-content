"""
Engine — Async orchestration for comic/manga/manhwa generation pipeline.

Follows the pattern from bookshelf/engine.py: status events via AsyncGenerator.
"""

import asyncio
import json
import time
from pathlib import Path
from typing import Any, AsyncGenerator, Optional

from services.comic_gen.comic_types import ComicFormat, ComicScript, RenderedPage
from services.comic_gen.script_engine import generate_script, script_to_dict
from services.comic_gen.page_composer import compose_page, compose_episode, compose_cover

OUTPUT_DIR = Path(__file__).resolve().parent.parent.parent / "data" / "comic"


async def generate_comic_pipeline(
    prompt: str,
    *,
    fmt: ComicFormat = ComicFormat.COMIC,
    language: str = "en",
    num_episodes: int = 1,
    pages_per_episode: int = 4,
    generate_images: bool = False,
) -> AsyncGenerator[dict[str, Any], None]:
    """Full generation pipeline: script → (optional panels) → composition.

    Yields status events matching the bookshelf pattern.
    """
    # Phase 1: Script generation
    yield {
        "status": "script_generating",
        "message": "Generating comic script via LLM...",
        "progress": 0.05,
    }

    try:
        stats, script = await generate_script(
            prompt,
            fmt=fmt,
            language=language,
            num_episodes=num_episodes,
            pages_per_episode=pages_per_episode,
        )
    except Exception as e:
        yield {
            "status": "error",
            "message": f"Script generation failed: {e}",
            "progress": 1.0,
        }
        return

    script_dict = script_to_dict(script)
    total_pages = sum(len(ep.pages) for ep in script.episodes)

    yield {
        "status": "script_ready",
        "message": f"Script generated: {script.title} ({len(script.episodes)} episode(s), {total_pages} page(s))",
        "progress": 0.2,
        "data": {
            "script": script_dict,
            **stats,
        },
    }

    if not generate_images:
        yield {
            "status": "complete",
            "message": "Script ready — set generate_images=true to render pages",
            "progress": 1.0,
            "data": {
                "script": script_dict,
                "num_episodes": len(script.episodes),
                "total_pages": total_pages,
                **stats,
            },
        }
        return

    # Phase 2: Page composition (generates panel images on demand)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = int(time.time())
    slug = "".join(c if c.isalnum() else "_" for c in script.title.lower())[:30]
    output_subdir = OUTPUT_DIR / f"{timestamp}_{slug}"
    output_subdir.mkdir(exist_ok=True)

    all_rendered: list[RenderedPage] = []

    for ep_i, episode in enumerate(script.episodes):
        yield {
            "status": "rendering",
            "message": f"Rendering episode {ep_i + 1}/{len(script.episodes)}...",
            "progress": 0.2 + 0.7 * (ep_i / len(script.episodes)),
        }

        rendered_pages = await compose_episode(episode, script)

        for rp in rendered_pages:
            fname = output_subdir / f"ep{ep_i + 1:02d}_pg{rp.page_number:02d}.png"
            fname.write_bytes(rp.image_bytes)
            all_rendered.append(rp)

        yield {
            "status": "episode_rendered",
            "message": f"Episode {ep_i + 1}: {len(rendered_pages)} page(s) rendered",
            "progress": 0.2 + 0.7 * ((ep_i + 1) / len(script.episodes)),
        }

    # Phase 3: Cover
    try:
        cover = await compose_cover(script)
        if cover:
            cover_path = output_subdir / "cover.png"
            cover_path.write_bytes(cover.image_bytes)
            all_rendered.insert(0, cover)
    except Exception:
        pass

    yield {
        "status": "complete",
        "message": f"Done: {total_pages} page(s) rendered to {output_subdir}",
        "progress": 1.0,
        "data": {
            "script": script_dict,
            "output_dir": str(output_subdir),
            "total_pages": total_pages,
            "total_images": len(all_rendered),
            "num_episodes": len(script.episodes),
            **stats,
        },
    }


async def run_pipeline(
    prompt: str,
    **kwargs,
) -> dict[str, Any]:
    """Convenience: collect all events from the pipeline and return final data."""
    final = {}
    async for event in generate_comic_pipeline(prompt, **kwargs):
        final = event
    return final
