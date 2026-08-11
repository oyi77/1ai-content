#!/usr/bin/env python3
"""
Script Engine — LLM-powered script generation for faceless videos.

Generates structured video scripts with:
- Golden 3-second hooks
- Scene-by-scene breakdowns with narration and visual keywords
- Platform-aware duration (TikTok, YouTube, Instagram, Facebook)
- E-commerce product scripts with SEO metadata

Usage:
    from services.faceless.script_engine import ScriptEngine
    engine = ScriptEngine()
    script = engine.generate_script("5 fakta tentang AI", style="educational")
    product = engine.generate_product_script("Kacamata Blue Light", "Kacamata anti radiasi")
"""
import json
import os
import re
import httpx
from typing import Optional

OMNIRoute_URL = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")
OMNIROUTE_API_KEY = os.getenv("OMNIROUTE_API_KEY", "")

PLATFORM_DURATIONS: dict[str, int] = {
    "tiktok": 60,
    "youtube": 60,
    "instagram": 30,
    "facebook": 60,
}

VALID_STYLES: list[str] = ["educational", "story", "product", "listicle", "motivational"]
VALID_PRODUCT_STYLES: list[str] = ["pain_point", "scene_recommendation", "comparison", "story"]


class ScriptEngine:
    """LLM-powered script generation for faceless videos."""

    def __init__(self) -> None:
        self.omniroute_url: str = OMNIRoute_URL

    # ── LLM CALL ──────────────────────────────────────────────────

    def _call_llm(self, prompt: str, max_tokens: int = 2000) -> str:
        """Call OmniRoute LLM for script generation."""
        try:
            headers = {"Authorization": f"Bearer {OMNIROUTE_API_KEY}"} if OMNIROUTE_API_KEY else {}
            resp = httpx.post(
                f"{self.omniroute_url}/chat/completions",
                json={
                    "model": "auto/all-working",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": 0.7,
                    "stream": False,
                },
                headers=headers,
                timeout=60,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"⚠️ LLM call failed: {e}")
            return ""

    # ── VIDEO SCRIPT ───────────────────────────────────────────────

    def generate_script(
        self,
        topic: str,
        style: str = "educational",
        num_scenes: int = 6,
        language: str = "id",
        platform: str = "tiktok",
    ) -> dict:
        """Generate a faceless video script via LLM.

        Args:
            topic: Video topic or title idea.
            style: Script style — educational, story, product, listicle, motivational.
            num_scenes: Number of scenes to generate (3–10).
            language: Output language code (id, en, etc.).
            platform: Target platform — tiktok, youtube, instagram, facebook.

        Returns:
            dict with keys: success, title, hook, scenes[], tags[], description.
        """
        style = style if style in VALID_STYLES else "educational"
        platform = platform.lower()
        total_duration = PLATFORM_DURATIONS.get(platform, 60)
        scene_duration = round(total_duration / max(num_scenes, 1))

        prompt = f"""You are a professional short-form video scriptwriter for faceless channels.

Generate a {platform} video script about: "{topic}"

STYLE: {style}
LANGUAGE: {language} (write all text in this language)
NUMBER OF SCENES: {num_scenes}
TOTAL DURATION: {total_duration} seconds (~{scene_duration}s per scene)

RULES:
- The FIRST scene (hook) MUST grab attention in the first 3 seconds — use a surprising fact, bold question, or provocative statement.
- Each scene has: narration_text (spoken by TTS), visual_keywords (exactly 2 English keywords for stock footage search), duration_seconds.
- The LAST scene MUST include a clear CTA (subscribe, follow, comment, link in bio, etc.).
- Keep narration conversational, 1-2 sentences per scene.
- visual_keywords MUST be in English regardless of language setting.
- Generate 5-8 relevant hashtags.
- Write a 1-sentence video description.

Return ONLY valid JSON (no markdown, no explanation):
{{
  "title": "...",
  "hook": "first 3 seconds narration text",
  "scenes": [
    {{
      "scene_number": 1,
      "narration_text": "...",
      "visual_keywords": ["keyword1", "keyword2"],
      "duration_seconds": {scene_duration}
    }}
  ],
  "tags": ["#tag1", "#tag2"],
  "description": "..."
}}"""

        llm_response = self._call_llm(prompt, max_tokens=2000)
        if not llm_response:
            return {"success": False, "error": "LLM call failed", "raw": ""}

        try:
            json_match = re.search(r'\{[\s\S]*\}', llm_response)
            if json_match:
                data = json.loads(json_match.group())
            else:
                return {"success": False, "error": "No JSON found in response", "raw": llm_response}
        except json.JSONDecodeError:
            return {"success": False, "error": "Invalid JSON from LLM", "raw": llm_response}

        scenes = data.get("scenes", [])
        for s in scenes:
            if isinstance(s.get("visual_keywords"), str):
                s["visual_keywords"] = [s["visual_keywords"]]
            if not isinstance(s.get("visual_keywords"), list):
                s["visual_keywords"] = ["abstract", "concept"]

        return {
            "success": True,
            "title": data.get("title", topic),
            "hook": data.get("hook", ""),
            "scenes": scenes,
            "tags": data.get("tags", []),
            "description": data.get("description", ""),
        }

    # ── PRODUCT SCRIPT ────────────────────────────────────────────

    def generate_product_script(
        self,
        product_name: str,
        product_desc: str,
        price: str = "",
        style: str = "pain_point",
        language: str = "id",
    ) -> dict:
        """Generate an e-commerce product video script via LLM.

        Args:
            product_name: Name of the product.
            product_desc: Product description / key features.
            price: Display price (optional).
            style: Script approach — pain_point, scene_recommendation, comparison, story.
            language: Output language code.

        Returns:
            dict with: success, title, hook, scenes[], tags[], description, seo{hashtags, cover_text, interaction_guide}.
        """
        style = style if style in VALID_PRODUCT_STYLES else "pain_point"
        total_duration = 60  # product videos default 60s
        num_scenes = 6
        scene_duration = round(total_duration / num_scenes)

        price_line = f"PRICE: {price}" if price else "PRICE: not specified"

        style_instructions: dict[str, str] = {
            "pain_point": "Start with a relatable PROBLEM the audience faces, then reveal the product as the SOLUTION. Show before/after.",
            "scene_recommendation": "Show the product in USE across 3-4 real-life scenarios. Emphasize versatility and daily value.",
            "comparison": "Compare the product against 2-3 alternatives (generic or competitor). Highlight unique advantages.",
            "story": "Tell a short narrative — someone discovers the product, skeptically tries it, becomes a fan. Emotional arc.",
        }

        prompt = f"""You are a top e-commerce short-form video scriptwriter.

Generate a {total_duration}s product video script.

PRODUCT: {product_name}
DESCRIPTION: {product_desc}
{price_line}
STYLE: {style} — {style_instructions.get(style, style_instructions["pain_point"])}
LANGUAGE: {language} (write all text in this language)
SCENES: {num_scenes}

RULES:
- First scene is the HOOK — grab attention in under 3 seconds. Use pain point, curiosity, or bold claim.
- Last scene MUST have a CTA: "link di bio", "klik keranjang kuning", "comment ORDER", etc.
- Each scene has: narration_text, visual_keywords (exactly 2 English keywords for stock footage), duration_seconds.
- visual_keywords MUST be in English.
- Tags: 5-8 relevant hashtags.
- Description: 1-2 sentences, keyword-rich for SEO.

Return ONLY valid JSON (no markdown, no explanation):
{{
  "title": "...",
  "hook": "first 3 seconds narration",
  "scenes": [
    {{
      "scene_number": 1,
      "narration_text": "...",
      "visual_keywords": ["keyword1", "keyword2"],
      "duration_seconds": {scene_duration}
    }}
  ],
  "tags": ["#tag1", "#tag2"],
  "description": "...",
  "seo": {{
    "hashtags": ["#tag1", "#tag2", "#tag3"],
    "cover_text": "short text for video cover/thumbnail overlay",
    "interaction_guide": "suggested pinned comment or engagement prompt"
  }}
}}"""

        llm_response = self._call_llm(prompt, max_tokens=2000)
        if not llm_response:
            return {"success": False, "error": "LLM call failed", "raw": ""}

        try:
            json_match = re.search(r'\{[\s\S]*\}', llm_response)
            if json_match:
                data = json.loads(json_match.group())
            else:
                return {"success": False, "error": "No JSON found in response", "raw": llm_response}
        except json.JSONDecodeError:
            return {"success": False, "error": "Invalid JSON from LLM", "raw": llm_response}

        scenes = data.get("scenes", [])
        for s in scenes:
            if isinstance(s.get("visual_keywords"), str):
                s["visual_keywords"] = [s["visual_keywords"]]
            if not isinstance(s.get("visual_keywords"), list):
                s["visual_keywords"] = ["product", "lifestyle"]

        seo = data.get("seo", {})
        if not isinstance(seo, dict):
            seo = {}
        seo.setdefault("hashtags", data.get("tags", []))
        seo.setdefault("cover_text", product_name)
        seo.setdefault("interaction_guide", "Comment your order!")

        return {
            "success": True,
            "title": data.get("title", product_name),
            "hook": data.get("hook", ""),
            "scenes": scenes,
            "tags": data.get("tags", []),
            "description": data.get("description", ""),
            "seo": seo,
        }


# CLI entry point
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python script_engine.py <topic> [style] [num_scenes] [language] [platform]")
        print("       python script_engine.py --product <name> <desc> [price] [style] [language]")
        sys.exit(1)

    engine = ScriptEngine()

    if sys.argv[1] == "--product":
        if len(sys.argv) < 4:
            print("Usage: python script_engine.py --product <name> <desc> [price] [style] [language]")
            sys.exit(1)
        result = engine.generate_product_script(
            product_name=sys.argv[2],
            product_desc=sys.argv[3],
            price=sys.argv[4] if len(sys.argv) > 4 else "",
            style=sys.argv[5] if len(sys.argv) > 5 else "pain_point",
            language=sys.argv[6] if len(sys.argv) > 6 else "id",
        )
    else:
        result = engine.generate_script(
            topic=sys.argv[1],
            style=sys.argv[2] if len(sys.argv) > 2 else "educational",
            num_scenes=int(sys.argv[3]) if len(sys.argv) > 3 else 6,
            language=sys.argv[4] if len(sys.argv) > 4 else "id",
            platform=sys.argv[5] if len(sys.argv) > 5 else "tiktok",
        )

    print(json.dumps(result, indent=2, ensure_ascii=False))
