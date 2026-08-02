---
scope: services/tests
depends_on: [../api.py, ../pytest.ini]
status: partial
---

# AGENTS.md — services/tests

## Tujuan Folder Ini
Suite test Python untuk FastAPI service (port 8767, `services/api.py`). Menyediakan fixture bersama dan test level API/health di top-level; cakupan per-modul (ebook, dll.) ada di subfolder masing-masing.

## Ekspor / Interface Utama
- Fixture `client` — `conftest.py:18-21`: `TestClient(app)` terhadap app FastAPI asli (`from services.api import app`, `conftest.py:15`).
- Env dummy sebelum import app — `conftest.py:7-12`: `OMNIROUTE_BASE_URL=http://localhost:20128/v1` dan `OMNIROUTE_API_KEY="sk-test-key"` (dummy test-only, bukan secret asli) via `os.environ.setdefault`.
- `test_api_health.py` — health check `/health` + docs/openapi.
- `test_remotion.py` — wrapper panggilan Remotion (render).

## Dependensi Internal
- Depends on: `/services/api.py`, `/services/pytest.ini` (testpaths: `tests bookshelf pinterest clipper`), `/services/ebook` (via subfolder `ebook/`).
- Depended by: — (tidak ada yang mengimpor test).

## Subdirektori
- `ebook/AGENTS.md` — test suite lengkap service ebook (pipeline/export/db/cover), dengan subfolder: `test_app/`, `test_cover/`, `test_db/` (test_database.py, test_repository.py, test_repository_security.py), `test_export/`, `test_i18n/`, `test_integrations/`, `test_mcp/`, `test_models/`, `test_pipeline/` (+`comics/`), `test_research/`, `test_utils/`, `integration/` (test_full_pipeline.py); file top-level: `test_ai_client.py`, `test_e2e_comics.py`, `test_e2e_quality.py`, `conftest.py`.

## Issue Spesifik
- [Medium] Dummy API key `sk-test-key` di `conftest.py:11` — aman (bukan secret asli) tapi mudah tertukar dengan key riil; pertahankan prefiks jelas seperti sekarang agar tidak ter-revoke oleh secret scanner. [INFERENSI — intent, bukan bug]
- [Low] Tidak ada test yang menutup koneksi DB Prisma (`ebook/test_db` pakai `DATABASE_URL` lokal `localhost:5432/berkahkarya` per `../db/models.py:50-53`) — test DB butuh Postgres lokal berjalan; bukan kegagalan deterministik di CI tanpa service. [HIPOTESIS — perlu verifikasi manual]

## Rekomendasi Perbaikan Scoped
Tidak ada perbaikan kritis di folder ini; fokus perbaikan ada di `services/AGENTS.md` (Issue Spesifik) dan `services/db/AGENTS.md`.

> Last updated: 2026-08-02 — dibuat saat fase verifikasi DoD swarm onboarding; daftar subfolder test diverifikasi via Glob (services/tests/**).
