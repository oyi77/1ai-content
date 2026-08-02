---
scope: services/projects
depends_on: services/ebook (penulis data, [FILE TIDAK TERLAMPIR — inferensi])
status: complete
---

## Tujuan Folder Ini
Folder data runtime untuk pipeline ebook. Bukan modul kode — berisi artefak hasil jalan pipeline: `model_stats_*.json` (statistik provider LLM per run), `token_calibration.json` (kalibrasi token), dan subfolder per project (`1/`) berisi outline, strategy, style guide, dan toc.

## Ekspor / Interface Utama
Tidak ada ekspor kode (data-only). Struktur saat ini:
- `1/` — outline.json, strategy.json, style_guide.json (berisi daftar banned_phrases besar), toc.md. Isi outline bertanda "Test" → kemungkinan sisa run percobaan dengan project_id=1.
- `model_stats_<provider>.json` — nama file mengikuti `provider` saat run.
- `token_calibration.json` — hasil kalibrasi token.

## Dependensi Internal
- Penulis (di luar folder ini, inferensi dari jejak kode):
  - `model_stats_*` ditulis `services/ebook/pipeline/manuscript_engine.py:51` — `_provider = self.ai_client.provider` (l.50) dipakai untuk `_stats_file = Path("projects") / f"model_stats_{_provider}.json"`.
  - `token_calibration.json` ditulis `services/ebook/pipeline/token_calibrator.py:15` (`CALIBRATION_FILE = Path("projects/token_calibration.json")`).
- Pembaca (inferensi): `services/ebook/` — orchestrator.py:34-81, generator.py:243, export/*, mcp/server.py:148.
- Git: `1/*` di-track (4 file). `services/projects/model_stats_*.json` (`.gitignore:58`) dan `services/projects/token_calibration.json` (`.gitignore:59`) di-ignore dengan komentar "Test artifacts (do NOT ignore production projects/)" — sengaja dikecualikan.

## Issue Spesifik
- **Medium**: 48 file `model_stats_<MagicMock name='mock.provider' id='...'>.json` di disk — artefak unit test bocor ke direktori data runtime. Traceable: file → manuscript_engine.py:51 → `self.ai_client.provider` yang berupa `Mock` saat unit test, sehingga nama provider = `repr(MagicMock)` (berisi spasi, kutip, `<`/`>`, tanda kurung). Sudah tertutup dari git (di-ignore .gitignore:58), tapi tiap run test menambah file junk (~0.5 KB/file) di direktori data bersama.
- Catatan (bukan finding folder ini): `model_stats_omniroute.json` menunjukkan provider `auto/free-chat` 0 success / 258 failures pada manuscript_intro — sinyal monitoring untuk dicek di pipeline ebook.

## Rekomendasi Perbaikan Scoped
- Di `manuscript_engine.py` (folder ebook), sanitasi/normalisasi nama provider sebelum dipakai sebagai nama file, dan beri penanda test (mis. mock → tulis ke temp dir atau skip).
- Jalankan pembersihan sekali jalan atas file `model_stats_<MagicMock...>` yang sudah ada (aman: sudah gitignored).
- Pertimbangkan memindahkan statistik provider ke DB/subfolder tersendiri agar tidak bercampur dengan data project.
