<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# tests

## Purpose
Pytest test suite mirroring the `src/` package structure. Each `test_*` subdirectory corresponds to a `src/` sub-package. Shared fixtures live in the root `conftest.py`.

## Key Files

| File | Description |
|------|-------------|
| `__init__.py` | Empty package marker |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `test_db/` | Tests for `src/db/` — database, schema, repository (see `test_db/AGENTS.md`) |
| `test_pipeline/` | Tests for all pipeline stages (see `test_pipeline/AGENTS.md`) |
| `test_jobs/` | Tests for `src/jobs/queue.py` (see `test_jobs/AGENTS.md`) |
| `test_cover/` | Tests for `src/cover/cover_generator.py` (see `test_cover/AGENTS.md`) |
| `test_export/` | Tests for DOCX and PDF export (see `test_export/AGENTS.md`) |
| `integration/` | End-to-end pipeline tests (see `integration/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- All tests use fixtures from root `conftest.py`: `test_db_path`, `temp_project_dir`, `mock_ai_client`, `sample_project_brief`, `sample_strategy`, `sample_outline`
- Use `mock_ai_client` for any test involving pipeline stages — no real AI calls in unit tests
- Use `tmp_path` (pytest built-in) or `test_db_path` for database isolation
- Mark tests with `@pytest.mark.unit`, `@pytest.mark.integration`, or `@pytest.mark.slow`

### Testing Requirements
```bash
pytest tests/                        # all tests
pytest tests/test_pipeline/          # one sub-suite
pytest tests/test_pipeline/test_intake.py::ClassName::test_name  # single test
pytest -m integration                # integration tests only
```

### Common Patterns
- Async tests work without decoration — `asyncio_mode = "auto"` is set in `pytest.ini`
- Integration tests may hit real SQLite but still mock AI calls

<!-- MANUAL: -->
