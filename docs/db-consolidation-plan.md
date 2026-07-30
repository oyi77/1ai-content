# Database Consolidation Plan — 1ai-content

## Current State (4 databases → 1 PostgreSQL)

| # | Database | Engine | Tables | Location |
|---|----------|--------|--------|----------|
| 1 | Main app | PostgreSQL | ~30 Prisma models | `DATABASE_URL` env |
| 2 | `processed_videos.db` | SQLite | 1 table | `$DATA_DIR/processed_videos.db` (default `/tmp/`) |
| 3 | `projects.db` | SQLite | 4 tables | `data/ebook/projects.db` |
| 4 | `ebook_generator.db` | SQLite | 4 tables (same schema) | `data/ebook_generator.db` (default path) |

**Key observation:** Both ebook SQLite DBs share identical schema (`projects`, `jobs`, `project_metadata`, `integration_logs`). Schema defined in `services/ebook/db/schema.py`. They will unify into one set of PostgreSQL tables.

---

## Risk Assessment

### Risk: Ebook pipeline is heavily synchronous
- DatabaseManager, Repository, and the entire PipelineOrchestrator run in `threading.Thread` daemon threads
- ComicsOrchestrator uses raw `sqlite3.connect()` — no abstraction layer
- **Mitigation:** Use **psycopg2** (sync PostgreSQL driver) within the ebook pipeline. No async refactoring needed. psycopg2 is likely already present (check `requirements.txt`).

### Risk: Three ORMs in one codebase
- TypeScript: Prisma (canonical)
- Python: SQLAlchemy (async, 7 models mirroring Prisma)
- Python: sqlite3 (ebook, raw, 3 independent layers)
- **Mitigation:** Keep Prisma as the single source of truth for schema. SQLAlchemy Python models are the Python API layer — **document, don't remove**. Ebook migration adds SQLAlchemy sync engine alongside the existing async engine.

### Risk: data loss during migration
- `projects.db` exists on disk with real data
- `ebook_generator.db` doesn't exist yet (created on first run)
- **Mitigation:** Phase ebook PG migration AFTER Prisma models are deployed + migrated. Script to export SQLite data → PG before dropping `.db` files.

### Risk: MCP server runs independently
- `services/ebook/mcp/server.py` uses `PROJECT_ROOT / "data" / "ebook_generator.db"` default
- Started as standalone process, not through EbookContentGenerator
- **Mitigation:** Make MCP server accept `DATABASE_URL` env var, defaulting to the same PG database.

---

## Execution Plan (17 items, 4 phases)

### Phase 0 — Task 1: Fix redundant PrismaClient (1 item)

**File:** `src/services/prompt-optimizer.service.ts:15`

**Change:** Replace `const prisma = new PrismaClient()` with import from canonical singleton:
```ts
import { prisma } from '@/config/database';
```
Delete `const prisma = new PrismaClient();` at L15.

**Risk:** None. Singleton pattern already established.

---

### Phase 0 — Ebook SQLite → PostgreSQL (5 items)

#### Step 1: Add Prisma models for ebook tables

**File:** `prisma/schema.prisma`

Add 4 models:
```prisma
model EbookProject {
  id             Int      @id @default(autoincrement())
  title          String   @db.VarChar(500)
  idea           String   @db.Text
  productMode    String   @default("lead_magnet") @map("product_mode") @db.VarChar(50)
  targetLanguage String   @default("en") @map("target_language") @db.VarChar(10)
  chapterCount   Int      @default(5) @map("chapter_count")
  status         String   @default("draft") @db.VarChar(20)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")

  jobs             EbookJob[]
  metadata         EbookProjectMetadata[]
  integrationLogs  EbookIntegrationLog[]

  @@map("ebook_projects")
}

model EbookJob {
  id           Int      @id @default(autoincrement())
  projectId    Int      @map("project_id")
  step         String   @db.VarChar(100)
  status       String   @default("pending") @db.VarChar(20)
  progress     Int      @default(0)
  errorMessage String?  @map("error_message") @db.Text
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  project EbookProject @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@map("ebook_jobs")
}

model EbookProjectMetadata {
  id        Int      @id @default(autoincrement())
  projectId Int      @map("project_id")
  key       String   @db.VarChar(255)
  value     String?  @db.Text
  createdAt DateTime @default(now()) @map("created_at")

  project EbookProject @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, key])
  @@map("ebook_project_metadata")
}

model EbookIntegrationLog {
  id                  Int       @id @default(autoincrement())
  integrationId       String    @map("integration_id") @db.VarChar(255)
  event               String    @db.VarChar(100)
  status              String    @db.VarChar(20)
  httpStatus          Int?      @map("http_status")
  error               String?   @db.Text
  consecutiveFailures Int       @default(0) @map("consecutive_failures")
  circuitOpen         Int       @default(0) @map("circuit_open")
  circuitOpenUntil    DateTime? @map("circuit_open_until")
  createdAt           DateTime  @default(now()) @map("created_at")

  project EbookProject @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@map("ebook_integration_logs")
}
```

