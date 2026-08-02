---
scope: analysis
depends_on: []
status: complete
---

# AGENTS.md — services/analysis

## Tujuan
Analisis kanal YouTube: mengambil info kanal, video, transkrip, menganalisis performa/konten, dan membandingkan kanal. Bergantung pada `yt-dlp` eksternal (path dapat diset via argumen).

## Ekspor-Interface
- `ChannelAnalyzer` (`channel_analyzer.py:25`):
  - `__init__(ytdlp_path="yt-dlp")` (28)
  - `get_channel_info` (33), `get_channel_videos` (59), `get_video_transcript` (92)
  - `analyze_performance` (130), `analyze_content` (194), `analyze_thumbnails` (238), `generate_strategy` (248)
  - `analyze_channel` (345), `compare_channels` (390)
- `__init__.py` hanya berisi docstring 9 baris — TIDAK mengekspor apa pun (impor dilakukan via `services.analysis.channel_analyzer`).

## Dependensi Internal
- Tidak ada dependensi ke service lain; `yt-dlp` dijalankan sebagai subprocess.

## Issue Spesifik
- [MEDIUM] `channel_analyzer.py:92` `get_video_transcript`: transkrip disimpan ke `/tmp/transcript_%(id)s` dengan nama berbasis id video saja — race jika dua panggilan kanal sama dijalankan konkuren (file saling menimpa).
- [MEDIUM] `channel_analyzer.py:130` `analyze_performance`: `top_5` dan `bottom_5` bisa overlap (jika ukuran daftar video kecil) — video yang sama muncul di dua kategori.
- [LOW] `channel_analyzer.py:238` `analyze_thumbnails` adalah STUB (tidak ada implementasi).
- [LOW] `channel_analyzer.py:248` `generate_strategy` tidak memanggil LLM apa pun padahal dokumentasi/docstring mengesankan analisis strategi — mismatch docs vs perilaku.

## Rekomendasi
- Transkrip: beri suffix unik (hash url/handle) pada nama file `/tmp`, atau hapus file setelah dibaca.
- `analyze_performance`: pastikan `top_5` dan `bottom_5` disjoint (potong daftar terurut).
- Lengkapi `analyze_thumbnails` atau beri tanda eksplisit "belum diimplementasikan".
- Perbaiki docstring `generate_strategy` agar sesuai perilaku aktual.
- **Belum diterapkan** — audit dokumentasi saja, tanpa perubahan kode.
