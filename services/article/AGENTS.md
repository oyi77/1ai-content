# services/article

Long-form article generation engine (HTML or markdown) from a topic.

## Engine API
- `ArticleEngine(llm_fn=None, llm_url=None, api_key=None)` — `llm_fn` injects an LLM callable for tests.
- `generate(topic, keywords=None, audience="general", length_words=800, language="en", tone="informative", format="html") -> dict`
  Returns `{success, title, content, meta_description, word_count, language, format, llm}`.
  Content source order: `llm_fn` (verbatim) → OmniRoute (`auto/best-chat`, Bearer key, 90s) → Ollama (`qwen3:0.6b`) → deterministic template (no network).

## HTTP (`services/routers/article.py`, `article_router`)
- `POST /text/article` — body `ArticleRequest` from `services/api_models.py`. On success the article is persisted to the sqlite side-store and the response gains a `slug`. Failure to store → 500 (generation still returns).
- `GET /text/articles?limit=50` — list persisted articles, metadata only, newest first (default 50; no clamp on negative/oversized limit). Wraps `{"success": true, "articles": [...]}`.
- `GET /text/articles/{slug}` — single persisted article (full record incl. `content`). Missing → 404 `{"detail": "Article not found: {slug}"}`. Wraps `{"success": true, "article": {...}}`.

## Persistence (`services/article/store.py`)
- `ArticleStore` (stdlib `sqlite3`), DB `ARTICLES_DB_PATH` env (default `services/data/article.sqlite`, gitignored).
- `save(dict) -> slug` (slugify + dedupe; `_slug()` fallback `"article"`), `list(limit) -> [{slug,title,meta_description,language,format,word_count,created_at}]` (metadata only, newer-first), `get(slug) -> full record | None`.
- Singleton `_store = ArticleStore()` (`store.py:114`) via `get_article_store()`; test DI overlay uses key `"article"` (`services/tests/conftest.py`).

## Test
- `cd services && python3 -m pytest tests/test_article_api.py tests/test_article_store.py -q`

## Reuse anchors
- LLM mirror: `services/research/engine.py` `_call_llm` / `_clean_llm_json` (sync-adapted via httpx.Client).
- Router pattern: `services/routers/faceless.py`; DI getter `get_article` in `services/di.py` (instance key `"article"`).
