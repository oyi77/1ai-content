# Absorption Plan: `ebook/` → 1ai-content Monorepo

**Status**: Plan — not yet approved. Choose Option 1 (recommended) or Option 2.

---

## Current State

### What exists at `ebook/`

| Layer | Status | Detail |
|-------|--------|--------|
| Source code | 61 Python modules in `ebook/src/` across 16 subdirs | Pipeline, API, DB, export, cover, jobs, integrations, models, utils, i18n, research, MCP, comics |
| API server | FastAPI on port 8765 (`src.api.server:app`) | Standalone — routed through `uvicorn.run()` in `run.py` / `run_api.py` |
| Frontend | Streamlit multi-page UI on port 8501 (`app/main.py`) | Launched by `run.py` in subprocess |
| Job queue | Threaded SQLite-backed queue | Runs inside the same Python process |
| Tests | 72+ tests (532/544 pass, 78% coverage) | pytest with config in `pyproject.toml` + `pytest.ini` |
| Config | `pyproject.toml`, `.env` (via dotenv) | Own `requirements.txt` (17 deps) |
| Docker | `Dockerfile` + `docker-compose.yml` | Container image, not currently used in prod |
| Systemd | `ebook-generator.service`, `ebook-api.service` | Service files present; `ebook-generator.service` points to wrong WorkingDirectory (`/home/openclaw/projects/1ai-ebook`) |
| Meta | `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/` | Satellite docs |

### What the monorepo already has

| Component | File | Detail |
|-----------|------|--------|
| HTTP bridge | `src/services/ebook.service.ts` | TypeScript HTTP client calling port 8765 with 3-layer auth (API key, JWT, bot token) |
| Route registration | `src/routes/content-api.ts` | GET `/content/books/list`, POST `/content/books/create`, GET `/content/books/:id/status`, GET `/content/books/:id/download`, GET `/content/books/health` |
| Config | `src/config/env.ts` lines 38-39 | `EBOOK_API_URL` (default `http://localhost:8765`), `EBOOK_API_KEY` (optional) |
| Python services infra | `services/` | `api.py` (FastAPI app), `routers/` (20 routers), `bookshelf/`, `clipper/`, `remotion/` |

---

## Option 1 (Recommended): Minimal HTTP Bridge Clean-up

**Goal**: Stop treating `ebook/` as a satellite — but keep it as a co-located, independently-launched service. No Python import restructuring.

### Rationale
- The ebook pipeline is **massive** (61 modules, threaded job queue, Streamlit frontend) and deeply entangled with its own import structure (`from src.xxx`)
- Full restructuring would rewrite every import path, merge test infra, merge Docker infra, and risk breaking the pipeline
- The HTTP bridge already works. The gaps are: wrong systemd path, separated env management, and satellite metadata

### Step-by-step tasks

#### Step 1. Fix systemd service

**Files**: `ebook/ebook-generator.service`

**Changes**:
- `Line 9`: Change `WorkingDirectory=/home/openclaw/projects/1ai-ebook` → `/home/openclaw/projects/1ai-content/ebook`
- Remove `ebook-api.service` if it exists (consolidate to one service)
- Disable old service: `sudo systemctl disable ebook-generator.service` (if old path exists)
- Enable new path: `sudo systemctl enable $(pwd)/ebook/ebook-generator.service`

**Verification**: `sudo systemctl start ebook-generator.service && curl http://localhost:8765/health`

#### Step 2. Remove satellite scaffolding

**Files to delete**:
- `ebook/AGENTS.md` — satellite agent instructions; monorepo AGENTS.md supersedes
- `ebook/CLAUDE.md` — same
- `ebook/README.md` — user docs; content superseded by monorepo docs if any, otherwise archive to `docs/`
- `ebook/Dockerfile` — Docker image; not used in prod; if needed, keep for reference
- `ebook/docker-compose.yml` — same
- `ebook/docker/` — container entrypoint script
- `ebook/.sisyphus/` — orchestration evidence; historical, not needed in monorepo root
- `ebook/pytest.ini` — pytest config duplicates `pyproject.toml` tool section
- `ebook/docs/` — move to `docs/archive/ebook-docs/` to preserve institutional knowledge

**Files to move (not delete)**:
- `ebook/.env.example` → keep in place (used at runtime)
- `ebook/pyproject.toml` → keep (defines pytest config, metadata, ruff config)
- `ebook/requirements.txt` → keep (separate process, separate venv)

#### Step 3. Merge ebook config into monorepo env pattern

