# Newsletter

Purpose: generate a ready-to-send email newsletter (HTML + plain text) from a topic.

Engine API (services/newsletter/engine.py, class NewsletterEngine):
- `generate(topic, audience="general", sections=3, tone="professional",
  language="en", brand_name="1AI Content", cta_url=None)` -> dict
  Returns `{success, subject, html, plain_text, sections, word_count, language, llm}`.
  `llm_fn` (injectable callable `(text)->str`) is used verbatim when set (tests);
  None triggers a real LLM path (OmniRoute `auto/all-working` with Ollama fallback),
  which falls back to deterministic template copy on any failure — never depends on
  the network to succeed.

HTTP endpoint: `POST /text/newsletter` (router: services/routers/newsletter.py).

Test command:
`cd services && python3 -m pytest tests/test_newsletter_api.py -q`

Reuse anchors:
- LLM pattern mirrored from services/research/engine.py (`_call_llm` + `_clean_llm_json`,
  sync-adapted with httpx.Client).
- DI getter `get_newsletter()` in services/di.py, instance key `"newsletter"`.
- Request model `NewsletterRequest` in services/api_models.py.