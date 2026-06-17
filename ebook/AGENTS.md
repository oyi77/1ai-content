<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-21 -->

# ebook-generator

## Purpose
AI-powered ebook generation pipeline with Streamlit multi-page frontend and FastAPI backend. Users submit an idea; the system runs sequential pipeline stages (strategy → outline → manuscript → QA → cover → export) backed by SQLite and a threaded job queue. All AI calls route through OmniRoute proxy. Security-hardened with input validation, path protection, rate limiting, and structured logging.

## Key Files

| File | Description |
|------|-------------|
| `README.md` | User-facing documentation: quick start, installation, deployment |
| `CLAUDE.md` | Developer guidance: commands, env setup, architecture overview |
| `pyproject.toml` | Project metadata, dependencies, pytest/ruff config |
| `.env.example` | Environment variable template (OmniRoute, API keys, ports) |
| `conftest.py` | Root pytest fixtures shared across all test suites |
| `pytest.ini` | Pytest configuration (mirrors `pyproject.toml` tool section) |
| `Dockerfile` / `docker-compose.yml` | Container build and service composition |
| `ebook-generator.service` / `ebook-api.service` | systemd service units for production |
| `run.py` / `run_api.py` | Entry points for Streamlit UI and FastAPI backend |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `src/` | Application source code (61 Python modules) |
| `app/` | Streamlit frontend entry point and multi-page UI |
| `tests/` | Pytest test suites (532/544 passing, 78% coverage) |
| `docs/` | Documentation (architecture, API, security, testing, deployment) |
| `docker/` | Container entrypoint script |
| `projects/` | Runtime output — one subdirectory per generated ebook project |
| `data/` | Runtime job state persisted to disk |
| `.sisyphus/` | Orchestration evidence and audit trail (not user-facing) |

## Source Code Structure (`src/`)

### Core Modules

| Module | Description |
|--------|-------------|
| `ai_client.py` | OmniRoute client wrapper (OpenAI SDK) |
| `config.py` | Configuration management |
| `logger.py` | Structured logging with correlation IDs |

### API (`src/api/`)

| Module | Description |
|--------|-------------|
| `server.py` | FastAPI backend with authentication, rate limiting, security headers |

### Database (`src/db/`)

| Module | Description |
|--------|-------------|
| `database.py` | SQLite database manager |
| `models.py` | Pydantic models (Project, Job, ProductMode, statuses) |
| `repository.py` | ProjectRepository and JobRepository with SQL injection protection |
| `schema.py` | Database schema initialization |

### Pipeline (`src/pipeline/`)

| Module | Description |
|--------|-------------|
| `intake.py` | ProjectIntake — validates input, creates project record |
| `strategy_planner.py` | StrategyPlanner — generates audience/tone/goal strategy |
| `outline_generator.py` | OutlineGenerator — creates chapter structure |
| `manuscript_engine.py` | ManuscriptEngine — generates chapter content |
| `chapter_generator.py` | ChapterGenerator — extracted chapter generation logic |
| `progress_tracker.py` | ProgressTracker — extracted progress reporting |
| `qa_engine.py` | QAEngine — validates structure and consistency |
| `content_safety.py` | ContentSafety — keyword filtering and disclaimers |
| `orchestrator.py` | Pipeline orchestrator — wires stages together |
| `style_context.py` | StyleContext — manages writing style and tone |
| `style_guide.py` | StyleGuide — style configuration |
| `token_calibrator.py` | TokenCalibrator — AI token budget optimization |
| `book_structure.py` | Book structure definitions |
| `model_tracker.py` | AI model usage tracking |
| `error_classifier.py` | Error classification for retry logic |
| `prose_scorer.py` | Prose quality scoring |
| `refinement_engine.py` | Content refinement |
| `marketing_kit.py` | Marketing material generation |

### Pipeline - Comics (`src/pipeline/comics/`)

| Module | Description |
|--------|-------------|
| `comics_orchestrator.py` | Comic book generation orchestrator |
| `script_engine.py` | Comic script generation |
| `character_sheet.py` | Character design management |
| `page_composer.py` | Comic page layout |
| `panel_art_generator.py` | Panel artwork generation |

### Export (`src/export/`)

| Module | Description |
|--------|-------------|
| `export_orchestrator.py` | Export orchestrator |
| `docx_generator.py` | DOCX generation via python-docx |
| `pdf_converter.py` | PDF conversion via LibreOffice with path validation |
| `epub_generator.py` | EPUB generation |
| `file_manager.py` | Project directory layout management |
| `comics_exporter.py` | Comic book export |

