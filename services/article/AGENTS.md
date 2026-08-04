# services/article

Long-form article generation engine (HTML or markdown) from a topic.

## Engine API
- `ArticleEngine(llm_fn=None, llm_url=None, api_key=None)` — `llm_fn` injects an LLM callable for tests.
- `generate(topic, keywords=None, audience="general", length_words=800, language="en", tone="informative", format="html") -> dict`
  Returns `{success, title, content, meta_description, word_count, language, format, llm}`.
  Content source order: `llm_fn` (verbatim) → OmniRoute (`auto/best-chat`, Bearer key, 90s) → Ollama (`qwen3:0.6b`) → deterministic template (no network).

## HTTP
- `POST /text/article` — `services/routers/article.py` (`article_router`), body `ArticleRequest` from `services/api_models.py`.

## Test
- `cd services && python3 -m pytest tests/test_article_api.py -q`

## Reuse anchors
- LLM mirror: `services/research/engine.py` `_call_llm` / `_clean_llm_json` (sync-adapted via httpx.Client).
- Router pattern: `services/routers/faceless.py`; DI getter `get_article` in `services/di.py` (instance key `"article"`).
