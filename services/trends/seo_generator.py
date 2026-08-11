#!/usr/bin/env python3
"""
SEO Metadata Generator — Auto-SEO for multi-platform publishing.

Generates platform-optimized SEO metadata including titles, captions,
hashtags, cover text, and posting-time recommendations.

Supported platforms: TikTok, Instagram, YouTube, Facebook, X, LinkedIn, Threads.

Uses OmniRoute LLM for generation.
"""
import json
import os
import re
import httpx

OMNIRoute_URL = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")
OMNIROUTE_API_KEY = os.getenv("OMNIROUTE_API_KEY", "")

# ── Platform presets ──────────────────────────────────────────────
PLATFORM_PRESETS = {
    "tiktok": {
        "caption_style": "short, hook-first, casual",
        "caption_chars": 150,
        "hashtag_count": "3-5 trending",
        "features": ["sound suggestion", "hook-first opening", "trending hashtags"],
        "best_times_id": ["11:00", "19:00", "21:00"],
    },
    "instagram": {
        "caption_style": "medium, emoji-rich, CTA-driven",
        "caption_chars": 2200,
        "hashtag_count": "20-30 targeted",
        "features": ["emoji-rich text", "CTA", "story mention", "carousel tips"],
        "best_times_id": ["07:00", "12:00", "18:00"],
    },
    "youtube": {
        "caption_style": "SEO-optimized title + long description",
        "title_chars": 60,
        "description_chars": 5000,
        "tags_count": 15,
        "features": ["SEO title", "keyword-rich description", "tags", "thumbnail text"],
        "best_times_id": ["14:00", "17:00", "20:00"],
    },
    "facebook": {
        "caption_style": "long storytelling, engagement-focused",
        "caption_chars": 3000,
        "hashtag_count": "3-5",
        "features": ["storytelling narrative", "engagement question", "community tone"],
        "best_times_id": ["09:00", "13:00", "19:00"],
    },
    "x": {
        "caption_style": "punchy, concise, thread-ready",
        "caption_chars": 280,
        "hashtag_count": "2-3",
        "features": ["punchy copy", "thread-ready format", "concise hooks"],
        "best_times_id": ["08:00", "12:00", "17:00"],
    },
    "linkedin": {
        "caption_style": "professional, value-first, thought-leadership",
        "caption_chars": 1300,
        "hashtag_count": "3-5 professional",
        "features": ["professional tone", "value-first content", "industry insights"],
        "best_times_id": ["07:30", "12:00", "17:30"],
    },
    "threads": {
        "caption_style": "conversational, authentic, community-driven",
        "caption_chars": 500,
        "hashtag_count": "3-5",
        "features": ["conversational tone", "authentic voice", "community engagement"],
        "best_times_id": ["09:00", "13:00", "19:00"],
    },
}