### Cover (`src/cover/`)

| Module | Description |
|--------|-------------|
| `cover_generator.py` | Cover image generation (AI + Pillow) |
| `html_cover_generator.py` | HTML-based cover generation |

### Jobs (`src/jobs/`)

| Module | Description |
|--------|-------------|
| `queue.py` | SQLite-backed job queue with threading |
| `tracker.py` | Job progress tracking |

### Integrations (`src/integrations/`)

| Module | Description |
|--------|-------------|
| `manager.py` | Webhook integration manager with retry logic |

### Models (`src/models/`)

| Module | Description |
|--------|-------------|
| `validation.py` | Pydantic input validation (XSS, SQL injection detection) |

### Utils (`src/utils/`)

| Module | Description |
|--------|-------------|
| `error_handling.py` | Error handling decorators and utilities |
| `path_validator.py` | Path validation to prevent directory traversal |

### I18n (`src/i18n/`)

| Module | Description |
|--------|-------------|
| `languages.py` | Multi-language support |

### Research (`src/research/`)

| Module | Description |
|--------|-------------|
| `ebook_reference.py` | Ebook research and reference |

### MCP (`src/mcp/`)

| Module | Description |
|--------|-------------|
| `server.py` | Model Context Protocol server |

## For AI Agents

### Working In This Directory
- Root-level files are config/infra only; application logic lives in `src/` and `app/`
- `projects/` and `data/` are runtime directories — never commit their contents
- `.sisyphus/` contains orchestration evidence — reference for context, don't modify
- All imports use the `src.*` namespace (e.g. `from src.pipeline.intake import ProjectIntake`)

### Testing Requirements
```bash
pytest                          # full suite (532/544 passing)
pytest -m unit                  # unit tests only
pytest -m integration           # integration tests
pytest --cov=src                # with coverage report
ruff check src/                 # lint
ruff check src/ --fix           # auto-fix linting issues
```

### Common Patterns
- Pipeline stage classes accept optional `ai_client` parameter for injection/mocking
- All pipeline stages write artifacts to `projects/{project_id}/` on disk
- SQLite DB path is passed explicitly; no global DB singleton
- Use `PathValidator` for all file path operations to prevent traversal attacks
- Use `@retry_on_transient` decorator for operations that may fail transiently
- Use structured logging with correlation IDs for all error handling
- Validate user input with Pydantic models from `src/models/validation.py`

### Security Patterns (Added April 2026)
- **SQL Injection**: Use field whitelist in `ProjectRepository.update_project()`
- **Path Traversal**: Use `PathValidator` for all file operations
- **Input Validation**: Use Pydantic models with XSS/SQL pattern detection
- **Rate Limiting**: API endpoints have IP-based throttling
- **Authentication**: All API endpoints require `X-API-Key` header
- **Logging**: Use correlation IDs for distributed tracing

## Dependencies

### External
- `streamlit>=1.28` — frontend UI framework
- `openai>=1.3` — SDK used to call OmniRoute (OpenAI-compatible proxy)
- `python-docx>=1.1` — DOCX generation
- `Pillow>=10` — cover image rendering
- `pydantic>=2.5` — data models and validation
- `python-dotenv` — `.env` loading
- `fastapi` — REST API backend
- `httpx` — HTTP client for webhooks
- LibreOffice (system) — PDF conversion via subprocess

### Development
- `pytest>=7.4` — testing framework
- `pytest-cov>=4.1` — coverage reporting
- `pytest-asyncio>=0.21` — async test support
- `ruff>=0.1` — linting and formatting

## Recent Changes (April 2026)

### Security Refactor (24 tasks completed)
- Fixed 6 critical vulnerabilities (SQL injection, path traversal, hardcoded keys, command injection)
- Replaced 28 silent exception handlers with structured logging
- Added input validation with Pydantic models
- Implemented rate limiting and security headers
- Created path validation and error handling utilities

### Test Coverage
- Increased from 72% to 78% overall
- Security modules: 96-100% coverage
- 532/544 tests passing (97.8%)

### Refactoring
- Extracted `ChapterGenerator` from `ManuscriptEngine`
- Extracted `ProgressTracker` from `ManuscriptEngine`
- Created `PathValidator` utility module
- Created `error_handling` utility module

See `.sisyphus/evidence/task-f4-final-completion-report.md` for complete details.

<!-- MANUAL: -->
