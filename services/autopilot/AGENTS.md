---
scope: autopilot
depends_on:
  - path: services/cloak_adapter
    type: services
  - path: services/faceless/engine.py
    type: services
  - path: services/trends/seo_generator.py
    type: services
status: complete
---

# AGENTS.md — services/autopilot

## Tujuan
Otomasi penerbitan konten berjadwal: orchestrator menjalankan job (faceless → SEO → cloak publish), scheduler in-memory mengelola jadwal, dan publisher TikTok memposting via CloakBrowser.

## Ekspor-Interface
- `AutoPilotOrchestrator` (`orchestrator.py:23`): `__init__` (26; `_active_jobs=0` 33, `_jobs={}` 36, `_next_job_id=1` 37); property `faceless_engine` (40, lazy), `seo_generator` (48, class lokal `_SEOGenerator` di 242), `cloak_adapter` (55, lazy); `create_job` (62, id `job_{:04d}` 68); `check_and_run` (88); `run_job` (107); `get_status` (216); `_reset_daily_counters_if_needed` (228); `_next_run_hint` (237).
- `AutoPilotScheduler` (`scheduler.py:27`): `__init__` (30, in-memory), `create_job` (33), `get_jobs` (68), `get_job` (72), `stop_job` (76), `check_and_run` (84), `mark_run` (110), `_compute_next_run` (127).
- `AutoPilotTikTokPublisher` (`tiktok_publisher.py:26`): `__init__` (36), `create_job` (43, default times `["11:00","15:00","19:00"]` 77), `run_scheduled_job` (93).
- `__init__.py` KOSONG (0 baris) — tidak ada ekspor; impor via path modul.

## Dependensi Internal
- `services/cloak_adapter` (dalam scope) — CloakBrowserAdapter untuk publish.
- `services/faceless/engine.py` (property `faceless_engine`) — LUAR SCOPE, [FILE TIDAK TERLAMPIR — inferensi].
- `services/trends/seo_generator.py` (SEOGenerator, diimpor `tiktok_publisher.py` dan digunakan orchestrator) — LUAR SCOPE, [FILE TIDAK TERLAMPIR — inferensi].

## Issue Spesifik
- [HIGH] `tiktok_publisher.py:148-151` SyntaxError: `media_path = content_result.get("media_path") or ( if content_type == ... else ... )` — conditional expression tidak valid (konstruksi `or ( if ... )`). Modul tidak dapat di-import sama sekali.
- [MEDIUM] `orchestrator.py:96` dan `:206` `_active_jobs += 1` terjadi DUA kali per job (sekali di `check_and_run`, sekali di `run_job`) dan tidak pernah di-decrement — counter naik tanpa batas, hanya di-reset harian (234).
- [MEDIUM] `scheduler.py:76` `stop_job` hanya menandai job; tidak ada mekanisme re-activate. `check_and_run:100` mencocokkan menit run berikutnya dengan string exact — job yang terlewat saat proses mati tidak di-catch-up.
- [LOW] `tiktok_publisher.py:123` memakai `random.choice` tanpa `import random` (import section 13-23) — akan `NameError` saat runtime meskipun SyntaxError di 148-151 sudah diperbaiki.

## Rekomendasi
- Perbaiki SyntaxError 148-151 menjadi: `media_path = content_result.get("media_path") or content_result.get("video_path")` (logika carousel/video ditangani lebih awal di pipeline).
- Tambahkan `import random` di `tiktok_publisher.py`.
- `_active_jobs`: decrement saat job selesai/gagal, atau jadikan property terhitung.
- Scheduler: dukung catch-up run dan status re-activate.
- **Belum diterapkan** — audit dokumentasi saja, tanpa perubahan kode.
