<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# tests/test_export

## Purpose
Unit tests for `src/export/` — DOCX generation, PDF conversion, and file management.

## Key Files

| File | Description |
|------|-------------|
| `test_docx_generator.py` | Tests for `DocxGenerator`: DOCX creation from manuscript, cover image embedding, output path |
| `test_pdf_converter.py` | Tests for `PdfConverter`: LibreOffice detection, conversion invocation, error handling |

## For AI Agents

### Working In This Directory
- Pre-populate `manuscript.md` in `temp_project_dir` before testing `DocxGenerator`
- PDF tests should skip or mock `subprocess.run` when LibreOffice is unavailable — use `pytest.mark.skipif(not PdfConverter().check_installation(), ...)`
- `DocxGenerator` tests do not require `mock_ai_client` — no AI calls in export stage

### Common Patterns
- Assert `exports/ebook.docx` exists and is non-empty after `DocxGenerator.generate()`
- Test `PdfConverter.check_installation()` separately from `convert()` to isolate env checks

<!-- MANUAL: -->