Then run: `npx prisma db push && npx prisma generate`

**Risk:** Table name collision with existing tables — none, `ebook_` prefix is unique.

#### Step 2: Add sync SQLAlchemy models for ebook in `services/db/models.py`

Add sync engine alongside existing async engine. Update `DatabaseManager` to use it.

**File:** `services/db/models.py`

```python
# Sync engine for ebook pipeline (runs in background threads)
SYNC_DATABASE_URL = DATABASE_URL  # same URL, sync driver
sync_engine = create_engine(SYNC_DATABASE_URL, pool_size=5, max_overflow=10)
SyncSession = sessionmaker(sync_engine)

class EbookProject(Base):
    __tablename__ = "ebook_projects"
    id = Column(Integer, primary_key=True, autoincrement=True)
    # ... all fields
```

**Alternative:** Install `psycopg2-binary` as dependency and use direct psycopg2 connections in DatabaseManager (less code). This avoids adding 4 more model classes + sync engine to `models.py`.

**Decision:** Use **direct psycopg2** in DatabaseManager. Simpler, keeps the SQLAlchemy file focused. Adds only 1 new dependency.

#### Step 3: Update DatabaseManager

**File:** `services/ebook/db/database.py`

Replace whole class:
- Constructor reads `DATABASE_URL` from env
- `get_connection()` returns a psycopg2 connection with `RealDictCursor` (replaces `sqlite3.Row`)
- `_init_database()` removed — tables managed by Prisma
- `_migrate_schema()` removed — no SQLite-specific migrations needed

#### Step 4: Update Repository + raw callers

**File:** `services/ebook/db/repository.py`
- SQL parameterization: `?` → `%s` (psycopg2 syntax)
- `lastrowid` → `RETURNING id` or `cursor.fetchone()[0]`
- All queries stay the same otherwise

**File:** `services/ebook/pipeline/comics/comics_orchestrator.py`
- Replace `_get_project()`, `_set_metadata()`, `_update_status()` with ProjectRepository calls

#### Step 5: Update callers (generator.py, orchestrator.py, export_orchestrator.py, mcp/server.py)

- Remove `db_path` parameter where possible
- Default constructors use PG via `DATABASE_URL`
- MCP server uses `os.getenv("DATABASE_URL")`

#### Step 6: Data migration script

Write a one-time Python script:
```python
# migrate_ebook_sqlite_to_pg.py
import sqlite3, psycopg2
src = sqlite3.connect("data/ebook/projects.db")
dst = psycopg2.connect(dsn)
# COPY rows from each table
src.close(); dst.close()
```

Then delete: `data/ebook/projects.db` and `data/ebook_generator.db`

---

### Phase 1 — SQLAlchemy Mirror Audit (2 items)

**Current state:** `services/db/models.py` defines 7 SQLAlchemy model classes + async engine + session. This is NOT a redundant mirror — it's the **Python data access layer** for the main PostgreSQL.

| Model | Table | Callers |
|-------|-------|---------|
| User | `users` | ab_testing/service.py (via ABTest relationship) |
| Video | `videos` | (none directly — might be for future use) |
| Carousel | `carousels` | (none directly) |
| ContentCalendar | `content_calendar` | content_calendar/content_calendar.py |
| ABTest | `ab_tests` | ab_testing/service.py |
| ViralScan | `viral_scans` | (none directly) |
| PricingConfig | `pricing_config` | (none directly) |

