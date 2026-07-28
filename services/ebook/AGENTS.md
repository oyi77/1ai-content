<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# src

## Purpose
All application source code. Organised into sub-packages by concern: database layer, generation pipeline, background jobs, cover generation, and export formats. No framework entry points live here — the Streamlit frontend is in `app/`.

## Key Files

| File | Description |
|------|-------------|
| `__init__.py` | Empty package marker |
| `ai_client.py` | `OmnirouteClient` — wraps the OpenAI SDK pointed at the local OmniRoute proxy; provides `generate_text` and `generate_structured` with retry logic |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `db/` | SQLite persistence: schema, models, repositories (see `db/AGENTS.md`) |
| `pipeline/` | Ordered generation stages: intake → strategy → outline → manuscript → QA → safety (see `pipeline/AGENTS.md`) |
| `jobs/` | Threaded background job queue backed by SQLite (see `jobs/AGENTS.md`) |
| `cover/` | Cover image generation using Pillow (see `cover/AGENTS.md`) |
| `export/` | DOCX assembly, PDF conversion, and file management (see `export/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- `OmnirouteClient` in `ai_client.py` is the single AI integration point — all pipeline stages depend on it
- Inject `OmnirouteClient` via constructor parameter; never instantiate it inside a method where it can't be mocked
- Imports within `src/` use absolute `src.*` paths, not relative imports

### Testing Requirements
- Unit tests mock `OmnirouteClient` via the `mock_ai_client` fixture in `conftest.py`
- No real network calls should occur in unit tests

### Common Patterns
- Every module that calls the AI accepts `ai_client: OmnirouteClient | None = None` and defaults to `OmnirouteClient()` if not provided
- Every module that writes files accepts `projects_dir: Path | str = "projects"` for test isolation

## Dependencies

### External
- `openai` — OmniRoute API client
- `pydantic` — model validation
- `python-docx`, `Pillow` — export and cover rendering

<!-- MANUAL: -->
