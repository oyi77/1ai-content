"""
Dynamic Caption Styles — Platform-optimized caption generation.

Generates captions in different tones/styles for TikTok, Instagram, etc.
Each style has specific formatting, emoji density, and CTA patterns.
"""

import os
import httpx
import json
import re

OMNIRoute_URL = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")
OMNIROUTE_API_KEY = os.getenv("OMNIROUTE_API_KEY", "")

CAPTION_STYLES = {
    "hype": {
        "name": "Hype & Energetic",
        "description": "High energy, lots of emojis, urgency-driven",
        "emoji_density": "high",
        "tone": "excited, urgent, FOMO-inducing",
        "example_prefix": "🔥🔥🔥 GAK NYANGKA!! ",
        "cta_options": ["COMENT SEKARANG!", "TAG TEMEN KAMU!", "SAVE POST INI!", "SHARE KE SEMUA!"],
        "best_for": ["flash_sale", "viral_content", "challenge"],
    },
    "minimal": {
        "name": "Clean & Minimal",
        "description": "Short, punchy, whitespace-heavy",
        "emoji_density": "low",
        "tone": "calm, sophisticated, clean",
        "example_prefix": "",
        "cta_options": ["Save.", "Share.", "Follow."],
        "best_for": ["product_showcase", "aesthetic", "brand"],
    },
    "educational": {
        "name": "Educational & Informative",
        "description": "Clear structure, numbered points, value-first",
        "emoji_density": "medium",
        "tone": "informative, helpful, authoritative",
        "example_prefix": "📚 ",
        "cta_options": ["Save buat referensi!", "Share ke yang butuh!", "Follow untuk tips lainnya!"],
        "best_for": ["how_to", "tips", "tutorial"],
    },
    "storytelling": {
        "name": "Storytelling & Personal",
        "description": "Narrative flow, emotional hooks, personal touch",
        "emoji_density": "medium",
        "tone": "personal, emotional, relatable",
        "example_prefix": "Jadi ceritanya ",
        "cta_options": ["Pernah ngalamin? Komen di bawah!", "Tag temen yang sama!", "Share kalau relate!"],
        "best_for": ["story", "experience", "transformation"],
    },
    "neon": {
        "name": "Neon & Aesthetic",
        "description": "Trendy symbols, aesthetic formatting, Gen-Z vibe",
        "emoji_density": "high",
        "tone": "trendy, aesthetic, Gen-Z",
        "example_prefix": "✧ ",
        "cta_options": ["save ˚✧₊⁎", "share ˚✧₊⁎", "follow for more ˚✧₊⁎"],
        "best_for": ["fashion", "beauty", "lifestyle"],
    },
    "professional": {
        "name": "Professional & Corporate",
        "description": "Clean, trustworthy, business-oriented",
        "emoji_density": "low",
        "tone": "professional, trustworthy, authoritative",
        "example_prefix": "",
        "cta_options": ["Hubungi kami untuk info lebih lanjut.", "Kunjungi link di bio.", "Jadwalkan konsultasi gratis."],
        "best_for": ["business", "realestate", "services"],
    },
    "humor": {
        "name": "Funny & Relatable",
        "description": "Meme-style, self-deprecating, relatable humor",
        "emoji_density": "high",
        "tone": "funny, relatable, casual",
        "example_prefix": "POV: ",
        "cta_options": ["Tag temen yang kayak gini!", "Komen kalau relate!", "Share buat bikin orang ketawa!"],
        "best_for": ["meme", "relatable", "daily_life"],
    },
    "motivational": {
        "name": "Motivational & Inspiring",
        "description": "Uplifting, empowering, action-oriented",
        "emoji_density": "medium",
        "tone": "inspiring, empowering, action-driven",
        "example_prefix": "💪 ",
        "cta_options": ["Mulai sekarang!", "Kamu bisa!", "Share untuk inspire orang lain!"],
        "best_for": ["motivation", "fitness", "self_improvement"],
    },
}


class CaptionGenerator:
    """Generate platform-optimized captions in different styles."""

    def __init__(self, api_url: str = None):
        self.api_url = api_url or OMNIRoute_URL

    def generate(
        self,
        topic: str,
        style: str = "hype",
        platform: str = "tiktok",
        language: str = "id",
        max_length: int = 2200,
        include_hashtags: bool = True,
        hashtag_count: int = 10,
    ) -> dict:
        """
        Generate a caption in the specified style.

        Returns:
            {
                "success": True,
                "caption": "...",
                "hashtags": ["#tag1", ...],
                "style": "hype",
                "platform": "tiktok"
            }
        """
        style_config = CAPTION_STYLES.get(style, CAPTION_STYLES["hype"])
        lang_inst = "Gunakan bahasa Indonesia yang natural dan conversational." if language == "id" else "Use natural English."

        prompt = f"""Buatkan caption TikTok tentang "{topic}" dengan style {style_config['name']}.

{lang_inst}

Style: {style_config['description']}
Tone: {style_config['tone']}
Emoji density: {style_config['emoji_density']}
Maksimal {max_length} karakter.
{f"Include {hashtag_count} hashtag relevan." if include_hashtags else "Tidak perlu hashtag."}

Output HANYA format JSON:
{{"caption": "teks caption lengkap", "hashtags": ["#tag1", "#tag2"]}}"""

        try:
            headers = {"Authorization": f"Bearer {OMNIROUTE_API_KEY}"} if OMNIROUTE_API_KEY else {}
            response = httpx.post(
                f"{self.api_url}/chat/completions",
                headers=headers,
                json={
                    "model": "auto/best-chat",
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.8,
                    "max_tokens": 1000,
                },
                timeout=30,
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]

            result = self._parse_response(content)
            result["success"] = True
            result["style"] = style
            result["platform"] = platform
            return result

        except Exception as e:
            return {"success": False, "error": str(e)}

    def generate_variants(
        self,
        topic: str,
        styles: list[str] = None,
        platform: str = "tiktok",
        language: str = "id",
    ) -> list[dict]:
        """Generate multiple caption variants in different styles."""
        if styles is None:
            styles = ["hype", "minimal", "educational"]

        results = []
        for style in styles:
            result = self.generate(topic=topic, style=style, platform=platform, language=language)
            results.append(result)
        return results

    def _parse_response(self, content: str) -> dict:
        """Parse LLM JSON response."""
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        json_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?```", content, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass

        json_match = re.search(r"\{[\s\S]*\"caption\"[\s\S]*\}", content)
        if json_match:
            try:
                return json.loads(json_match.group(0))
            except json.JSONDecodeError:
                pass

        return {"caption": content[:500], "hashtags": []}


def list_styles() -> list[dict]:
    """List all available caption styles."""
    return [
        {"id": sid, "name": s["name"], "description": s["description"], "best_for": s["best_for"]}
        for sid, s in CAPTION_STYLES.items()
    ]
