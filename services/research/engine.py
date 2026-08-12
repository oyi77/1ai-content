"""KDP Book Topic Research Engine — multi-language niche discovery via LLM.

Uses OmniRoute LLM to research trending/booming book topics in any language/market
by combining the LLM's training knowledge with language-specific prompting.

No web scraping required — the LLM already has knowledge of market trends,
bestseller patterns, and demographic data from its training.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from typing import Any

import httpx

OMNIRoute_URL = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")
OMNIROUTE_API_KEY = os.getenv("OMNIROUTE_API_KEY", "")


# ── Data types ──────────────────────────────────────────────────────────────


@dataclass
class BookGenre:
    """A book genre/category with market data."""

    genre: str
    subgenres: list[str] = field(default_factory=list)
    popularity_score: int = 50
    growth_trend: str = "stable"


@dataclass
class BookNiche:
    """A specific book niche/topic with market analysis."""

    niche: str
    target_audience: str = ""
    market_angle: str = ""
    competition_level: str = "medium"
    suggested_titles: list[str] = field(default_factory=list)
    outline_brief: list[str] = field(default_factory=list)
    why_now: str = ""
    language: str = "en"


@dataclass
class LanguageMarket:
    """Market analysis for a specific language/region."""

    language: str
    region: str
    genres: list[BookGenre] = field(default_factory=list)
    niches: list[BookNiche] = field(default_factory=list)
    summary: str = ""


# ── Research Engine ─────────────────────────────────────────────────────────


class ResearchEngine:
    """Multi-language KDP book topic research engine.

    Uses OmniRoute LLM to analyze market trends and generate book topics
    in any language. Covers niches across fiction, non-fiction, self-help,
    education, and more.
    """

    def __init__(self, llm_url: str = OMNIRoute_URL):
        self.llm_url = llm_url
        self._lang_labels = {
            "en": "English",
            "id": "Bahasa Indonesia (Indonesian)",
            "ms": "Bahasa Melayu (Malay)",
            "th": "ภาษาไทย (Thai)",
            "vi": "Tiếng Việt (Vietnamese)",
            "zh": "中文 (Chinese)",
            "ja": "日本語 (Japanese)",
            "ko": "한국어 (Korean)",
            "es": "Español (Spanish)",
            "pt": "Português (Portuguese)",
            "fr": "Français (French)",
            "de": "Deutsch (German)",
            "ar": "العربية (Arabic)",
            "hi": "हिन्दी (Hindi)",
        }

    # ── Public API ───────────────────────────────────────────────────────

    async def research_niches(
        self,
        language: str = "en",
        region: str = "",
        category: str = "",
        count: int = 8,
        source_hint: str = "",
    ) -> LanguageMarket:
        """Research trending book niches in a given language/market.

        Args:
            language: ISO language code (en, id, ms, th, zh, etc.)
            region: Specific region/country (e.g. 'US', 'UK', 'Indonesia', 'Malaysia')
            category: Optional category filter (e.g. 'self-help', 'fiction', 'education')
            count: Number of niches to generate
            source_hint: Optional hint about data source (e.g. 'Amazon bestsellers', 'Google Books')

        Returns:
            LanguageMarket with genres and niches
        """
        lang_label = self._lang_labels.get(language, language)
        region_clause = f" specifically in/for {region}" if region else ""
        category_clause = f" Focus on the category: {category}." if category else ""
        source_clause = f"\nContext from market data: {source_hint}" if source_hint else ""

        source_instr = ""
        if not source_hint:
            source_instr = (
                "\nBase your analysis on current Amazon KDP bestseller trends, "
                "Google Books data, and what you know about trending book topics "
                "in this market."
            )

        prompt = f"""You are a KDP (Kindle Direct Publishing) market research analyst. 
Research the best book niches in {lang_label}{region_clause} for print-on-demand and e-book publishing.{category_clause}{source_instr}{source_clause}

Return a JSON object with this exact structure:
{{
  "genres": [
    {{
      "genre": "Main genre name",
      "subgenres": ["subgenre A", "subgenre B"],
      "popularity_score": 85,
      "growth_trend": "rising|stable|declining"
    }}
  ],
  "niches": [
    {{
      "niche": "Specific book niche/topic",
      "target_audience": "Description of who buys these books",
      "market_angle": "Unique angle to differentiate",
      "competition_level": "low|medium|high",
      "suggested_titles": ["Title Option 1", "Title Option 2", "Title Option 3"],
      "outline_brief": ["Chapter 1 topic", "Chapter 2 topic", "Chapter 3 topic"],
      "why_now": "Why this topic is trending now"
    }}
  ],
  "summary": "2-3 sentence executive summary of the best opportunity"
}}

