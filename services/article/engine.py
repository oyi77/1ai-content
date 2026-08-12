"""Long-form article generation engine (HTML or markdown).

Content source order (mirrors ``services.research.engine``, sync-adapted):

1. ``self.llm_fn`` — injected callable (tests / external), output used verbatim.
2. Real LLM via sync ``httpx.Client``: OmniRoute
   (``auto/all-working``, Bearer ``OMNIROUTE_API_KEY``, 90s) first, then local
   Ollama (``qwen3:0.6b``) as fallback.
3. Deterministic template fallback (no network) when the LLM is unavailable
   or returns unusable content.
"""

from __future__ import annotations

import html as html_lib
import json
import os
import re
from typing import Any, Callable, Optional

import httpx

OMNIRoute_URL = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")
OMNIROUTE_API_KEY = os.getenv("OMNIROUTE_API_KEY", "")
OLLAMA_URL = "http://localhost:11434/v1"

DEFAULT_MODEL = "auto/all-working"
FALLBACK_MODEL = "qwen3:0.6b"

_TAG_RE = re.compile(r"<[^>]+>")


class ArticleEngine:
    """Generate long-form articles as HTML or markdown from a topic."""

    def __init__(
        self,
        llm_fn: Optional[Callable[[str], str]] = None,
        llm_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ) -> None:
        self.llm_fn = llm_fn
        self.llm_url = llm_url or OMNIRoute_URL
        self.api_key = api_key if api_key is not None else OMNIROUTE_API_KEY

    # ── public API ──────────────────────────────────────────────────────────

    def generate(
        self,
        topic: str,
        keywords: Optional[list[str]] = None,
        audience: str = "general",
        length_words: int = 800,
        language: str = "en",
        tone: str = "informative",
        format: str = "html",
    ) -> dict:
        """Generate an article about *topic*.

        Returns ``{success, title, content, meta_description, word_count,
        language, format, llm}`` where ``content`` is HTML or markdown per
        *format* and ``llm`` is True when LLM content was used.
        """
        topic = (topic or "").strip()
        if not topic:
            return {"success": False, "error": "topic is required"}
        if format not in ("html", "markdown"):
            return {
                "success": False,
                "error": f"unsupported format: {format!r} (expected html or markdown)",
            }
        keywords = [str(k).strip() for k in (keywords or []) if str(k).strip()]

        plan, used_llm = self._plan(
            topic=topic,
            keywords=keywords,
            audience=audience,
            length_words=int(length_words),
            language=language,
            tone=tone,
        )
        content = self._render(plan, format=format)
        return {
            "success": True,
            "title": plan["title"],
            "content": content,
            "meta_description": plan["meta_description"],
            "word_count": self._word_count(content, format=format),
            "language": language,
            "format": format,
            "llm": used_llm,
        }

    # ── content planning ────────────────────────────────────────────────────

    def _plan(self, topic, keywords, audience, length_words, language, tone) -> tuple[dict, bool]:
        """Build a content plan ``{title, meta_description, sections}``.

        Returns ``(plan, used_llm)``.
        """
        prompt = self._build_prompt(
            topic=topic,
            keywords=keywords,
            audience=audience,
            length_words=length_words,
            language=language,
            tone=tone,
        )
        raw = ""
        if self.llm_fn is not None:
            try:
                raw = self.llm_fn(prompt) or ""
            except Exception as exc:  # pragma: no cover - injected callable may fail
                print(f"[ArticleEngine] llm_fn failed: {exc}")
                raw = ""
        if not raw:
            raw = self._call_llm(prompt)
        if raw:
            plan = self._parse_plan(raw)
            if plan is not None:
                return plan, True
        return self._template_plan(topic, keywords, audience, length_words, tone), False

    def _build_prompt(self, topic, keywords, audience, length_words, language, tone) -> str:
        kw = ", ".join(keywords) if keywords else "none"
        return (
            "You are a professional long-form content writer. Write an article "
            f"about: {topic}\n"
            f"Audience: {audience}\n"
            f"Target length: {length_words} words\n"
            f"Language: {language}\n"
            f"Tone: {tone}\n"
            f"Keywords to weave into the body naturally: {kw}\n"
            "Return ONLY strict JSON (no markdown fences, no preamble, no commentary) "
            "with exactly this shape:\n"
            '{"title": "...", "meta_description": "...", '
            '"sections": [{"heading": "...", "paragraphs": ["...", "..."]}]}\n'
            "Use 3 to 6 sections and 1 to 3 paragraphs per section."
        )

    def _call_llm(self, prompt: str, max_tokens: int = 2000) -> str:
        """Real LLM: OmniRoute first, local Ollama fallback. Raw text or ''."""
        if self.api_key:
            try:
                with httpx.Client(timeout=90) as client:
                    resp = client.post(
                        f"{self.llm_url}/chat/completions",
                        headers={"Authorization": f"Bearer {self.api_key}"},
                        json={
                            "model": DEFAULT_MODEL,
                            "messages": [{"role": "user", "content": prompt}],
                            "max_tokens": max_tokens,
                            "temperature": 0.7,
                            "stream": False,
                        },
                    )
                    resp.raise_for_status()
                    content = resp.json()["choices"][0]["message"]["content"]
                    if content:
                        return content
            except Exception as exc:
                print(f"[ArticleEngine] OmniRoute call failed: {exc}")

        try:
            effective_max = max(max_tokens, 2000)
            with httpx.Client(timeout=120) as client:
                resp = client.post(
                    f"{OLLAMA_URL}/chat/completions",
                    json={
                        "model": FALLBACK_MODEL,
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": effective_max,
                        "temperature": 0.3,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                message = data["choices"][0]["message"]
                content = message.get("content") or ""
                reasoning = message.get("reasoning") or ""
                if not content and reasoning:
                    # Reasoning model consumed all tokens on reasoning — retry
                    resp2 = client.post(
                        f"{OLLAMA_URL}/chat/completions",
                        json={
                            "model": FALLBACK_MODEL,
                            "messages": [{"role": "user", "content": prompt}],
                            "max_tokens": effective_max + 2000,
                            "temperature": 0.3,
                        },
                    )
                    resp2.raise_for_status()
                    content = resp2.json()["choices"][0]["message"].get("content") or ""
                if content:
                    return content
        except Exception as exc:
            print(f"[ArticleEngine] Ollama fallback ({FALLBACK_MODEL}) failed: {exc}")
        return ""

    @staticmethod
    def _clean_llm_json(raw: str) -> str:
        """Strip markdown fences and preamble from LLM JSON output."""
        text = (raw or "").strip()
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end > start:
            text = text[start : end + 1]
        return text

    def _parse_plan(self, raw: str) -> Optional[dict]:
        """Parse LLM JSON into a validated plan, or None when unusable."""
        try:
            data = json.loads(self._clean_llm_json(raw))
        except (ValueError, TypeError):
            return None
        if not isinstance(data, dict):
            return None
        title = str(data.get("title") or "").strip()
        meta = str(data.get("meta_description") or "").strip()
        sections_raw = data.get("sections")
        if not title or not meta or not isinstance(sections_raw, list) or not sections_raw:
            return None
        sections: list[dict[str, Any]] = []
        for sec in sections_raw[:6]:
            if not isinstance(sec, dict):
                continue
            heading = str(sec.get("heading") or "").strip()
            paras = sec.get("paragraphs")
            if not heading or not isinstance(paras, list):
                continue
            clean = [str(p).strip() for p in paras if str(p).strip()][:3]
            if not clean:
                continue
            sections.append({"heading": heading, "paragraphs": clean})
        if len(sections) < 3:
            return None
        return {"title": title, "meta_description": meta, "sections": sections}

    # ── deterministic template fallback (no network) ────────────────────────

    @staticmethod
    def _clamp(value: int, low: int, high: int) -> int:
        return max(low, min(high, value))

    def _template_plan(self, topic, keywords, audience, length_words, tone) -> dict:
        """Deterministic placeholder content from the input (no LLM)."""
        section_count = self._clamp(round(length_words / 220), 3, 6)
        paragraphs_per = self._clamp(round(length_words / (section_count * 140)), 1, 3)

        if keywords:
            headings = ["Introduction"]
            headings += [kw.title() for kw in keywords[:4]]
            headings.append("Conclusion")
        else:
            headings = [
                "Introduction",
                "What You Should Know",
                "Key Benefits",
                "Practical Tips",
                "Common Pitfalls",
                "Conclusion",
            ]
        headings = headings[:section_count]
        if headings[-1] != "Conclusion" and section_count > 1:
            headings[-1] = "Conclusion"

        sections: list[dict[str, Any]] = []
        for idx, heading in enumerate(headings):
            kw = keywords[idx - 1] if keywords and idx > 0 and idx - 1 < len(keywords) else None
            sections.append(
                {
                    "heading": heading,
                    "paragraphs": [
                        self._template_paragraph(
                            topic=topic,
                            audience=audience,
                            tone=tone,
                            keyword=kw,
                            section_idx=idx,
                            para_idx=p,
                        )
                        for p in range(paragraphs_per)
                    ],
                }
            )

        meta = (
            f"A {tone} article about {topic} written for {audience} readers"
            + (f", covering {', '.join(keywords)}" if keywords else "")
            + "."
        )
        title = f"{topic.title()}: A Complete Guide"
        return {"title": title, "meta_description": meta, "sections": sections}

    @staticmethod
    def _template_paragraph(topic, audience, tone, keyword, section_idx, para_idx) -> str:
        """Build one deterministic paragraph from fixed sentence banks."""
        subject = keyword or topic
        intro_bank = [
            f"This section focuses on {subject} and how it fits into the broader topic of {topic}.",
            f"When it comes to {topic}, {subject} deserves a closer look.",
            f"{subject.title()} is one of the most useful angles on {topic} for {audience} readers.",
        ]
        body_bank = [
            f"Understanding {subject} helps {audience} audiences make better decisions and avoid costly mistakes.",
            f"A practical, {tone} approach to {subject} makes the material easy to apply in real situations.",
            f"Most guides skip the details that matter, but here every point about {subject} is tied back to {topic}.",
            f"For anyone exploring {topic}, mastering {subject} is a natural next step.",
        ]
        close_bank = [
            f"Keep this in mind as you continue reading about {topic}.",
            f"With {subject} covered, the rest of {topic} becomes much easier to understand.",
            f"Return to this section whenever you need a refresher on {subject}.",
        ]
        sentences = [
            intro_bank[(section_idx + para_idx) % len(intro_bank)],
            body_bank[(section_idx * 2 + para_idx) % len(body_bank)],
            body_bank[(section_idx + para_idx * 2 + 1) % len(body_bank)],
            close_bank[(section_idx + para_idx) % len(close_bank)],
        ]
        return " ".join(sentences)

    # ── rendering ───────────────────────────────────────────────────────────

    def _render(self, plan: dict, format: str) -> str:
        title = plan["title"]
        meta = plan["meta_description"]
        sections = plan["sections"]
        if format == "html":
            parts = ["<article>", f"  <h1>{html_lib.escape(title)}</h1>",
                     f'  <p class="meta">{html_lib.escape(meta)}</p>']
            for sec in sections:
                parts.append(f"  <h2>{html_lib.escape(sec['heading'])}</h2>")
                for para in sec["paragraphs"]:
                    parts.append(f"  <p>{html_lib.escape(para)}</p>")
            parts.append("</article>")
            return "\n".join(parts)
        parts = [f"# {title}", "", meta, ""]
        for sec in sections:
            parts.append(f"## {sec['heading']}")
            parts.append("")
            parts.extend(para for para in sec["paragraphs"])
            parts.append("")
        return "\n".join(parts).rstrip() + "\n"

    @staticmethod
    def _word_count(content: str, format: str) -> int:
        text = content
        if format == "html":
            text = _TAG_RE.sub(" ", text)
        else:
            text = re.sub(r"^\s*#{1,6}\s*", "", text, flags=re.MULTILINE)
        return len(text.split())
