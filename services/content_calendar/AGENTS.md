---
scope: content_calendar
depends_on:
  - path: services/db/models.py
    type: services
status: complete
---

# AGENTS.md — services/content_calendar

## Tujuan
Kalender konten: dua implementasi paralel — `ContentCalendarService` (persisten, Postgres via SQLAlchemy) untuk penjadwalan produksi, dan `ContentCalendar` (in-memory) untuk penjadwalan run sederhana.

## Ekspor-Interface
- `ContentCalendarService` (`content_calendar.py:17`, SQLAlchemy/Postgres):
  - `schedule_content` (20; `datetime.fromisoformat` tanpa try di 39), `get_entries` (55, limit 50), `get_today_entries` (73, `datetime.now()` lokal 75), `update_entry` (88, `.values(**updates)` tanpa whitelist di 90-99, re-select 100-104), `delete_entry` (106), `mark_published` (117), `get_stats` (124), `get_pending_for_auto_publish` (152, `datetime.now()` 154), `_to_dict` (167)
- `ContentCalendar` (`scheduler.py:12`, in-memory): `VALID_REPEAT` (15), `VALID_STATUSES` (16), `_posts` (20), `add_post` (22, uuid 51, `datetime.utcnow()` 61), `get_schedule` (73), `remove_post` (109), `get_due_posts` (123, utcnow 136), `mark_published` (155, repeat → post BARU 171-179), `get_stats` (181)
- `__init__.py` (9 baris): contoh usage path SALAH `from services.calendar.scheduler import ...` (harus `services.content_calendar.scheduler`).

## Dependensi Internal
- `services/db/models.py:161` model `ContentCalendar` (tablename `"content_calendar"`, FK ke `users.telegram_id`, `@validates content_type` 183-185) + `get_async_session`. [LUAR SCOPE — diverifikasi saat audit]

## Issue Spesifik
- [MEDIUM] Inkonsistensi timezone: `content_calendar.py:75` dan `:154` memakai `datetime.now()` (waktu lokal) sedangkan `scheduler.py:136` memakai `datetime.utcnow()` — baris yang "jatuh tempo" bisa dihitung terhadap zona berbeda tergantung modul yang dipakai.
- [MEDIUM] `content_calendar.py:88-99` `update_entry`: `update(**updates)` menerima field arbitrer dari pemanggil tanpa whitelist — risiko mass assignment (mis. menimpa `user_id`/`status`).
- [MEDIUM] `content_calendar.py:152` `get_pending_for_auto_publish` tanpa filter `user_id` dan tanpa locking/de-dup — dua proses/konsumen bisa memproses entri yang sama dua kali.
- [MEDIUM] Duplikasi domain: class `ContentCalendar` (scheduler.py) berbagi nama dengan model DB `ContentCalendar` (db/models.py) — dua implementasi kalender dengan perilaku berbeda (in-memory vs persisten) membingungkan pemakai.
- [LOW] `__init__.py` contoh usage merujuk path `services.calendar.*` yang tidak ada — impor contoh akan gagal.
- [LOW] `scheduler.py:61` `datetime.utcnow()` deprecated sejak Python 3.12 (migrasi ke `datetime.now(timezone.utc)`).

## Rekomendasi
- Pilih satu sumber waktu (UTC) dan terapkan konsisten di kedua modul.
- `update_entry`: whitelist field yang boleh di-update.
- `get_pending_for_auto_publish`: tambah filter user + lock/petakan status "processing" (atau `SELECT ... FOR UPDATE SKIP LOCKED`).
- Rename salah satu implementasi (mis. `InMemoryCalendar`) atau konsolidasi ke satu.
- Perbaiki path di docstring `__init__.py`.
- **Belum diterapkan** — audit dokumentasi saja, tanpa perubahan kode.