**Current state**: `ebook/src/config.py` reads `.env` via `python-dotenv` independently. Monorepo passes `EBOOK_API_KEY` via env.ts.

**Changes**:
- Add ebook env vars to `1ai-content/.env.example` (if not present):
  ```
  EBOOK_API_KEY=dev-key-change-me
  EBOOK_MANUSCRIPT_MODEL=auto/free-chat
  ```
- The ebook server already reads `EBOOK_API_KEY` — no code change needed
- The monorepo's `ebook.service.ts` sends `X-API-Key` header — already implemented

#### Step 4. Add ebook health to monorepo health endpoint

**Current state**: Monorepo health endpoint at `GET /health` doesn't include ebook status.

**File**: `src/routes/health.ts` (find exact path)

**Changes**:
- On startup, ping `http://localhost:8765/health` and cache result
- Include `{ "ebook": "ok" | "down" }` in `/health` response

#### Step 5. Update systemd service definition to be production-hardened

**File**: `ebook/ebook-generator.service`

**Changes**:
- Add `EnvironmentFile=/home/openclaw/projects/1ai-content/.env` (to share monorepo env)
- Ensure `ExecStart=... python3 run.py` works from the `ebook/` directory
- Add `Restart=always`, `RestartSec=5` (already present)
- Add `StandardOutput=journal`, `StandardError=journal` (already present)

#### Step 6. Clean up root monorepo package.json (if needed)

**Check**: Does root `package.json` have `remotion` or any ebook-related deps?

**Action**: Verify with `cd /home/openclaw/projects/1ai-content && python3 -c "import json; d=json.load(open('package.json')); [print(k,v) for k,v in d.get('dependencies',{}).items() if 'ebook' in k.lower() or 'remotion' in k.lower()]"` — remove any found (they belong to separate processes).

#### What this plan DOES NOT do

- Change a single import path in ebook Python code
- Move ebook tests into monorepo test runner
- Merge ebook deps into `services/requirements.txt`
- Add an ebook router to `services/api.py`
- Change the HTTP bridge architecture

---

## Option 2 (Full Restructuring): Merge Into `services/`

**Goal**: Import ebook Python modules directly into the monorepo's Python services, eliminating the HTTP bridge.

### Rationale
- Single Python process — no inter-process HTTP calls
- Shared dependency management
- Monorepo health endpoint sees ebook status natively
- Streamlined deployment (one systemd service for all Python services)

### What it would take

#### Python import restructuring (61 modules)

Every module in `ebook/src/` uses `from src.xxx import yyy`. They must become `from services.ebook.xxx import yyy`.

**Modules affected** (verified from `ebook/src/` structure):

```
ebook/src/
├── __init__.py
├── ai_client.py
├── config.py
├── logger.py
├── api/
│   ├── __init__.py
│   └── server.py                  → router goes to services/routers/ebook.py
├── db/
│   ├── __init__.py
│   ├── database.py
│   ├── models.py
│   ├── repository.py
│   └── schema.py
├── pipeline/
│   ├── __init__.py
│   ├── intake.py
│   ├── strategy_planner.py
│   ├── outline_generator.py
│   ├── manuscript_engine.py
│   ├── chapter_generator.py
│   ├── progress_tracker.py
│   ├── qa_engine.py
│   ├── content_safety.py
│   ├── orchestrator.py
│   ├── style_context.py
│   ├── style_guide.py
│   ├── token_calibrator.py
│   ├── book_structure.py
│   ├── model_tracker.py
│   ├── error_classifier.py
│   ├── prose_scorer.py
│   ├── refinement_engine.py
│   ├── marketing_kit.py
│   └── comics/
│       ├── __init__.py
│       ├── comics_orchestrator.py
│       ├── script_engine.py
│       ├── character_sheet.py
│       ├── page_composer.py
│       └── panel_art_generator.py
├── export/
│   ├── __init__.py
│   ├── export_orchestrator.py
│   ├── docx_generator.py
│   ├── pdf_converter.py
│   ├── epub_generator.py
│   ├── file_manager.py
│   └── comics_exporter.py
├── cover/
│   ├── __init__.py
│   ├── cover_generator.py
│   └── html_cover_generator.py
├── jobs/
│   ├── __init__.py
│   ├── queue.py
│   └── tracker.py
├── integrations/
│   ├── __init__.py
│   └── manager.py
├── models/
│   ├── __init__.py
│   └── validation.py
├── utils/
│   ├── __init__.py
│   ├── error_handling.py
│   └── path_validator.py
├── i18n/
│   ├── __init__.py
│   └── languages.py
├── research/
│   ├── __init__.py
│   └── ebook_reference.py
└── mcp/
    ├── __init__.py
    └── server.py
```

