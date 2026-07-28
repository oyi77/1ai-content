<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# tests/test_pipeline

## Purpose
Unit tests for all six pipeline stages in `src/pipeline/`.

## Key Files

| File | Description |
|------|-------------|
| `test_intake.py` | Tests for `ProjectIntake`: input validation, project creation, title generation |
| `test_strategy_planner.py` | Tests for `StrategyPlanner`: prompt construction, AI response handling, file output |
| `test_outline_generator.py` | Tests for `OutlineGenerator`: chapter structure, TOC file generation |
| `test_manuscript_engine.py` | Tests for `ManuscriptEngine`: per-chapter generation, progress callback, file output |
| `test_qa_engine.py` | Tests for `QAEngine`: structure checks, word-count tolerance, pass/fail logic |

## For AI Agents

### Working In This Directory
- All AI-calling stage tests must use `mock_ai_client` — configure return values per test:
  ```python
  mock_ai_client.generate_structured.return_value = {...}
  mock_ai_client.generate_text.return_value = "chapter text"
  ```
- Use `temp_project_dir` for stages that write files; pass it as `projects_dir`
- Use `sample_project_brief`, `sample_strategy`, `sample_outline` for consistent inputs

### Common Patterns
- Test validation boundaries for `ProjectIntake` (idea length limits, invalid product_mode, chapter_count bounds)
- For `ManuscriptEngine`, verify the `on_progress` callback receives `(0, ...)` at start and `(100, ...)` at end

<!-- MANUAL: -->
