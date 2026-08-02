<!-- Parent: ../../../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-08-02 -->

# tests/ebook

## Purpose
Pytest test suite for the `services/ebook` package. Each `test_*` subdirectory covers a corresponding `services/ebook/` sub-package (`db`, `pipeline`, `cover`, `export`, `models`, `i18n`, `integrations`, `mcp`, `research`, `utils`), plus app-level error handling (`test_app/`), end-to-end quality/comics tests, and full-pipeline integration tests. Shared fixtures live in the root `conftest.py`.

## Key Files

| File | Description |
|------|-------------|
| `conftest.py` | Shared fixtures; sets `USE_EBOOK_SQLITE=true` by default so tests use SQLite |
| `test_ai_client.py` | Tests for `services/ebook/ai_client.py` |
| `test_e2e_comics.py` | End-to-end comics pipeline tests |
| `test_e2e_quality.py` | End-to-end quality tests (pipeline output checks) |
| `coverage-baseline.txt`, `coverage-final.txt` | Coverage snapshots (not tests) |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `integration/` | Full-pipeline integration tests (`test_full_pipeline.py`) |
| `test_app/` | Application-level error-handling tests |
| `test_cover/` | Tests for `services/ebook/cover/` |
| `test_db/` | Tests for `services/ebook/db/` — database, repository, repository security |
| `test_export/` | Tests for `services/ebook/export/` — DOCX, EPUB, PDF, comics exporter, security |
| `test_i18n/` | Tests for `services/ebook/i18n/` |
| `test_integrations/` | Tests for `services/ebook/integrations/` — manager, error handling, webhook HMAC signing |
| `test_mcp/` | Tests for the MCP server |
| `test_models/` | Tests for Pydantic validation (`ProjectInput`, languages) |
| `test_pipeline/` | Tests for pipeline stages, incl. `comics/` sub-suite |
| `test_research/` | Tests for `services/ebook/research/` reference lookups |
| `test_utils/` | Tests for error-handling decorators and `PathValidator` |

## For AI Agents

### Working In This Directory
- All tests use fixtures from root `conftest.py`: `test_db_path`, `temp_project_dir`, `mock_ai_client`, `sample_project_brief`, `sample_strategy`, `sample_outline`
- Use `mock_ai_client` for any test involving pipeline stages — no real AI calls in unit tests
- Use `tmp_path` (pytest built-in) or `test_db_path` for database isolation
- `conftest.py` sets `USE_EBOOK_SQLITE=true` via `setdefault`; override with `USE_EBOOK_SQLITE=false` to exercise the Postgres path

### Testing Requirements
```bash
pytest tests/ebook/                        # all ebook tests
pytest tests/ebook/test_pipeline/          # one sub-suite
pytest tests/ebook/test_models/test_validation.py  # single file
```
- Run from `services/` (pytest config is `services/pytest.ini`; `testpaths = tests bookshelf pinterest clipper`)
- No custom markers (`unit`/`integration`/`slow`) are registered — there is no `pytest -m integration` filter

### Common Patterns
- Async tests work without decoration — `asyncio_mode = auto` is set in `services/pytest.ini`
- Integration tests may hit real SQLite (temp file) but still mock AI calls via `mock_ai_client`
- Test DB engines and repositories are built per-test from `test_db_path` for isolation

## Dependencies

### Internal
- `services.ebook` — the package under test

### External
- `pytest`, `pytest-asyncio` — test runner (async auto mode)
- `unittest.mock` — `MagicMock`-based fixtures in `conftest.py`

<!-- MANUAL: -->
