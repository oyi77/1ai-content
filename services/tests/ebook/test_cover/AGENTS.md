<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# tests/test_cover

## Purpose
Unit tests for `src/cover/cover_generator.py`.

## Key Files

| File | Description |
|------|-------------|
| `test_cover_generator.py` | Tests for `CoverGenerator`: prompt generation, image file creation, brief/prompt file output |

## For AI Agents

### Working In This Directory
- Use `mock_ai_client` to stub `generate_text` return value for prompt generation
- Use `temp_project_dir` as `projects_dir`
- After `generate()`, assert that `cover/cover.png`, `cover/prompt.txt`, and `cover/brief.json` exist

### Common Patterns
- Test all four `product_mode` values to verify background colour branching
- `generate_prompt()` can be tested independently without triggering image rendering

<!-- MANUAL: -->
