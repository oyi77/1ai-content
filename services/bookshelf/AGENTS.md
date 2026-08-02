---
scope: bookshelf
depends_on:
  - path: services/ab_testing
    type: services
status: complete
---

# AGENTS.md — services/bookshelf

## Tujuan
Generasi buku otomatis dari deskripsi topik: pipeline generate → struktur → tulis per-bab → assemble markdown → (opsional) PDF. Inference via OmniRoute/Groq (OpenAI-compatible) atau Ollama lokal.

## Ekspor-Interface
- `generate_book_pipeline` (`engine.py:17`), helper `_flatten_sections` (144).
- `GenerationStatistics` (`stats.py:7`) — state statistik global `total_stats` (41).
- `get_language_instruction` (`language.py:33`) — instruksi bahasa untuk 20 bahasa.
- `openai_provider.py`: `get_local_client` (30, env `BOOKSHELF_LOCAL_URL`, base `LOCAL_LLAMA_BASE_URL="http://localhost:11434/v1"` 17), `get_async_local_client` (40), `get_groq_client` (50, env `OMNIROUTE_API_KEY`/`GROQ_API_KEY`, base `OMNIROUTE_BASE_URL="http://localhost:20128/v1"` 18), `get_async_groq_client` (60), `reset_client` (70) — pola singleton.
- Agents: `agents/title_writer.py:generate_title` (19); `agents/structure_writer.py:generate_structure` (30, `_extract_json` 81 fallback "Untitled"); `agents/section_writer.py:generate_section_content` (25, `_generate` 55).
- Tools: `tools/markdown.py:assemble_markdown` (6); `tools/pdf.py:markdown_to_pdf` (8, weasyprint di-import deferred).
- `__init__.py` mengekspor `generate_book_pipeline` dan `GenerationStatistics`.

## Dependensi Internal
- `services/ab_testing` terdaftar sebagai dependensi umum di repo (sama-sama memakai pola OmniRoute); tidak ada impor silang langsung antar file bookshelf ke service lain.

## Issue Spesifik
- [MEDIUM] `tools/pdf.py:8` `markdown_to_pdf` (weasyprint): di lingkungan ini runtime error `'super' object has no attribute 'transform'` — test `test_bookshelf.py:214 test_markdown_to_pdf` di-SKIP. PDF tidak dapat dihasilkan dengan benar di env ini.
- [LOW] `stats.py:41` `total_stats` adalah global yang tidak pernah di-reset antar-generasi — statistik akumulatif bisa menyesatkan.
- [LOW] `agents/section_writer.py:55` SYSTEM_PROMPT ditulis dalam Bahasa Indonesia padahal bahasa default pipeline `"en"` — prompt dan output berbahasa tidak sinkron bila bahasa tidak diset eksplisit.

## Rekomendasi
- PDF: dokumentasikan/isolasi kegagalan weasyprint (opsi: gunakan fallback renderer, atau perbaiki versi dependensi).
- `total_stats`: sediakan reset per-run atau agregasi ber-window.
- `section_writer`: bangun SYSTEM_PROMPT dinamis dari bahasa yang diminta.
- **Belum diterapkan** — audit dokumentasi saja, tanpa perubahan kode.