Constraints:
- Generate {count} specific, actionable niches
- Score popularity 0-100 based on current demand
- Niches should be book-worthy topics with clear market demand
- Titles should be in {lang_label}
- Outline brief should have 5-7 bullet points
- Competition level must reflect actual KDP market difficulty
- Return ONLY valid JSON, no markdown fences"""

        raw = await self._call_llm(prompt, max_tokens=3000)
        if not raw:
            return LanguageMarket(
                language=language,
                region=region,
                summary="LLM research unavailable.",
            )

        return self._parse_market_response(raw, language, region)

    @staticmethod
    def _clean_llm_json(raw: str) -> str:
        """Strip markdown fences and preamble from LLM JSON response.

        Handles:
        - ```json ... ``` fences
        - ``` ... ``` generic fences
        - Preamble text before the first fence
        - Trailing text after closing fence
        - Missing fences (pass-through)
        """
        if not raw or not raw.strip():
            return ""

        cleaned = raw.strip()

        # Strip leading fence line (```json, ```, ```JSON, etc.)
        if cleaned.startswith("```"):
            idx = cleaned.find("\n")
            if idx != -1:
                cleaned = cleaned[idx + 1:]
            else:
                return ""

        # Strip trailing fence (```)
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        # Handle ``` at end + trailing whitespace
        cleaned = cleaned.strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]

        # If there's text after the closing fence, drop it
        cleaned = cleaned.strip()
        if cleaned.startswith("```"):
            idx = cleaned.find("\n")
            if idx != -1:
                cleaned = cleaned[idx + 1:]

        return cleaned.strip()

    async def generate_book_brief(
        self,
        niche: str,
        language: str = "en",
        region: str = "",
        target_market: str = "",
    ) -> dict[str, Any]:
        """Generate a detailed book brief for a specific niche.

        Args:
            niche: The book topic/niche
            language: Output language code
            region: Target region
            target_market: Specific demographic target

        Returns:
            Dict with book title, description, outline, audience, etc.
        """
        lang_label = self._lang_labels.get(language, language)
        market_clause = f"Target market: {target_market}." if target_market else ""
        region_clause = f" Region: {region}." if region else ""

        prompt = f"""You are a KDP book strategist. Create a detailed book brief for this niche: "{niche}"

Language: {lang_label}{region_clause} {market_clause}

Return a JSON object:
{{
  "title": "Optimal book title in the target language",
  "subtitle": "Compelling subtitle",
  "description": "Book description / blurb (50-100 words)",
  "target_audience": "Who this book is for",
  "primary_genre": "Amazon KDP genre/category",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"],
  "outline": [
    {{
      "chapter": "Chapter 1 Title",
      "summary": "What this chapter covers"
    }}
  ],
  "estimated_length_pages": 120,
  "cover_style": "Description of cover design that sells"
}}