**Decision:** KEEP `services/db/models.py` — it's the Python API layer. Add a comment header:
```python
"""
Python data access layer for the main PostgreSQL database.
Mirrors Prisma schema. NOT redundant — required by Python services.
"""
```

**Action items:**
1. Add documentation header explaining this is the Python API layer
2. Verify no stale model classes (models without callers should be noted)

---

### Phase 2 — processed_videos.db → PostgreSQL (3 items)

#### Step 1: Add ProcessedVideo Prisma model

```prisma
model ProcessedVideo {
  urlHash     String   @id @map("url_hash") @db.VarChar(64)
  sourceUrl   String   @map("source_url") @db.Text
  processedAt DateTime @map("processed_at")
  filePath    String?  @map("file_path") @db.Text

  @@map("processed_videos")
}
```

#### Step 2: Update Python side

**File:** `services/db/models.py` — add ProcessedVideo SQLAlchemy model

**File:** `services/routers/_shared.py` — replace:
```python
# Remove
_PROCESSED_VIDEOS_DB = os.path.join(os.environ.get("DATA_DIR", "/tmp"), "processed_videos.db")

# Add helper
async def _save_processed_video(url_hash: str, source_url: str, file_path: str) -> None: ...
async def _find_processed_video(url_hash: str) -> dict | None: ...
```

**File:** `services/routers/video.py` — replace sqlite3 calls with async helper

**File:** `services/api.py:80-98` — remove startup event for SQLite table creation

**File:** `services/routers/download.py:8` — remove `_PROCESSED_VIDEOS_DB` import (verify it's unused, then remove)

#### Step 3: Delete old SQLite file

---

### Rollback Plan

| Failure | Detection | Rollback |
|---------|-----------|----------|
| Ebook pipeline fails to start | PM2 logs, `/ebook/*` endpoints return 500 | Set `USE_EBOOK_SQLITE=true` env var to bypass PG and use SQLite fallback |
| processed_videos dedup fails | Video re-processing same URLs | Revert `video.py` + `_shared.py` changes |
| PrismaClient issue | TypeScript compile error | Revert `prompt-optimizer.service.ts` |
| Data loss in ebook | Projects missing | Re-run migration script from `.db` files (don't delete until verified) |

**Key safety rule:** Never delete `.db` files until data migration script has been run AND verified against PG.

---

## Summary: Files Touched (by phase)

| File | Phase | Change Type |
|------|-------|-------------|
| `src/services/prompt-optimizer.service.ts` | P0.1 | Replace `new PrismaClient()` → import |
| `prisma/schema.prisma` | P0.2 + P2 | Add 5 new models |
| `services/ebook/db/database.py` | P0.2 | Replace sqlite3 → psycopg2 |
| `services/ebook/db/repository.py` | P0.2 | `?` → `%s`, `lastrowid` → `RETURNING` |
| `services/ebook/db/schema.py` | P0.2 | Delete (tables via Prisma) |
| `services/ebook/db/models.py` | (unchanged) | Pydantic models — platform-independent |
| `services/ebook/pipeline/comics/comics_orchestrator.py` | P0.2 | Replace raw sqlite3 → Repository |
| `services/ebook/generator.py` | P0.2 | Remove `db_path` default, read from env |
| `services/ebook/pipeline/orchestrator.py` | P0.2 | Remove `db_path` default, read from env |
| `services/ebook/export/export_orchestrator.py` | P0.2 | Remove `db_path` default, read from env |
| `services/ebook/mcp/server.py` | P0.2 | Use `DATABASE_URL` instead of hardcoded path |
| `services/db/models.py` | P1 | Add header docs |
| `services/db/models.py` | P2 | Add ProcessedVideo model |
| `services/routers/_shared.py` | P2 | Replace SQLite path → async PG helpers |
| `services/routers/video.py` | P2 | Replace sqlite3 → async helpers |
| `services/routers/download.py` | P2 | Remove dead import |
| `services/api.py` | P2 | Remove `_startup_processed_videos_db` event |
| `data/ebook/projects.db` | P0.2 | Delete after migration |
| `data/ebook_generator.db` | P0.2 | Delete after migration |
| `/tmp/processed_videos.db` | P2 | Delete after migration |

**Total: ~15 source files changed, 2 SQLite files deleted, 5 Prisma models added.**