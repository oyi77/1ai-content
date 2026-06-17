<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# tests/integration

## Purpose
End-to-end pipeline tests that exercise multiple stages together. These tests use real SQLite but still mock AI calls.

## Key Files

| File | Description |
|------|-------------|
| `test_full_pipeline.py` | Full pipeline integration test: intake → strategy → outline → manuscript → QA → export, verifying artifact creation at each stage |

## For AI Agents

### Working In This Directory
- Mark tests with `@pytest.mark.integration` — excluded from fast unit runs
- Still mock `OmnirouteClient` — integration here means cross-stage, not real AI calls
- Use `test_db_path` and `temp_project_dir` for full isolation
- Verify file artifacts exist at each pipeline stage boundary

### Common Patterns
- Configure `mock_ai_client.generate_structured` to return different values per call using `side_effect` lists when testing multi-stage flows

<!-- MANUAL: -->
