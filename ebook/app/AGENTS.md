<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# app

## Purpose
Streamlit multi-page frontend. `main.py` is the entry point; numbered page files in `pages/` define the UI workflow from idea submission through export download.

## Key Files

| File | Description |
|------|-------------|
| `__init__.py` | Empty package marker |
| `main.py` | Streamlit app entry point — run via `streamlit run app/main.py` |

## Subdirectories

| Directory | Purpose |
|-----------|---------|
| `pages/` | Streamlit numbered pages defining the 4-step user workflow (see `pages/AGENTS.md`) |

## For AI Agents

### Working In This Directory
- Streamlit page order is controlled by the numeric prefix in filenames (`1_`, `2_`, etc.)
- Pages import from `src.*` — keep UI logic in `app/`, business logic in `src/`
- The Docker entrypoint launches `streamlit run app/main.py --server.port=8501`

### Testing Requirements
- No automated tests for Streamlit pages — test underlying `src/` logic instead
- Manual browser testing at `http://localhost:8501`

## Dependencies

### Internal
- `src/pipeline/` — pipeline stage classes
- `src/db/` — project and job repositories
- `src/jobs/` — job queue for background processing
- `src/export/` — export orchestration

### External
- `streamlit>=1.28`

<!-- MANUAL: -->
