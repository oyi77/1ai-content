#!/usr/bin/env python3
"""
Carousel Content Generator — AI-powered carousel content creation.

Generates structured slide content (headlines, body text, captions)
for TikTok/Instagram carousels using LLM via OmniRoute.

Usage:
    from services.carousel.generator import CarouselGenerator
    gen = CarouselGenerator()
    content = gen.generate("Tips hemat belanja online", num_slides=7)
"""

import json
import os
import re

import httpx

OMNIRoute_URL = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")
OMNIROUTE_API_KEY = os.getenv("OMNIROUTE_API_KEY", "")

# Platform presets for carousel
PLATFORM_PRESETS = {
    "tiktok": {
        "max_slides": 10,
        "min_slides": 3,
        "resolution": (1080, 1920),
        "aspect_ratio": "9:16",
        "caption_max": 2200,
        "hashtag_count": (5, 15),
    },
    "instagram": {
        "max_slides": 10,
        "min_slides": 2,
        "resolution": (1080, 1350),
        "aspect_ratio": "4:5",
        "caption_max": 2200,
        "hashtag_count": (10, 30),
    },
    "square": {
        "max_slides": 10,
        "min_slides": 2,
        "resolution": (1080, 1080),
        "aspect_ratio": "1:1",
        "caption_max": 2200,
        "hashtag_count": (5, 15),
    },
}

# Style presets
STYLE_PRESETS = {
    "outline": {
        "name": "Outline/Bullet",
        "description": "Clean bullet-point style with clear structure",
        "bg_colors": ["#1a1a2e", "#16213e", "#0f3460", "#533483"],
        "text_color": "#ffffff",
        "accent_color": "#e94560",
    },
    "educational": {
        "name": "Educational",
        "description": "Teaching style with numbered steps",
        "bg_colors": ["#f8f9fa", "#e9ecef", "#dee2e6", "#ced4da"],
        "text_color": "#212529",
        "accent_color": "#0d6efd",
    },
    "storytelling": {
        "name": "Storytelling",
        "description": "Narrative flow with emotional hooks",
        "bg_colors": ["#2d1b69", "#11998e", "#38ef7d", "#fc5c7d"],
        "text_color": "#ffffff",
        "accent_color": "#ffd700",
    },
    "minimal": {
        "name": "Minimal",
        "description": "Clean, whitespace-heavy modern design",
        "bg_colors": ["#ffffff", "#f5f5f5", "#eeeeee", "#e0e0e0"],
        "text_color": "#333333",
        "accent_color": "#ff6b6b",
    },
    "bold": {
        "name": "Bold & Vibrant",
        "description": "High-contrast, attention-grabbing colors",
        "bg_colors": ["#ff6b6b", "#feca57", "#48dbfb", "#ff9ff3"],
        "text_color": "#ffffff",
        "accent_color": "#2d3436",
    },
    "dark": {
        "name": "Dark Mode",
        "description": "Sleek dark theme with neon accents",
        "bg_colors": ["#0d0d0d", "#1a1a1a", "#2d2d2d", "#404040"],
        "text_color": "#e0e0e0",
        "accent_color": "#00ff88",
    },
}


