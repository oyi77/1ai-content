<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# src/pipeline

## Purpose
Ordered ebook generation stages. Each stage is an independent class; the compiled `orchestrator` wires them together. Stages run sequentially; each writes artifacts to `projects/{project_id}/` on disk.

## Key Files

| File | Description |
|------|-------------|
| `intake.py` | `ProjectIntake` — validates user input (idea length, product_mode, chapter_count), persists project to SQLite, returns project dict |
| `strategy_planner.py` | `StrategyPlanner` — calls AI to generate audience/pain_points/promise/tone/goal; saves `strategy.json` |
| `outline_generator.py` | `OutlineGenerator` — calls AI to produce title options and chapter list with word-count targets; saves `outline.json` and `toc.md` |
| `manuscript_engine.py` | `ManuscriptEngine` — iterates chapters sequentially, passes previous chapter summary for narrative continuity; saves `chapters/{n}.md` and `manuscript.md` |
| `qa_engine.py` | `QAEngine` — structural checks (chapter title matching) and word-count ±20% tolerance; saves `qa_report.json` |
| `content_safety.py` | `ContentSafety` — keyword blocklist check and `add_disclaimer()` for appending AI-generated-content warning |

## For AI Agents

### Working In This Directory
- **Stage execution order**: `ProjectIntake` → `StrategyPlanner` → `OutlineGenerator` → `ManuscriptEngine` → `QAEngine` → `ContentSafety`
- Every stage accepts `ai_client: OmnirouteClient | None = None`; pass `mock_ai_client` in tests
- Every stage that writes files accepts `projects_dir: Path | str = "projects"`
- `ManuscriptEngine.generate()` accepts an `on_progress: Callable[[int, str], None]` callback for UI progress updates
- `QAEngine` does not call AI by default; `_check_consistency` is a stub returning 0.9

### Testing Requirements
- Mock `OmnirouteClient` for all AI-calling stages
- Use `temp_project_dir` fixture to isolate file writes
- `sample_project_brief`, `sample_strategy`, `sample_outline` fixtures provide consistent test data

### Common Patterns
- AI stages call `ai_client.generate_structured()` with a `response_schema` dict describing expected JSON shape
- `ManuscriptEngine` passes the first 200 chars of the previous chapter as `previous_summary` for continuity
- QA passes if `len(issues) == 0` AND all scores >= 0.8

## Dependencies

### Internal
- `src/ai_client.OmnirouteClient`
- `src/db/repository.ProjectRepository` (used by `ProjectIntake`)

### External
- `json`, `pathlib` — stdlib only (no third-party deps in pipeline stages)

<!-- MANUAL: -->
