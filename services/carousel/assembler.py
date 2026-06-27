#!/usr/bin/env python3
"""
Carousel Assembler — Orchestrates the full carousel pipeline.

Topic → Content Generation → Slide Rendering → Ready for publish.

Usage:
    from services.carousel.assembler import CarouselAssembler
    assembler = CarouselAssembler()
    result = assembler.create("Tips hemat belanja online", num_slides=7, platform="tiktok")
"""

import json
import os
import time
from typing import Optional

from services.carousel.generator import CarouselGenerator
from services.carousel.renderer import SlideRenderer


class CarouselAssembler:
    """Orchestrate carousel creation: generate content → render slides → output."""

    def __init__(self):
        self.generator = CarouselGenerator()
        self.renderer = SlideRenderer()
        self.output_base = "/tmp/carousel_output"

    def create(
        self,
        topic: str,
        num_slides: int = 7,
        style: str = "outline",
        platform: str = "tiktok",
        language: str = "id",
        output_dir: Optional[str] = None,
    ) -> dict:
        """
        Full carousel pipeline: topic → content → render → output.

        Args:
            topic: Carousel topic/subject
            num_slides: Number of slides (3-10)
            style: Visual style (outline, educational, storytelling, minimal, bold, dark)
            platform: Target platform (tiktok, instagram, square)
            language: Content language (id, en)
            output_dir: Custom output directory

        Returns:
            {
                "success": True,
                "job_id": "carousel_xxx",
                "output_dir": "/tmp/carousel_output/carousel_xxx",
                "slides": ["/tmp/.../slide_00.png", ...],
                "content": { ... generated content ... },
                "caption": "...",
                "hashtags": [...],
                "slide_count": 7,
            }
        """
        job_id = f"carousel_{os.getpid()}_{int(time.time())}"
        work_dir = output_dir or os.path.join(self.output_base, job_id)
        os.makedirs(work_dir, exist_ok=True)

        try:
            # Step 1: Generate content
            print(f"  📝 Generating carousel content for: {topic}")
            content = self.generator.generate(
                topic=topic,
                num_slides=num_slides,
                style=style,
                platform=platform,
                language=language,
            )

            if not content.get("success"):
                return {"success": False, "error": content.get("error", "Content generation failed")}

            slides_data = content.get("slides", [])
            if not slides_data:
                return {"success": False, "error": "No slides generated"}

            # Step 2: Render slides
            print(f"  🎨 Rendering {len(slides_data)} slides...")
            slide_paths = self.renderer.render_slides(
                slides=slides_data,
                output_dir=work_dir,
                platform=platform,
                style=style,
                title=content.get("title", topic),
            )

            # Step 3: Save metadata
            metadata = {
                "job_id": job_id,
                "topic": topic,
                "style": style,
                "platform": platform,
                "language": language,
                "slide_count": len(slides_data),
                "slides": slide_paths,
                "content": content,
            }
            metadata_path = os.path.join(work_dir, "metadata.json")
            with open(metadata_path, "w") as f:
                json.dump(metadata, f, indent=2, ensure_ascii=False, default=str)

            print(f"  ✅ Carousel created: {len(slide_paths)} slides in {work_dir}")

            return {
                "success": True,
                "job_id": job_id,
                "output_dir": work_dir,
                "slides": slide_paths,
                "content": content,
                "caption": content.get("caption", ""),
                "hashtags": content.get("hashtags", []),
                "cover_text": content.get("cover_text", content.get("title", topic)),
                "slide_count": len(slides_data),
                "metadata_path": metadata_path,
            }

        except Exception as e:
            return {"success": False, "error": str(e)}

    def create_from_product(
        self,
        product_name: str,
        product_desc: str,
        num_slides: int = 7,
        style: str = "bold",
        platform: str = "tiktok",
        language: str = "id",
    ) -> dict:
        """Create a product-focused carousel."""
        topic = f"Produk: {product_name} — {product_desc}"
        return self.create(
            topic=topic,
            num_slides=num_slides,
            style=style,
            platform=platform,
            language=language,
        )

    def create_batch(
        self,
        topics: list[str],
        num_slides: int = 7,
        style: str = "outline",
        platform: str = "tiktok",
        language: str = "id",
    ) -> list[dict]:
        """Batch create carousels from multiple topics."""
        results = []
        for topic in topics:
            result = self.create(
                topic=topic,
                num_slides=num_slides,
                style=style,
                platform=platform,
                language=language,
            )
            results.append(result)
        return results


# CLI entry point
if __name__ == "__main__":
    import sys

    topic = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Tips hemat belanja online"
    assembler = CarouselAssembler()
    result = assembler.create(topic, num_slides=7)
    print(json.dumps({k: v for k, v in result.items() if k != "content"}, indent=2, default=str))
