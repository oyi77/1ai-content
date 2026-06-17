<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# app/pages

## Purpose
Streamlit numbered pages implementing the 4-step user workflow. Streamlit orders pages by filename prefix.

## Key Files

| File | Description |
|------|-------------|
| `1_📊_Idea_Research.py` | Step 1 — user enters ebook idea; triggers `StrategyPlanner` for market/audience analysis |
| `2_✍️_Create_Ebook.py` | Step 2 — configuration (product_mode, language, chapter count) and pipeline kick-off |
| `3_📈_Progress.py` | Step 3 — polls `JobQueue.get_progress()` and displays live generation status |
| `4_📥_Export.py` | Step 4 — triggers `DocxGenerator` / `PdfConverter` and provides download buttons |

## For AI Agents

### Working In This Directory
- Page order is determined by the numeric prefix; renaming a file reorders the sidebar nav
- Each page is a standalone Streamlit script — use `st.session_state` to pass data between pages
- Keep business logic in `src/`; pages should only handle UI state and call `src/` classes

### Testing Requirements
- No automated tests — validate by running `streamlit run app/main.py` and exercising the UI manually

## Dependencies

### Internal
- `src/pipeline/` — all stage classes
- `src/jobs/queue.JobQueue`
- `src/export/docx_generator.DocxGenerator`
- `src/export/pdf_converter.PdfConverter`

### External
- `streamlit>=1.28`

<!-- MANUAL: -->