Generate 7-10 chapters with detailed summaries.
Return ONLY valid JSON, no markdown fences."""

        raw = await self._call_llm(prompt, max_tokens=3000)
        if not raw:
            return {"success": False, "error": "LLM unavailable"}

        try:
            cleaned = self._clean_llm_json(raw)

            parsed = json.loads(cleaned.strip())
            parsed["success"] = True
            return parsed
        except json.JSONDecodeError:
            return {"success": False, "error": f"LLM returned non-JSON: {raw[:200]}"}

    # ── Internal ────────────────────────────────────────────────────────

    def _parse_market_response(self, raw: str, language: str, region: str) -> LanguageMarket:
        """Parse LLM JSON response into LanguageMarket dataclass."""
        try:
            cleaned = self._clean_llm_json(raw)
            parsed = json.loads(cleaned.strip())
        except json.JSONDecodeError:
            return LanguageMarket(
                language=language,
                region=region,
                summary=f"Parse error — raw: {raw[:200]}",
            )

        genres = [
            BookGenre(
                genre=g.get("genre", ""),
                subgenres=g.get("subgenres", []),
                popularity_score=g.get("popularity_score", 50),
                growth_trend=g.get("growth_trend", "stable"),
            )
            for g in parsed.get("genres", [])
        ]

        niches = [
            BookNiche(
                niche=n.get("niche", ""),
                target_audience=n.get("target_audience", ""),
                market_angle=n.get("market_angle", ""),
                competition_level=n.get("competition_level", "medium"),
                suggested_titles=n.get("suggested_titles", []),
                outline_brief=n.get("outline_brief", []),
                why_now=n.get("why_now", ""),
                language=language,
            )
            for n in parsed.get("niches", [])
        ]

        return LanguageMarket(
            language=language,
            region=region,
            genres=genres,
            niches=niches,
            summary=parsed.get("summary", ""),
        )

    async def _call_llm(self, prompt: str, max_tokens: int = 2000) -> str:
        """Call LLM for research analysis. Tries OmniRoute first, falls back to local Ollama."""
        # Provider 1: OmniRoute
        if OMNIROUTE_API_KEY:
            try:
                headers = {"Authorization": f"Bearer {OMNIROUTE_API_KEY}"}
                async with httpx.AsyncClient(timeout=90) as client:
                    resp = await client.post(
                        f"{self.llm_url}/chat/completions",
                        headers=headers,
                        json={
                            "model": "auto/all-working",
                            "messages": [{"role": "user", "content": prompt}],
                            "max_tokens": max_tokens,
                            "temperature": 0.7,
                            "stream": False,
                        },
                        timeout=90,
                    )
                    resp.raise_for_status()
                    content = resp.json()["choices"][0]["message"]["content"]
                    if content:
                        return content
            except Exception as e:
                print(f"[ResearchEngine] OmniRoute call failed: {e}")

        # Provider 2: local Ollama fallback (qwen3:0.6b — small reasoning model, clean JSON)
        ollama_url = "http://localhost:11434/v1"
        try:
            # qwen3:0.6b is a reasoning model — ~1K tokens for thinking + ~500-1K for output
            effective_max = max(max_tokens, 2000)
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    f"{ollama_url}/chat/completions",
                    json={
                        "model": "qwen3:0.6b",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": effective_max,
                        "temperature": 0.3,
                    },
                    timeout=120,
                )
                resp.raise_for_status()
                result = resp.json()
                content = result["choices"][0]["message"]["content"]
                reasoning = result["choices"][0]["message"].get("reasoning", "")
                if not content and reasoning:
                    # Reasoning model consumed all tokens on reasoning — retry with higher limit
                    print(f"[ResearchEngine] qwen3:0.6b reasoning-only output, retrying with +2000 tokens")
                    async with httpx.AsyncClient(timeout=120) as client:
                        resp2 = await client.post(
                            f"{ollama_url}/chat/completions",
                            json={
                                "model": "qwen3:0.6b",
                                "messages": [{"role": "user", "content": prompt}],
                                "max_tokens": effective_max + 2000,
                                "temperature": 0.3,
                            },
                            timeout=120,
                        )
                        resp2.raise_for_status()
                        result2 = resp2.json()
                        content = result2["choices"][0]["message"]["content"]
                if content:
                    return content
        except Exception as e:
            print(f"[ResearchEngine] Ollama fallback (qwen3:0.6b) failed: {e}")
            return ""


# ── CLI entry point ─────────────────────────────────────────────────────────


async def _cli():
    import sys

    lang = sys.argv[1] if len(sys.argv) > 1 else "en"
    cat = sys.argv[2] if len(sys.argv) > 2 else ""

    engine = ResearchEngine()
    result = await engine.research_niches(language=lang, category=cat)

    print(f"\n{'='*60}")
    print(f"Language: {lang}  |  Category: {cat or 'all'}")
    print(f"Summary: {result.summary}")
    print(f"\nGenres ({len(result.genres)}):")
    for g in result.genres:
        print(f"  • {g.genre} (score: {g.popularity_score}, trend: {g.growth_trend})")
    print(f"\nTop Niches ({len(result.niches)}):")
    for n in result.niches:
        print(f"\n  ■ {n.niche}")
        print(f"    Audience: {n.target_audience}")
        print(f"    Competition: {n.competition_level}")
        print(f"    Why now: {n.why_now}")
        if n.suggested_titles:
            print(f"    Titles: {', '.join(n.suggested_titles[:3])}")


if __name__ == "__main__":
    import asyncio

    asyncio.run(_cli())