**Action**: Move `ebook/src/` → `services/ebook/`. Then find-and-replace all `from src.` → `from services.ebook.` across all files.

#### Dependency merging

**Current state**:
- `ebook/requirements.txt` has 17 deps
- `services/requirements.txt` has its own deps

**Action**: Add ebook deps not already in `services/requirements.txt`:
- `streamlit>=1.28.0` (not in services deps — only needed if Streamlit UI is moved)
- `python-docx>=1.1.0`
- `ebooklib>=0.18.0`
- `playwright>=1.40.0`
- `structlog>=23.0.0`
- `textstat>=0.7.3`
- `fpdf2>=2.7.0`

#### Router creation

**New file**: `services/routers/ebook.py`

**Pattern** (follow existing bookshelf/clipper/remotion routers):
```python
from fastapi import APIRouter
router = APIRouter(prefix="/content/ebook", tags=["ebook"])
```

Move all endpoints from `ebook/src/api/server.py` here. The existing TypeScript `ebook.service.ts` would no longer be needed — monorepo JS would call the monorepo Python directly (or still via HTTP if kept as separate process).

#### Registration in api.py

Add to `services/api.py`:
```python
from services.routers.ebook import router as ebook_router
app.include_router(ebook_router)
```

#### Test infrastructure

**72+ tests** at `ebook/tests/` use `ebook/pyproject.toml` pytest config.

**Action**:
- Move `ebook/tests/` → `services/tests/ebook/`
- Ensure pytest discovers them (check `services/pytest.ini` or `conftest.py` scope)
- Resolve import path changes in test files
- Run full suite to verify nothing broke

#### Systemd service consolidation

Current `ebook/ebook-generator.service` launches `run.py` (FastAPI + Streamlit).

**If Streamlit is kept**: Keep as separate service, just fix WorkingDirectory (same as Option 1 Step 1).

**If Streamlit is dropped**: Launch ebook endpoints as part of `services/api.py`. Single systemd service for all Python services.

#### Removal of satellite scaffolding

Same as Option 1 Steps 2-3, plus:
- Delete `src/services/ebook.service.ts` (no longer needed — Python is in-process)
- Remove `EBOOK_API_URL`, `EBOOK_API_KEY` from `src/config/env.ts`

### Risk assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| 61 import rewrites | High — each file must be verified individually | Use `sed -i` with `git diff` review per file |
| Test discovery broken | Medium — pytest config differs between projects | Move pytest config, run full suite |
| Threaded job queue conflicts | Medium — ebook uses its own SQLite DB | Keep ebook DB path separate from monorepo DB |
| Streamlit frontend entanglement | Low — `run.py` won't work after move | Keep as separate process; or accept Streamlit needs own launch path |
| Merge conflicts with active development | Low — plan can wait for quiet period | |

### Effort estimate

| Phase | Hours | Dependencies |
|-------|-------|--------------|
| Import restructuring (sed + verify) | 2-3h | — |
| Router creation + api.py registration | 0.5h | Import restructuring done |
| Dependency merging | 0.5h | — |
| Test infra migration | 1-2h | Import restructuring done |
| Systemd + cleanup | 1h | All of above |
| **Total** | **5-9h** | |

---

## Comparison

| Dimension | Option 1 (Minimal) | Option 2 (Full Restructure) |
|-----------|---------------------|-----------------------------|
| Effort | ~1h | 5-9h |
| Risk | Minimal | High (61 import rewrites) |
| Import changes | 0 | 61 files |
| Test changes | 0 | 72+ tests moved |
| Single Python process | No | Yes |
| Shared dependency mgmt | No | Yes |
| HTTP bridge removed | No | Yes |
| Deployment change | Fix systemd path | Consolidate systemd |
| Rollback complexity | Easy (revert systemd) | Complex (git revert) |

**Recommendation**: Option 1 unless full Python-process merging is a hard requirement. The HTTP bridge adds ~1ms latency per call and works reliably. The restructuring cost and risk aren't justified by the benefit.

---

## Dependencies

- Current ebook process must be inspectable before starting: `sudo systemctl status ebook-generator`
- Port 8765 must not conflict with other services — verify: `fuser 8765/tcp`
- For Option 2: the entire pipeline must be non-functional during migration (several hours)
