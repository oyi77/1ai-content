# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Run all tests
pytest

# Run a single test file
pytest tests/test_pipeline/test_intake.py

# Run a single test by name
pytest tests/test_pipeline/test_intake.py::TestProjectIntake::test_create_project

# Run by marker
pytest -m unit
pytest -m integration

# Lint and auto-fix
ruff check src/
ruff check src/ --fix

# Run with coverage
pytest --cov=src --cov-report=term-missing

# Type checking
mypy src/
```

## Environment

Copy `.env.example` to `.env`. Required environment variables:

- `OMNIROUTE_BASE_URL` — OmniRoute proxy URL (default: `http://localhost:20128/v1`)
- `OMNIROUTE_API_KEY` — OmniRoute API key (required)
- `EBOOK_API_KEY` — REST API authentication key (required for security)

Generate secure API key:
```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

PDF export requires LibreOffice: `libreoffice` or `soffice` must be on `PATH`.

## Architecture

AI-powered ebook generation pipeline with Streamlit frontend, FastAPI backend, SQLite persistence, file-based project store, and background job queue.

### AI Client (`src/ai_client.py`)

`OmnirouteClient` wraps the OpenAI SDK pointed at OmniRoute proxy. All pipeline stages receive an injected `OmnirouteClient`; tests mock it via `mock_ai_client` fixture. Two methods: `generate_text` (returns str) and `generate_structured` (parses JSON response into dict).

### Pipeline Stages (`src/pipeline/`)

Stages run sequentially, each class taking injected dependencies:

1. **`ProjectIntake`** — validates user input, persists project to SQLite via `ProjectRepository`
2. **`StrategyPlanner`** — generates audience/tone/goal strategy; saves `strategy.json`
3. **`OutlineGenerator`** — generates chapter list with word counts; saves `outline.json` and `toc.md`
4. **`ManuscriptEngine`** — generates chapters sequentially with continuity tracking
   - Uses **`ChapterGenerator`** (extracted) for individual chapter generation
   - Uses **`ProgressTracker`** (extracted) for progress reporting
   - Writes to `chapters/{n}.md`, aggregates into `manuscript.md`
5. **`QAEngine`** — structural validation + word count tolerance checks
6. **`ContentSafety`** — keyword blocklist + disclaimer injection

Orchestrator (`src/pipeline/orchestrator.py`) wires stages together and manages execution flow.

### Database (`src/db/`)

SQLite via `DatabaseManager`. Schema in `src/db/schema.py`. Two repositories:
- **`ProjectRepository`** — CRUD for projects table with **SQL injection protection** (field whitelist)
  - Statuses: `draft → generating → completed/failed`
  - Allowed update fields: `title`, `idea`, `status`, `chapter_count`
- **`JobRepository`** — CRUD for jobs table

Pydantic models in `src/db/models.py` define `Project`, `Job`, `ProductMode`, and status enums.

### Security Features (Added April 2026)

**Input Validation (`src/models/validation.py`):**
- Pydantic models with XSS detection (script tags, javascript: protocol)
- SQL injection pattern detection (DROP TABLE, UNION SELECT, etc.)
- Boundary validation (idea: 10-5000 chars, chapters: 3-50)

**Path Validation (`src/utils/path_validator.py`):**
- `PathValidator` class prevents directory traversal attacks
- Validates paths are within `projects/` directory
- Blocks symlink attacks and relative path traversal
- File extension validation for safe file processing

**Error Handling (`src/utils/error_handling.py`):**
- `@retry_on_transient` decorator with exponential backoff
- `@log_errors` and `@handle_gracefully` decorators
- Context managers: `safe_operation()`, `logged_operation()`
- Structured logging with correlation IDs

**API Security (`src/api/`):**
- Rate limiting middleware (10 req/min general, 2 req/min generation)
- Security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options)
- CORS configuration with explicit origin whitelist
- Required API key authentication (`EBOOK_API_KEY`)
- Correlation ID middleware for request tracing

### Job Queue (`src/jobs/queue.py`)

`JobQueue` + `JobWorker` provide SQLite-backed, threading-locked background queue. `JobWorker` runs daemon thread polling for pending jobs.

### Export (`src/export/`)

- **`DocxGenerator`** — renders manuscript.md + cover.png into `.docx` via `python-docx`
- **`PdfConverter`** — shells out to `libreoffice --headless --convert-to pdf` with **path validation**
- **`FileManager`** — project directory layout helper

### Cover (`src/cover/cover_generator.py`)

Generates cover images via AI prompt + Pillow rendering. Color keyed to `product_mode`.

### API (`src/api/server.py`)

FastAPI backend with endpoints:
- `POST /api/projects` — Create new project
- `GET /api/projects/{id}` — Get project status
- `GET /api/projects/{id}/download` — Download DOCX/PDF with **path traversal protection**
- `GET /api/projects` — List projects with filtering

All endpoints require `X-API-Key` header authentication.

### Project File Layout

```
projects/{project_id}/
  strategy.json
  outline.json
  toc.md
  manuscript.md
  manuscript.json
  qa_report.json
  chapters/{n}.md
  cover/cover.png
  cover/prompt.txt
  exports/ebook.docx
  exports/ebook.pdf
```

### Test Fixtures

`conftest.py` provides shared fixtures: `test_db_path`, `temp_project_dir`, `mock_ai_client`, `sample_project_brief`, `sample_strategy`, `sample_outline`. All AI calls in tests use `mock_ai_client` — no real network calls in unit tests.

## Recent Changes (April 2026 Security Refactor)

### Security Fixes
- SQL injection prevention with field whitelist
- Path traversal protection with `PathValidator`
- Command injection prevention in PDF converter
- Input validation with Pydantic models
- Rate limiting and security headers

### Error Handling
- Replaced 28 silent exception handlers with structured logging
- Added correlation ID middleware for distributed tracing
- Created error handling utility module with decorators

### Refactoring
- Extracted `ChapterGenerator` from `ManuscriptEngine`
- Extracted `ProgressTracker` from `ManuscriptEngine`
- Created `PathValidator` utility module
- Created `error_handling` utility module

### Test Coverage
- Increased from 72% to 78% overall
- Security modules: 96-100% coverage
- 532/544 tests passing (97.8%)

See `.sisyphus/evidence/task-f4-final-completion-report.md` for complete refactor details.

## Troubleshooting

### Common Issues

**LibreOffice not found:**
```bash
sudo apt install libreoffice  # Ubuntu/Debian
brew install libreoffice      # macOS
```

**API key required error:**
Set `EBOOK_API_KEY` in `.env` (never use default values in production)

**Rate limit exceeded:**
Wait 60 seconds or adjust limits in `src/api/middleware.py`

**Path traversal errors:**
Ensure files are within `projects/` directory

### Logging

Set environment variables for logging configuration:
```bash
LOG_LEVEL=DEBUG          # debug, info, warning, error
LOG_FORMAT=json          # json or console
```

Correlation IDs automatically added to all logs within API requests.