class SEOGenerator:
    """Generate platform-optimized SEO metadata for multi-platform publishing."""

    def __init__(self):
        self.omniroute_url = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")

    # ── PUBLIC API ─────────────────────────────────────────────────

    def generate_seo(
        self,
        title: str,
        description: str,
        platform: str = "tiktok",
        language: str = "id",
        niche: str = "",
    ) -> dict:
        """Generate platform-specific SEO metadata.

        Returns: {success, title, caption, description, hashtags,
                  cover_text, posting_time, engagement_hooks}
        """
        platform = platform.lower()
        preset = PLATFORM_PRESETS.get(platform)
        if not preset:
            return {
                "success": False,
                "error": f"Unsupported platform '{platform}'. Supported: {', '.join(PLATFORM_PRESETS)}",
            }

        lang_label = {"id": "Bahasa Indonesia", "en": "English"}.get(language, language)
        niche_line = f"\nContent niche: {niche}" if niche else ""

        prompt = self._build_prompt(title, description, platform, lang_label, niche_line, preset)

        llm_response = self._call_llm(prompt, max_tokens=1500)
        if not llm_response:
            return {"success": False, "error": "LLM call returned empty response"}

        seo = self._parse_json(llm_response)
        if not seo:
            return {"success": False, "error": "Failed to parse LLM response as JSON", "raw": llm_response}

        # Ensure all required fields
        result = {
            "success": True,
            "title": seo.get("title", title),
            "caption": seo.get("caption", ""),
            "description": seo.get("description", ""),
            "hashtags": seo.get("hashtags", []),
            "cover_text": seo.get("cover_text", ""),
            "posting_time": seo.get("posting_time", preset.get("best_times_id", ["12:00"])[0]),
            "engagement_hooks": seo.get("engagement_hooks", []),
        }
        return result

    def generate_batch_seo(
        self,
        items: list[dict],
        platform: str = "tiktok",
        language: str = "id",
    ) -> list[dict]:
        """Generate SEO for multiple items at once.

        Each item: {title, description}
        Returns list of SEO results.
        """
        results = []
        for item in items:
            title = item.get("title", "")
            description = item.get("description", "")
            niche = item.get("niche", "")
            result = self.generate_seo(title, description, platform, language, niche)
            results.append(result)
        return results

    # ── LLM CALL ──────────────────────────────────────────────────

    def _call_llm(self, prompt: str, max_tokens: int = 1500) -> str:
        """Call OmniRoute LLM for SEO generation."""
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

    # ── PROMPT BUILDING ───────────────────────────────────────────

    def _build_prompt(
        self,
        title: str,
        description: str,
        platform: str,
        lang_label: str,
        niche_line: str,
        preset: dict,
    ) -> str:
        """Build platform-specific LLM prompt."""
        if platform == "youtube":
            return self._prompt_youtube(title, description, lang_label, niche_line, preset)
        elif platform == "instagram":
            return self._prompt_instagram(title, description, lang_label, niche_line, preset)
        elif platform == "facebook":
            return self._prompt_facebook(title, description, lang_label, niche_line, preset)
        elif platform == "x":
            return self._prompt_x(title, description, lang_label, niche_line, preset)
        elif platform == "linkedin":
            return self._prompt_linkedin(title, description, lang_label, niche_line, preset)
        elif platform == "threads":
            return self._prompt_threads(title, description, lang_label, niche_line, preset)
        else:
            return self._prompt_tiktok(title, description, lang_label, niche_line, preset)

    def _prompt_tiktok(self, title, description, lang, niche, preset):
        return f"""Generate TikTok SEO metadata for the following content.
Language: {lang}{niche}

Title: {title}
Description: {description}

TikTok algorithm requirements:
- Caption must be SHORT (max 150 chars) with a strong hook in the first 3 words
- Generate 3-5 trending hashtags relevant to the content niche
- Suggest a trending sound or music style
- Create engagement hooks (questions, challenges, CTAs)
- Suggest best posting time for Indonesian audience

Respond in {lang} ONLY. Return valid JSON:
{{
  "title": "optimized TikTok title with hook",
  "caption": "short caption with hook (max 150 chars)",
  "description": "brief video description",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "cover_text": "text for video cover/thumbnail",
  "posting_time": "HH:MM WIB",
  "engagement_hooks": ["hook1", "hook2"],
  "sound_suggestion": "trending sound or music style"
}}"""

    def _prompt_instagram(self, title, description, lang, niche, preset):
        return f"""Generate Instagram SEO metadata for the following content.
Language: {lang}{niche}

Title: {title}
Description: {description}

Instagram algorithm requirements:
- Medium-length caption (max 2200 chars), emoji-rich with line breaks
- Generate 20-30 targeted hashtags (mix of high-volume and niche)
- Include a strong CTA (save, share, comment)
- Mention story for behind-the-scenes
- First 2 lines must hook the reader (before "more" fold)
- Suggest best posting time

Respond in {lang} ONLY. Return valid JSON:
{{
  "title": "optimized Instagram title",
  "caption": "emoji-rich caption with CTA (max 2200 chars)",
  "description": "post description for alt text",
  "hashtags": ["#hashtag1", "#hashtag2", ... (20-30 total)],
  "cover_text": "text for carousel cover or reel thumbnail",
  "posting_time": "HH:MM WIB",
  "engagement_hooks": ["CTA hook", "save prompt", "share prompt"]
}}"""

    def _prompt_youtube(self, title, description, lang, niche, preset):
        return f"""Generate YouTube SEO metadata for the following content.
Language: {lang}{niche}

Title: {title}
Description: {description}

YouTube algorithm requirements:
- SEO-optimized title (max 60 chars, keyword-frontloaded)
- Long description (up to 5000 chars) with timestamps, keywords, links
- 15 relevant tags for discoverability
- Thumbnail text suggestion (3-5 words, bold, readable)
- Front-load keywords in title
- Suggest best posting time

Respond in {lang} ONLY. Return valid JSON:
{{
  "title": "SEO title (max 60 chars, keyword-frontloaded)",
  "caption": "same as title for consistency",
  "description": "long SEO description with keywords (up to 5000 chars)",
  "hashtags": ["tag1", "tag2", ... (15 total, no # prefix for YouTube tags)],
  "cover_text": "thumbnail text (3-5 bold words)",
  "posting_time": "HH:MM WIB",
  "engagement_hooks": ["subscribe CTA", "comment question", "bell notification prompt"]
}}"""

    def _prompt_facebook(self, title, description, lang, niche, preset):
        return f"""Generate Facebook SEO metadata for the following content.
Language: {lang}{niche}

Title: {title}
Description: {description}

Facebook algorithm requirements:
- Long storytelling caption (up to 3000 chars), personal and authentic
- Only 3-5 hashtags (Facebook penalizes hashtag-heavy posts)
- End with an engagement question to boost comments
- Use community-friendly tone
- Suggest best posting time

Respond in {lang} ONLY. Return valid JSON:
{{
  "title": "Facebook post title",
  "caption": "storytelling caption with engagement question (up to 3000 chars)",
  "description": "brief summary",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "cover_text": "text for post image/video",
  "posting_time": "HH:MM WIB",
  "engagement_hooks": ["engagement question", "share prompt", "tag a friend"]
}}"""

    def _prompt_x(self, title, description, lang, niche, preset):
        return f"""Generate X (Twitter) SEO metadata for the following content.
Language: {lang}{niche}

Title: {title}
Description: {description}

X/Twitter algorithm requirements:
- Punchy caption (max 280 chars), thread-ready
- 2-3 hashtags only (more hurts reach on X)
- First tweet must hook immediately
- Include thread structure if content is long
- Suggest best posting time

Respond in {lang} ONLY. Return valid JSON:
{{
  "title": "punchy X title",
  "caption": "tweet copy (max 280 chars, thread-ready)",
  "description": "extended content for thread",
  "hashtags": ["#hashtag1", "#hashtag2"],
  "cover_text": "text for image attachment",
  "posting_time": "HH:MM WIB",
  "engagement_hooks": ["retweet CTA", "reply question", "quote tweet prompt"]
}}"""

    def _prompt_linkedin(self, title, description, lang, niche, preset):
        return f"""Generate LinkedIn SEO metadata for the following content.
Language: {lang}{niche}

Title: {title}
Description: {description}

LinkedIn algorithm requirements:
- Professional, value-first tone (max 1300 chars)
- 3-5 professional/industry hashtags
- Open with a bold insight or contrarian take
- Provide actionable value
- End with professional engagement prompt
- Suggest best posting time

Respond in {lang} ONLY. Return valid JSON:
{{
  "title": "professional LinkedIn title",
  "caption": "value-first professional caption (max 1300 chars)",
  "description": "professional summary",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "cover_text": "text for post graphic",
  "posting_time": "HH:MM WIB",
  "engagement_hooks": ["professional insight question", "share for visibility", "comment your experience"]
}}"""

    def _prompt_threads(self, title, description, lang, niche, preset):
        return f"""Generate Threads SEO metadata for the following content.
Language: {lang}{niche}

Title: {title}
Description: {description}

Threads algorithm requirements:
- Conversational, authentic tone (max 500 chars)
- 3-5 hashtags
- Feel like a genuine personal post, not marketing
- Encourage conversation and replies
- Suggest best posting time

Respond in {lang} ONLY. Return valid JSON:
{{
  "title": "Threads-friendly title",
  "caption": "conversational authentic caption (max 500 chars)",
  "description": "conversational summary",
  "hashtags": ["#hashtag1", "#hashtag2", "#hashtag3"],
  "cover_text": "text for image",
  "posting_time": "HH:MM WIB",
  "engagement_hooks": ["conversation starter", "reply prompt", "repost CTA"]
}}"""

    # ── JSON PARSING ──────────────────────────────────────────────

    @staticmethod
    def _parse_json(text: str) -> dict:
        """Extract JSON object from LLM response using regex."""
        try:
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass
        return {}


# CLI entry point
if __name__ == "__main__":
    import sys

    if len(sys.argv) < 3:
        print("Usage: python seo_generator.py <title> <description> [platform] [language]")
        sys.exit(1)

    title_arg = sys.argv[1]
    desc_arg = sys.argv[2]
    platform_arg = sys.argv[3] if len(sys.argv) > 3 else "tiktok"
    lang_arg = sys.argv[4] if len(sys.argv) > 4 else "id"

    gen = SEOGenerator()
    result = gen.generate_seo(title_arg, desc_arg, platform_arg, lang_arg)
    print(json.dumps(result, indent=2, ensure_ascii=False))
