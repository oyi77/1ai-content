#!/usr/bin/env python3
"""
Trend Analyzer — LLM-powered trend analysis and content opportunity discovery.

Takes output from TrendScanner.scan_all() and uses an LLM to:
- Identify the strongest trending topics across platforms
- Generate content ideas with hashtags
- Surface content opportunities with estimated reach
"""
import json
import os

import httpx

OMNIRoute_URL = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")


class TrendAnalyzer:
    """Analyze trends with LLM to find content opportunities."""

    def __init__(self):
        self.OMNIRoute_URL = OMNIRoute_URL

    # ── LLM-POWERED ANALYSIS ─────────────────────────────────────

    def analyze_trends(self, trends: dict, niche: str = "", language: str = "id") -> dict:
        """Analyze trend data from TrendScanner.scan_all() and find content opportunities.

        Args:
            trends: Output from TrendScanner.scan_all() with youtube/google/reddit keys.
            niche: Optional niche focus for analysis.
            language: Output language code ('id' for Indonesian, 'en' for English).

        Returns:
            {success, trending_topics: [{topic, platform, score, content_ideas, hashtags}],
             opportunities: [{opportunity, why, suggested_format, estimated_views}],
             summary}
        """
        # Build compact context for the LLM
        youtube = trends.get("youtube", [])[:15]
        google = trends.get("google", [])[:15]
        reddit = trends.get("reddit", [])[:15]

        youtube_text = "\n".join(
            f"- {v['title']} (views: {v.get('views', 'N/A')}, channel: {v.get('channel', 'N/A')})"
            for v in youtube
        ) or "(no YouTube data)"

        google_text = "\n".join(
            f"- {t['title']} (traffic: {t.get('traffic', 'N/A')})"
            for t in google
        ) or "(no Google Trends data)"

        reddit_text = "\n".join(
            f"- {p['title']} (score: {p.get('score', 0)}, r/{p.get('subreddit', '')})"
            for p in reddit
        ) or "(no Reddit data)"

        lang_label = "Bahasa Indonesia" if language == "id" else "English"
        niche_clause = f"Focus on the niche: {niche}." if niche else "Cover the broadest opportunities."

        prompt = f"""You are a content strategy expert. Analyze these trending topics across platforms and identify the best content opportunities.

{niche_clause}
Respond in {lang_label}.

## YouTube Trending
{youtube_text}

## Google Trends
{google_text}

## Reddit Hot
{reddit_text}

Return a JSON object with this exact structure:
{{
  "trending_topics": [
    {{
      "topic": "topic name",
      "platform": "youtube|google|reddit|multi",
      "score": 85,
      "content_ideas": ["idea 1", "idea 2", "idea 3"],
      "hashtags": ["#tag1", "#tag2"]
    }}
  ],
  "opportunities": [
    {{
      "opportunity": "what to create",
      "why": "why this will work",
      "suggested_format": "short/reel/long/blog",
      "estimated_views": "10K-50K"
    }}
  ],
  "summary": "2-3 sentence executive summary of findings"
}}

Score each topic 0-100 based on cross-platform momentum. Pick the top 5-8 topics.
Only return valid JSON, no markdown fences."""

        raw = self._call_llm(prompt, max_tokens=2000)
        if not raw:
            return {
                "success": False,
                "trending_topics": [],
                "opportunities": [],
                "summary": "LLM analysis unavailable.",
            }

        # Parse JSON from LLM response (handle markdown fences)
        try:
            cleaned = raw.strip()
            if cleaned.startswith("```"):
                cleaned = "\n".join(cleaned.split("\n")[1:])
            if cleaned.endswith("```"):
                cleaned = cleaned.rsplit("```", 1)[0]
            parsed = json.loads(cleaned.strip())

            return {
                "success": True,
                "trending_topics": parsed.get("trending_topics", []),
                "opportunities": parsed.get("opportunities", []),
                "summary": parsed.get("summary", ""),
            }
        except json.JSONDecodeError:
            return {
                "success": False,
                "trending_topics": [],
                "opportunities": [],
                "summary": f"LLM returned non-JSON response: {raw[:200]}",
            }

    # ── LLM CALL ─────────────────────────────────────────────────

    def _call_llm(self, prompt: str, max_tokens: int = 2000) -> str:
        """Call OmniRoute LLM for analysis."""
        try:
            resp = httpx.post(
                f"{self.OMNIRoute_URL}/chat/completions",
                json={
                    "model": "auto/best-chat",
                    "messages": [{"role": "user", "content": prompt}],
                    "max_tokens": max_tokens,
                    "temperature": 0.7,
                },
                timeout=60,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"⚠️ LLM call failed: {e}")
            return ""


# CLI entry point
if __name__ == "__main__":
    import sys
    from services.trends.scanner import TrendScanner

    niche = sys.argv[1] if len(sys.argv) > 1 else ""
    region = sys.argv[2] if len(sys.argv) > 2 else "ID"

    print("Scanning trends...")
    scanner = TrendScanner()
    trends = scanner.scan_all(niche, region)
    print(f"Found {trends['total_topics']} topics. Analyzing...")

    analyzer = TrendAnalyzer()
    result = analyzer.analyze_trends(trends, niche)
    print(json.dumps(result, indent=2, ensure_ascii=False))
