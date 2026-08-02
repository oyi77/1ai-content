---
scope: services/db
depends_on: none (internal); eksternal: PostgreSQL
status: complete
---

# services/db

## Tujuan Folder Ini

Lapisan akses database utama (PostgreSQL via SQLAlchemy async) untuk layanan-layanan di repo ini. Terdiri dari `__init__.py` (re-export helper) dan `models.py` (definisi model + helper session/engine).

## Ekspor / Interface Utama

- Model SQLAlchemy (dari `models.py`): `User`, `Video`, `Carousel`, `ContentCalendar`, `ABTest`, `ViralScan`, `PricingConfig`, `ProcessedVideo`
- Helper (re-export dari `__init__.py`):
  - `get_engine()` — membuat async engine dari `DATABASE_URL`
  - `get_async_session()`, `get_db()` — factory session async
  - `init_db()` — inisialisasi schema
  - `check_processed_video(video_id)`, `record_processed_video(video_id, ...)` — dedup video yang sudah diproses (dipakai pipeline video)

## Dependensi Internal

- Tidak ada dependensi antar modul internal (paket ini mandiri; `__init__.py` hanya re-export dari `models.py`).
- Eksternal: PostgreSQL; `DATABASE_URL` dari environment.

## Issue Spesifik

- **Critical**: `services/db/models.py:50-53` — `DATABASE_URL` punya default hardcoded berisi kredensial: `postgresql://***REDACTED***@localhost:5432/berkahkarya` (kredensial diredaksi). Risiko: jika env tidak ter-set, aplikasi terhubung ke database lokal dengan kredensial yang terbuka di source code; juga menyulitkan audit akses.
- **Low**: `services/db/models.py:60-65` — `get_engine()` melakukan string replace `postgresql://` → `postgresql+asyncpg://`. Rentan jika URL sudah menyertakan driver lain (mis. `postgresql+psycopg://`) — replace bisa menghasilkan scheme ganda/keliru.

## Rekomendasi Perbaikan Scoped

- Hapus default kredensial; wajibkan `DATABASE_URL` dari environment (fail-fast dengan pesan jelas jika kosong).
- Ganti string replace dengan konstruksi URL eksplisit (mis. `URL.create(...)` dari `sqlalchemy.engine` atau set `drivername` secara eksplisit).
- Rotasi kredensial yang sempat ter-expose di riwayat git bila repo pernah publik.

> Last updated: 2026-08-02
