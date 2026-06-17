<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# src/export

## Purpose
Converts the generated manuscript and cover into distributable files. Produces DOCX via `python-docx`, converts to PDF via LibreOffice subprocess, and provides file management utilities.

## Key Files

| File | Description |
|------|-------------|
| `docx_generator.py` | `DocxGenerator` — reads `manuscript.md` and `cover/cover.png`, assembles a DOCX with cover page, copyright page, TOC placeholder, and chapter body; saves to `exports/ebook.docx` |
| `pdf_converter.py` | `PdfConverter` — shells out to `libreoffice --headless --convert-to pdf`; raises `RuntimeError` if LibreOffice is not on PATH |
| `file_manager.py` | `FileManager` — project directory layout helper: `ensure_directories()`, `list_projects()`, `get_project_metadata()`, `cleanup_project()` |

## For AI Agents

### Working In This Directory
- `PdfConverter` requires `libreoffice` or `soffice` on `PATH`; check with `PdfConverter().check_installation()` before calling `convert()`
- `DocxGenerator._add_toc()` reads `toc.md` from `self.projects_dir` (not `projects/{id}/`) — this looks like a bug; the correct path should include the project ID subdirectory
- `FileManager.get_project_metadata()` returns the first matching JSON file found in priority order: outline → strategy → manuscript → qa_report

### Testing Requirements
- Mock `subprocess.run` or skip PDF tests when LibreOffice is unavailable
- Use `temp_project_dir` fixture and pre-populate `manuscript.md` before testing `DocxGenerator`

### Common Patterns
- All three classes accept `projects_dir: Path | str = "projects"`
- Export artifacts land in `projects/{project_id}/exports/`

## Dependencies

### Internal
- Reads files written by `src/pipeline/` stages and `src/cover/`

### External
- `python-docx>=1.1` — DOCX generation
- `libreoffice` (system binary) — PDF conversion

<!-- MANUAL: -->
