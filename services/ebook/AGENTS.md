<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-08-02 -->

# ebook

## Purpose
Ebook content generator — AI ebook generation pipeline. Runs the full generation flow (intake → strategy → outline → manuscript → chapters → QA → safety) with cover generation and DOCX/PDF/EPUB export, and wraps it in a uniform `ContentGenerator` async interface registered in the monorepo API under `/text/ebook`. Persistence is SQLAlchemy (SQLite by default, Postgres via `DATABASE_URL`). Static admin/landing dashboard lives in `web/` and is served externally (see `web/templates/nginx_snippet.txt`).

## Key Files

| File | Description |
|------|-------------|
| `__init__.py` | Package marker; exports `EbookContentGenerator` |
| `ai_client.py` | `OmnirouteClient` — wraps the OpenAI SDK pointed at the local OmniRoute proxy; provides `generate_text` and `generate_structured` with retry logic; defines `PermanentAPIError` and the `AIClient` protocol |
| `config.py` | `PipelineConfig` dataclass (provider, model, token budgets, QA thresholds, `api_port=8765`, `ui_port=8501`, `model_success_threshold=0.8`); config is read from `config.json` next to this file via `get_config()` / `reload_config()` |
| `generator.py` | `EbookContentGenerator(ContentGenerator)` — async `create/get/list/status/delete/generate/update/cancel`; `generate()` runs `PipelineOrchestrator` in a thread pool with in-process progress; adds `extra_routes()` for export/download |
| `logger.py` | structlog setup — `setup_logging(level, format)`, `get_logger`, correlation-id helpers |
| `utils.py` | `get_available_models()` — queries OmniRoute (`OMNIROUTE_BASE_URL`, default `http://localhost:20128/v1`) with a 300s cache |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `db/` | SQLAlchemy persistence: engine factory, ORM models, repositories (see `db/AGENTS.md`) |
| `pipeline/` | Generation stages: intake → strategy → outline → manuscript → chapters → QA → safety, plus comics sub-pipeline (`pipeline/comics/`), marketing kit, and progress tracking (see `pipeline/AGENTS.md`) |
| `cover/` | Cover image generation (see `cover/AGENTS.md`) |
| `export/` | DOCX / PDF / EPUB export, comics exporter, export orchestrator, file manager (see `export/AGENTS.md`) |
| `models/` | Pydantic input validation (`ProjectInput`, `VALID_LANGUAGES`) |
| `research/` | Reference lookup via Google Books API and Open Library API |
| `utils/` | Error-handling decorators (retry, graceful degradation) and path validation (anti path traversal) |
| `i18n/` | Supported languages (code → name / RTL / font hint) |
| `integrations/` | External integration manager (HMAC-signed webhooks); integrations file at `config/integrations.json` |
| `mcp/` | MCP server over stdio (JSON-RPC 2.0) exposing the generator |
| `web/` | Static admin/landing HTML templates + assets, served externally via nginx (not mounted by FastAPI) |

## For AI Agents

### Working In This Directory
- `EbookContentGenerator` in `generator.py` is the entry point — registered in `services/api.py` as `registry.register(EbookContentGenerator(), prefix="/text/ebook")`; its `extra_routes()` mount `GET /projects/{project_id}/export` and `GET /projects/{project_id}/download/{fmt}` (docx/pdf/epub)
- `OmnirouteClient` in `ai_client.py` is the single AI integration point — all pipeline stages depend on it
- Inject `OmnirouteClient` via constructor parameter; never instantiate it inside a method where it can't be mocked
- Imports within the package use absolute `services.ebook.*` paths
- Default data dir is `data/ebook` at the 1ai-content project root: `projects.db` (SQLite) + `projects/<id>/` (artifacts, exports)
- Persistence: `USE_EBOOK_SQLITE=true` (default) → SQLite; `DATABASE_URL` set → Postgres; see `db/database.py`
- `config.json` sits next to `config.py`; don't hardcode pipeline settings

### Testing Requirements
- Unit tests live in `services/tests/ebook/` and mock `OmnirouteClient` via the `mock_ai_client` fixture in `conftest.py`
- No real network or AI calls in unit tests
- Run from `services/` (pytest config lives in `services/pytest.ini`):
  ```bash
  pytest tests/ebook/                       # all ebook tests
  pytest tests/ebook/test_models/           # one sub-suite
  pytest tests/ebook/test_ai_client.py      # single file
  ```

### Common Patterns
- Every module that calls the AI accepts `ai_client: AIClient | None = None` and defaults to `OmnirouteClient()` if not provided
- Every module that writes files accepts `projects_dir: Path | str = "projects"` for test isolation
- Pipeline stages persist state to SQLite via repositories in `db/` and write artifacts under `projects/<id>/` (`strategy.json`, `manuscript.json`, `marketing_kit.json`, `cover/`, `exports/`)
- Generation errors are classified through `pipeline/error_classifier.py` (`ErrorClassifier.classify(exc)`)

## Dependencies

### Internal
- `services.generator` — `ContentGenerator`, `GeneratorInfo` base classes

### External
- `openai` — OmniRoute API client
- `pydantic` — model validation
- `sqlalchemy` — persistence
- `structlog` — structured logging
- `python-docx`, `Pillow`, `ebooklib` — export and cover rendering
- `jinja2` — web templates
- `httpx`, `fastapi` — HTTP layer

<!-- MANUAL: -->


## Temuan Baru (audit 2026-08-02)

- **Stale**: dokumen ini memakai judul `# src` dan jalur `src.*`, sedangkan kode nyata memakai `services.ebook.*` (terverifikasi di `services/ebook/pipeline/orchestrator.py`: `from services.ebook.ai_client import OmnirouteClient`, dst).
- **Stale**: tabel Subdirectories menyebut `jobs/` — folder `jobs/` TIDAK ADA di `services/ebook/`.
- **Stale**: `__init__.py` bukan sekadar empty marker — folder berisi banyak entri yang tidak terdokumentasi di dokumen ini: `config.py`, `generator.py`, `logger.py`, `utils.py`, dan folder `i18n/`, `integrations/`, `mcp/`, `models/`, `research/`, `utils/`, `web/`.
- `ai_client.py` (`OmnirouteClient`) tetap ada dan masih menjadi titik integrasi AI — klaim tersebut masih valid.

> Last updated: 2026-08-02 — audit temuan baru (struktur & path stale)