class CarouselGenerator:
    """Generate carousel content using LLM."""

    def __init__(self, api_url: str = None):
        self.api_url = api_url or OMNIRoute_URL

    def generate(
        self,
        topic: str,
        num_slides: int = 7,
        style: str = "outline",
        platform: str = "tiktok",
        language: str = "id",
        previous_context: str = "",
    ) -> dict:
        """
        Generate carousel content from a topic.

        Returns:
            {
                "success": True,
                "title": "Carousel title",
                "slides": [
                    {"index": 0, "type": "cover", "headline": "...", "body": "...", "icon": "🔥"},
                    {"index": 1, "type": "content", "headline": "...", "body": "...", "icon": "💡"},
                    ...
                    {"index": N, "type": "closing", "headline": "...", "body": "...", "cta": "Follow for more!"}
                ],
                "caption": "Full caption with hashtags",
                "hashtags": ["#tag1", "#tag2"],
                "cover_text": "Cover slide headline"
            }
        """
        preset = PLATFORM_PRESETS.get(platform, PLATFORM_PRESETS["tiktok"])
        num_slides = max(preset["min_slides"], min(num_slides, preset["max_slides"]))

        style_config = STYLE_PRESETS.get(style, STYLE_PRESETS["outline"])

        prompt = self._build_prompt(
            topic=topic,
            num_slides=num_slides,
            style=style,
            style_config=style_config,
            platform=platform,
            language=language,
            previous_context=previous_context,
        )

        try:
            headers = {"Authorization": f"Bearer {OMNIROUTE_API_KEY}"} if OMNIROUTE_API_KEY else {}
            response = httpx.post(
                f"{self.api_url}/chat/completions",
                headers=headers,
                json={
                    "model": "auto/best-chat",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.8,
                    "max_tokens": 4000,
                },
                timeout=60,
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]

            # Extract JSON from response
            result = self._parse_response(content, num_slides)
            result["success"] = True
            result["style"] = style
            result["platform"] = platform
            result["language"] = language
            return result

        except Exception as e:
            return {"success": False, "error": str(e)}

    def _build_prompt(
        self,
        topic: str,
        num_slides: int,
        style: str,
        style_config: dict,
        platform: str,
        language: str,
        previous_context: str,
    ) -> str:
        """Build the LLM prompt for carousel generation."""
        lang_instruction = "Gunakan bahasa Indonesia yang natural dan conversational." if language == "id" else "Use natural, conversational English."

        context_instruction = ""
        if previous_context:
            context_instruction = f"\nKonteks dari carousel sebelumnya:\n{previous_context}\nBuat konten yang melengkapi, bukan mengulang.\n"

        return f"""Kamu adalah pembuat konten TikTok carousel profesional.

Tugas: Buatkan konten carousel tentang "{topic}" dengan {num_slides} slide.

{lang_instruction}
{context_instruction}

Aturan:
1. Slide pertama = COVER: headline catchy yang bikin orang stop scrolling (max 8 kata)
2. Slide terakhir = CLOSING: CTA (follow, save, share, comment)
3. Slide tengah = CONTENT: satu poin per slide, jelas dan actionable
4. Gunakan bahasa sehari-hari, bukan formal
5. Setiap slide punya emoji/icon yang relevan
6. Caption: engaging, include 10-15 hashtag relevan
7. Maksimal 30 kata per slide body

Style: {style_config['name']} — {style_config['description']}

Output HANYA format JSON (tanpa markdown code block):
{{
  "title": "Judul carousel",
  "slides": [
    {{"index": 0, "type": "cover", "headline": "...", "body": "...", "icon": "🔥"}},
    {{"index": 1, "type": "content", "headline": "...", "body": "...", "icon": "💡"}},
    ...
    {{"index": {num_slides - 1}, "type": "closing", "headline": "...", "body": "Follow untuk tips serupa!", "icon": "👉", "cta": "Follow & Save!"}}
  ],
  "caption": "Caption lengkap dengan CTA dan hashtag",
  "hashtags": ["#tag1", "#tag2", "..."]
}}"""

    def _parse_response(self, content: str, expected_slides: int) -> dict:
        """Parse LLM JSON response, with fallback extraction."""
        # Try direct JSON parse
        try:
            result = json.loads(content)
            if "slides" in result:
                return result
        except json.JSONDecodeError:
            pass

        # Try extracting JSON from markdown code block
        json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", content, re.DOTALL)
        if json_match:
            try:
                result = json.loads(json_match.group(1))
                if "slides" in result:
                    return result
            except json.JSONDecodeError:
                pass

        # Try finding JSON object in text
        json_match = re.search(r"\{[\s\S]*\"slides\"[\s\S]*\}", content)
        if json_match:
            try:
                result = json.loads(json_match.group(0))
                if "slides" in result:
                    return result
            except json.JSONDecodeError:
                pass

        # Fallback: build minimal structure
        return {
            "title": "Carousel",
            "slides": [
                {"index": i, "type": "content", "headline": f"Slide {i+1}", "body": "", "icon": "📌"}
                for i in range(expected_slides)
            ],
            "caption": content[:500] if content else "",
            "hashtags": [],
        }


# CLI entry point
if __name__ == "__main__":
    import sys

    topic = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "Tips hemat belanja online"
    gen = CarouselGenerator()
    result = gen.generate(topic, num_slides=7)
    print(json.dumps(result, indent=2, ensure_ascii=False))
