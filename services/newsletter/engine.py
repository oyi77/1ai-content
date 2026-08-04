#!/usr/bin/env python3
"""
Newsletter Engine — generate a ready-to-send email newsletter from a topic.

Builds an outline of section titles, produces body copy via an injectable
``llm_fn`` (tests) or a real LLM call (OmniRoute with Ollama fallback), then
renders an email-friendly HTML version plus a plain-text version.

Always falls back to deterministic, network-free template copy when the LLM is
unavailable or fails, so ``generate`` never depends on the network to succeed.
"""

from __future__ import annotations

import html
import json
import os
from typing import Callable, Optional

import httpx

OMNIRoute_URL = os.getenv("OMNIRoute_URL", "http://127.0.0.1:20128/v1")
OMNIROUTE_API_KEY = os.getenv("OMNIROUTE_API_KEY", "")


class NewsletterEngine:
    """Generate an HTML email newsletter from a topic.

    Injectable ``llm_fn`` (a callable ``(text: str) -> str``) is used verbatim
    when set — this is how tests drive deterministic generation without any
    network. When it is None the engine calls the real LLM (OmniRoute, with a
    local Ollama fallback) and, on any failure, falls back to deterministic
    template copy so the call always returns a ``success`` payload.
    """

    def __init__(
        self,
        llm_fn: Optional[Callable[[str], str]] = None,
        llm_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        self.llm_fn = llm_fn
        self.llm_url = llm_url or OMNIRoute_URL
        self.api_key = api_key if api_key is not None else OMNIROUTE_API_KEY

    # ── Outline / template helpers ────────────────────────────────────────

    @staticmethod
    def _section_titles(topic: str, sections: int) -> list[str]:
        """Deterministic, language-light section titles for a newsletter."""
        count = max(1, int(sections))
        t = topic.strip() or "Your Topic"
        titles = [
            f"Introduction: What is {t}",
            f"Key Benefits of {t}",
            f"How to Get Started with {t}",
            f"Common Challenges with {t}",
            f"Best Practices & Tips for {t}",
            f"Real-World Examples of {t}",
            f"Tools & Resources for {t}",
            "Future Outlook",
            "Actionable Takeaways",
            "Summary & Next Steps",
        ]
        # Ensure we never generate more titles than the section count.
        picked = []
        for i in range(count):
            picked.append(titles[i] if i < len(titles) else f"Section {i + 1}: {t}")
        return picked

    @staticmethod
    def _subject_line(topic: str, brand_name: str) -> str:
        t = topic.strip() or "Your Topic"
        return f"{t} — Insights from {brand_name}"

    @staticmethod
    def _fallback_paragraph(topic: str, title: str, index: int, tone: str) -> str:
        """Deterministic paragraph generated purely from topic + section index."""
        t = topic.strip() or "Your Topic"
        lead = {
            "casual": f"Let's dig into {title.lower()} a little.",
            "professional": f"This section explores {title.lower()} in practical detail.",
            "enthusiastic": f"We are excited to break down {title.lower()} for you!",
            "educational": f"Here you will learn the essentials of {title.lower()}.",
        }.get(tone, f"This section covers {title.lower()}.")
        return (
            f"{lead} A solid understanding of {t} makes a real difference. "
            f"Start from first principles, look at how the idea applies to your own context, "
            f"then experiment one step at a time. Revisit the foundation often and note what "
            f"moves the needle for your specific goals — this is step {index + 1} in building "
            f"lasting momentum with {t}."
        )

    @staticmethod
    def _clean_llm_json(raw: str) -> str:
        """Strip markdown fences and preamble from an LLM JSON response."""
        text = (raw or "").strip()
        if text.startswith("```"):
            text = text.strip("`")
            if text.startswith("json"):
                text = text[4:].lstrip()
        # Cut anything before the first '{' if the model added prose.
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]
        return text.strip()

    # ── LLM plumbing ──────────────────────────────────────────────────────

    def _call_llm(self, prompt: str, max_tokens: int = 900) -> str:
        """Call the real LLM synchronously. OmniRoute first, Ollama fallback."""
        # Provider 1: OmniRoute
        if self.api_key:
            try:
                resp = httpx.Client(timeout=90).post(
                    f"{self.llm_url}/chat/completions",
                    headers={"Authorization": f"Bearer {self.api_key}"},
                    json={
                        "model": "auto/best-chat",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": max_tokens,
                        "temperature": 0.7,
                    },
                    timeout=90,
                )
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"]
                if content:
                    return content
            except Exception as e:
                print(f"[NewsletterEngine] OmniRoute call failed: {e}")

        # Provider 2: local Ollama fallback (qwen3:0.6b).
        ollama_url = "http://localhost:11434/v1"
        try:
            with httpx.Client(timeout=120) as client:
                resp = client.post(
                    f"{ollama_url}/chat/completions",
                    json={
                        "model": "qwen3:0.6b",
                        "messages": [{"role": "user", "content": prompt}],
                        "max_tokens": max(max_tokens, 1600),
                        "temperature": 0.3,
                    },
                    timeout=120,
                )
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"]
                if content:
                    return content
        except Exception as e:
            print(f"[NewsletterEngine] Ollama fallback failed: {e}")
        return ""

    def _llm_generate(self, topic: str, titles: list[str], audience: str, tone: str) -> Optional[dict]:
        """Ask the LLM for subject + section titles/bodies as JSON. Returns None on failure."""
        title_json = json.dumps(titles, ensure_ascii=False)
        prompt = (
            "You are an expert email copywriter. Write a professional newsletter about "
            f"the topic: {topic!r} for a {audience!r} audience in a {tone!r} tone.\n"
            f"Use exactly these section titles (in order): {title_json}\n"
            "Respond with ONLY a JSON object of the form:\n"
            '{"subject": "<email subject>", "sections": [{"title": "...", "body": "<2-3 sentence paragraph>"}]}\n'
            "No markdown fences, no extra prose."
        )
        raw = self._call_llm(prompt, max_tokens=1800)
        if not raw:
            return None
        try:
            parsed = json.loads(self._clean_llm_json(raw))
            subject = (parsed.get("subject") or "").strip()
            sections = parsed.get("sections") or []
            if not subject or not sections:
                return None
            # Normalize to our length, prefer LLM titles, fill gaps with deterministic copy.
            built = []
            for i in range(len(titles)):
                item = sections[i] if i < len(sections) else {}
                title = (item.get("title") or "").strip() or titles[i]
                body = (item.get("body") or "").strip()
                if not body:
                    body = self._fallback_paragraph(topic, title, i, tone)
                built.append({"title": title, "body": body})
            return {"subject": subject, "sections": built}
        except (json.JSONDecodeError, TypeError, AttributeError):
            return None

    # ── Rendering ─────────────────────────────────────────────────────────

    @staticmethod
    def _esc(s: str) -> str:
        return html.escape(str(s), quote=True)

    def _render_html(
        self,
        subject: str,
        topic: str,
        brand_name: str,
        sections: list[dict],
        tone: str,
        cta_url: Optional[str],
    ) -> str:
        head = self._esc(subject)
        brand = self._esc(brand_name)
        topic_esc = self._esc(topic)
        intro = self._esc(
            f"Hello! Here is the latest from {brand_name}, focused on {topic}. "
            "We hope you find it useful."
        )
        blocks = []
        for i, sec in enumerate(sections):
            blocks.append(
                f'      <h2 style="margin:0 0 8px;font-size:18px;color:#4a1560;">'
                f"{self._esc(sec['title'])}</h2>\n"
                f'      <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#333333;">'
                f"{self._esc(sec['body'])}</p>"
            )
        sections_html = "\n".join(blocks)
        cta = ""
        if cta_url:
            cta = (
                '\n      <p style="margin:24px 0 0;text-align:center;">\n'
                f'        <a href="{self._esc(cta_url)}" '
                'style="display:inline-block;padding:12px 24px;background:#7b1fa2;color:#ffffff;'
                'text-decoration:none;border-radius:6px;font-size:15px;font-weight:600;">'
                f"Learn more about {topic_esc}</a>\n"
                "      </p>"
            )
        footer = self._esc(f"You are receiving this from {brand_name}. Manage your preferences or unsubscribe anytime.")
        return (
            "<!DOCTYPE html>\n"
            '<html lang="en">\n'
            "  <head>\n"
            "    <meta charset=\"utf-8\">\n"
            "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n"
            "    <title>%s</title>\n"
            "    <style>\n"
            "      body{margin:0;padding:0;background:#f4f0f8;font-family:Arial,Helvetica,sans-serif;}\n"
            "      .email{max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e6dff2;}\n"
            "      .header{background:#7b1fa2;padding:24px 32px;color:#ffffff;}\n"
            "      .header h1{margin:0;font-size:22px;}\n"
            "      .intro{padding:24px 32px 0;font-size:15px;line-height:1.6;color:#333333;}\n"
            "      .body{padding:16px 32px 8px;}\n"
            "      .footer{padding:16px 32px 24px;font-size:12px;color:#888888;border-top:1px solid #eee;}\n"
            "      @media (prefers-color-scheme: light){body{background:#f4f0f8;}}\n"
            "    </style>\n"
            "  </head>\n"
            "  <body>\n"
            '    <div class="email">\n'
            '      <div class="header"><h1>%s</h1></div>\n'
            '      <div class="intro">%s</div>\n'
            '      <div class="body">\n'
            "%s\n"
            "      </div>\n"
            "%s\n"
            '      <div class="footer">%s</div>\n'
            "    </div>\n"
            "  </body>\n"
            "</html>"
        ) % (head, brand, intro, sections_html, cta, footer)

    @staticmethod
    def _render_plain(subject: str, sections: list[dict], cta_url: Optional[str]) -> str:
        lines = [subject, ""]
        for sec in sections:
            lines.append(sec["title"])
            lines.append(sec["body"])
            lines.append("")
        if cta_url:
            lines.append(f"Learn more: {cta_url}")
            lines.append("")
        return "\n".join(lines).strip()

    # ── Public API ────────────────────────────────────────────────────────

    def generate(
        self,
        topic: str,
        audience: str = "general",
        sections: int = 3,
        tone: str = "professional",
        language: str = "en",
        brand_name: str = "1AI Content",
        cta_url: Optional[str] = None,
    ) -> dict:
        """Generate a newsletter: subject + sections + HTML + plain text.

        Returns a JSON-serializable dict starting with ``success: bool`` and
        including ``llm`` (True when injectable llm_fn or the real LLM produced
        the copy, False when deterministic template fallback was used).
        """
        if not topic or not str(topic).strip():
            return {"success": False, "error": "topic is required"}
        topic = str(topic).strip()
        count = max(1, int(sections))
        titles = self._section_titles(topic, count)
        llm_used = False

        subject = self._subject_line(topic, brand_name)
        body_sections = [
            {"title": titles[i], "body": self._fallback_paragraph(topic, titles[i], i, tone)}
            for i in range(count)
        ]

        if self.llm_fn is not None:
            # Injectable function: one call per section, output used verbatim.
            body_sections = []
            for i in range(count):
                prompt = (
                    f"Write body copy for a newsletter section titled {titles[i]!r} "
                    f"about {topic!r}, for a {audience!r} audience, in a {tone!r} tone. "
                    "Return only the paragraph text, 2-3 sentences."
                )
                text = str(self.llm_fn(prompt) or "").strip()
                if not text:
                    text = self._fallback_paragraph(topic, titles[i], i, tone)
                body_sections.append({"title": titles[i], "body": text})
            llm_used = True
        else:
            content = self._llm_generate(topic, titles, audience, tone)
            if content:
                subject = content["subject"]
                body_sections = content["sections"]
                llm_used = True

        subject_clean = subject.strip() or self._subject_line(topic, brand_name)
        html_body = self._render_html(
            subject_clean, topic, brand_name, body_sections, tone, cta_url
        )
        plain_text = self._render_plain(subject_clean, body_sections, cta_url)

        word_count = sum(len(p.split()) for s in body_sections for p in (s["body"],)) + len(
            subject_clean.split()
        )

        return {
            "success": True,
            "subject": subject_clean,
            "html": html_body,
            "plain_text": plain_text,
            "sections": [s["title"] for s in body_sections],
            "word_count": word_count,
            "language": language,
            "llm": llm_used,
        }