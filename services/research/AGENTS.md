---
scope: services/research
depends_on: (tidak ada dependensi antar-service internal; OmniRoute/Ollama eksternal)
status: complete
---

## Tujuan Folder Ini
Engine riset niche untuk pasar buku: meneliti niche, men-generate brief buku, dan memetakan pasar bahasa. Berbasis LLM via OmniRoute (dengan fallback Ollama).

## Ekspor / Interface Utama
- `ResearchEngine` (engine.py:64), di-export dari __init__.py beserta tipe `BookGenre`/`BookNiche`/`LanguageMarket`.
  - Dataclass: `BookGenre` l.27, `BookNiche` l.37, `LanguageMarket` l.51.
  - `research_niches(language="en", region, category, count=8, source_hint)` (l.93, async).
  - `_clean_llm_json` l.173; `generate_book_brief` l.213; `_parse_market_response` l.275.
  - `_call_llm` l.319 — OmniRoute (URL env default `http://127.0.0.1:20128/v1`, l.19; API key via env l.20) → fallback Ollama `qwen3:0.6b` l.345; retry khusus mode reasoning-only +2000 token l.367.
  - CLI l.391.

## Dependensi Internal
- Dipakai oleh: `services/routers/research.py` (lazy singleton `_get_research_engine` l.11-19 → rute `/research/niches` dsb.).

## Issue Spesifik
Tidak ada temuan material di folder ini (parsing JSON punya `_clean_llm_json` + retry).

## Rekomendasi Perbaikan Scoped
- Pastikan API key OmniRoute hanya dibaca dari env (jangan fallback ke default/key yang di-hardcode).
- Pertimbangkan batas waktu (timeout) eksplisit pada `_call_llm` agar CLI tidak menggantung saat OmniRoute down.
