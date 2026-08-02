<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# src/db

## Purpose
SQLite persistence layer. Handles schema creation, Pydantic data models, and repository-pattern data access for `projects` and `jobs` tables.

## Key Files

| File | Description |
|------|-------------|
| `database.py` | `DatabaseManager` — accepts a `db_path`, initialises schema on first connect, returns `sqlite3.Row`-factory connections |
| `schema.py` | `create_tables()` — DDL for `projects`, `jobs`, and `project_metadata` tables (called by `DatabaseManager.__init__`) |
| `models.py` | Pydantic models: `Project`, `Job`, `ProductMode` enum, `ProjectStatus` enum, `JobStatus` enum |
| `repository.py` | `ProjectRepository` and `JobRepository` — CRUD wrappers over `DatabaseManager` |

## For AI Agents

### Working In This Directory
- `DatabaseManager` is a thin connection factory — repositories own all SQL
- Pass `db_path` from caller; never hard-code a path inside this package
- Schema changes go in `schema.py`; add migrations manually if the app has existing data
- `project_metadata` table exists in schema but has no repository yet — add `ProjectMetadataRepository` here if needed

### Testing Requirements
- Use `test_db_path` fixture (`tmp_path / "test.db"`) for an isolated in-memory-like SQLite file
- Each test that writes data should get a fresh `test_db_path` to avoid state leakage

### Common Patterns
- Repositories take `db_path: Path | str` and create their own `DatabaseManager` instance
- All SQL uses parameterised queries (`?` placeholders)
- Status transitions: `draft → generating → completed | failed`

## Dependencies

### Internal
- `src/db/schema.py` — imported by `DatabaseManager` on init

### External
- `pydantic>=2.5` — model validation and enum definitions
- `sqlite3` — stdlib, no install needed

<!-- MANUAL: -->


## Temuan Baru (audit 2026-08-02)

- **Stale**: tabel Key Files menyebut `schema.py` dengan `create_tables()` (DDL untuk `projects`, `jobs`, `project_metadata`) — file `schema.py` TIDAK ADA. File yang ada hanya `database.py`, `models.py`, `repository.py`. DDL kemungkinan sudah dipindah ke `database.py`; perlu diverifikasi.
- **Stale**: section Dependencies Internal menyebut `src/db/schema.py` — jalur nyata `services.ebook.db.schema` tidak ada.
- `database.py`/`repository.py`/`models.py` masih sesuai deskripsi umum (thin connection factory + repository pattern) — klaim inti tetap valid.
- Catatan: verifikasi apakah tabel `jobs` masih dibuat, mengingat folder `services/ebook/jobs/` tidak ada.

> Last updated: 2026-08-02 — audit temuan baru (schema.py hilang, klaim DDL basi)
