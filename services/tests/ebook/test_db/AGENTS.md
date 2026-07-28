<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# tests/test_db

## Purpose
Unit tests for `src/db/` — database initialisation, schema creation, and repository CRUD operations.

## Key Files

| File | Description |
|------|-------------|
| `test_database.py` | Tests for `DatabaseManager`: connection, schema initialisation, table creation |
| `test_repository.py` | Tests for `ProjectRepository` and `JobRepository`: create, get, list, update operations |

## For AI Agents

### Working In This Directory
- Use `test_db_path` fixture for isolated SQLite files — never share a DB file between tests
- No AI mocking needed here; these tests exercise pure DB logic

### Common Patterns
- `ProjectRepository(test_db_path)` creates schema automatically on first instantiation
- Test both happy path and edge cases (missing records return `None`)

<!-- MANUAL: -->
