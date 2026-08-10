# Service Layer Remediation — 6-Phase Status

**Status**: 6 of 6 phases resolved (5 implemented + runtime-verified 2026-08-10, 1 no-op verified, Phase 6 optional evaluated 2026-08-10 — deliberately not migrated).

Last verified: 2026-08-10. All line anchors re-checked against current `master`; Phase 4 runtime-verified on live :8767.

| Phase | Status | Evidence |
|-------|--------|----------|
| 1. Flatten DI | ✅ Done | `services/di.py` is a flat lazy-singleton registry (240 lines), consumed by all routers |
| 2. Extract routes from api.py | ✅ Done | `services/api.py` now 192 lines (was 877 at 2026-07-29 audit); 28 routers registered |
| 3. Type-annotate getters | ✅ Done | All 25 getters return-annotated; `TYPE_CHECKING` block for types |
| 4. Static imports | ✅ Done | `services/di.py` static imports (242 lines, +0.385s boot); engines kept lazy for singleton safety — see `phase4-static-imports.md` |
| 5. Dedupe `/health` | ✅ No-op | Single `/health` route; no duplicates exist |
| 6. Optional ABC hardening | ✅ Evaluated — not migrated | Lifecycle ABC doesn't fit the 3 one-shot sync engines; see Phase 6 decision |

---

## Phase 1 — Flatten DI ✅

`services/di.py` (240 lines) is the flat dependency container:

- `from __future__ import annotations` (l.8); `TYPE_CHECKING` block (l.12-37) declaring 25 service types.
- `_instances: dict[str, Any] = {}` cache (l.39).
- 25 lazy-singleton getters: storyboard (l.42), tts (l.50), music (l.58), looping (l.66), analyzer (l.74), cloak (l.82), pinterest (l.90), carousel (l.98), calendar (l.106), ab_testing (l.114), autopilot (l.122), engagement (l.130), repurpose_engine (l.138), remetadata_engine (l.146), clipper (l.154), faceless (l.162), brand (l.170), podcast (l.178), newsletter (l.186), article (l.194), infographic (l.202), meme (l.210), subtitles (l.218), screenrec (l.226), interactive (l.234).
- Cross-getter dependency: `get_engagement()` → `get_cloak()` at l.134 (`AutoReplyEngine(cloak_adapter=get_cloak())`).

Docstring (l.3-6) documents the design intent: avoid up-front import cost at module load.

**Residual**: `_instances` is `dict[str, Any]` — could be tightened with `Protocol`/`Generic`, but no runtime value; leave.

## Phase 2 — Extract routes from api.py ✅

`services/api.py` (192 lines) is now a thin composition root:

- App + startup: `FastAPI(title="1AI-Content Factory API", version="2.0.0")` (l.31-35); `startup_db` (l.38-45, `services.db.models.init_db`); `start_trending_scanner` (l.52-59, `services.trends.scanner`).
- Registry: `GeneratorRegistry` (l.66-67).
- Router imports l.69-98 (28 routers); registration l.101-129 (`add_router` ×27) + `registry.register(EbookContentGenerator(), prefix="/text/ebook")` (l.130).
- Auth: `PUBLIC_ALLOWLIST = {"/health"}` (l.147); `_is_public` (l.150-155); `@app.middleware("http")` `enforce_api_key` (l.158).

No inline handlers remain. All endpoint logic lives in `services/routers/*.py`.

## Phase 3 — Type-annotate getters ✅

All 25 getters carry `-> <ServiceType>` annotations backed by `TYPE_CHECKING` imports. Verified across the full l.42-240 sweep.

**Residual**: none of consequence. The one remaining `Any` is the cache keyed by string — see Phase 1 residual.

## Phase 4 — Static imports ✅ COMPLETED

**Executed 2026-08-10 (Option B)**: all 25 engine imports moved to module top in `services/di.py` (242 lines). Getter bodies/cache untouched. The 3 in-function engine sites (`podcast/engine.py:62,115`, `screenrec/engine.py:111`) intentionally kept lazy — direct engine-class calls would bypass cached `_instances` singletons.

Verified: `import services.di` 0.467s vs 0.082s lazy baseline (+0.385s, <1s bar); 35 import match-sites unchanged (24 `from services.di import` + 11 `import services.di`); pytest **596 passed, 1 skipped**; systemd-restarted :8767 serves 98 routes with getter-backed endpoints 200 (`/audio/speech/voices`, `/image/carousel/styles`, `/text/ebook/health`).

See `docs/plans/phase4-static-imports.md` for the recipe + full execution record.

Key verified facts driving it:

- 21 router files import getters from `services.di` at module level (`ab_testing, analyze, article, audio, autopilot, brand, calendar, clipper, cloak, engagement, faceless, image, infographic, interactive, meme, newsletter, pinterest, podcast, screenrec, subtitles, video`).
- 2 engines use **in-function** lazy `services.di` imports with explicit comments:
  - `services/podcast/engine.py:62` — `from services.di import get_tts  # lazy, keep module import side-effect free`
  - `services/podcast/engine.py:115` — `from services.di import get_music  # lazy`
  - `services/screenrec/engine.py:111` — `from services.di import get_tts  # lazy — avoid import cycle at module load`
- 11 test files `import services.di as di` and monkeypatch getters (`_StubFaceless`, `_StubClipper`, etc.) — **getter names are a public test contract and MUST NOT change**.

## Phase 5 — Dedupe `/health` ✅ No-op

Verified there is **no duplicate**:

- Single `/health` route from `services/routers/health.py`; `PUBLIC_ALLOWLIST = {"/health"}` (api.py l.147) is a middleware bypass allowlist, not a route.
- Ebook health lives at `/text/ebook/health` (generator-prefixed path) — distinct, not a duplicate.
- `services/generator.py` `health_all(generators)` — **deleted 2026-08-10** (was dead code, zero callers in `services/`; the status-doc recommendation from 2026-08-09 was delete, and it was executed). No aggregation wiring planned — `EbookContentGenerator` is the sole registered generator and exposes `/text/ebook/health` directly.

## Phase 6 — Optional ABC hardening ✅ Evaluated — deliberately not migrated (2026-08-10)

`services/generator.py` is correct and used:

- `ContentGenerator(ABC)` (l.30) with 10 abstract members (`info` l.53, `create` l.61, `status` l.73, `get` l.84, `list` l.89, `delete` l.96, `health` l.103, `generate` l.115, `update` l.126, `cancel` l.134) + concrete `extra_routes` (l.144). (`health_all` module-level helper deleted 2026-08-10 — dead code.)
- `GeneratorRegistry` (l.173): `add_router` (l.184), `register(generator, *, prefix, tags)` (l.188-204), `wire(app)` (l.206-213, imports `register_generator_routes` from `services.routers`).
- Sole implementation today: `EbookContentGenerator` (registered at api.py l.130).

**Decision (2026-08-10) — deliberately NOT migrated.** The ABC is a project-lifecycle contract, and none of the three engines has a lifecycle:

- `ContentGenerator` requires 10 abstract members (`info/create/status/get/list/delete/health/generate/update/cancel`) that `register_generator_routes` (`services/routers/__init__.py`) wires into a lifecycle CRUD surface: `GET/POST {prefix}/projects`, `GET/PUT/DELETE {prefix}/projects/{id}`, `{prefix}/projects/{id}/status`, `{prefix}/projects/{id}/generate`, `{prefix}/projects/{id}/cancel`.
- `FacelessEngine.generate_video(...)` (`services/faceless/engine.py:65`) and `ClipperEngine.clip_video(...)` (`services/clipper/engine.py:33`) are **one-shot synchronous pipelines** — they block for the full pipeline (script → stock → TTS → compose / download → transcribe → highlights → clips) and return a result dict + files under `/tmp/{faceless,clipper}_output`. No project store, no IDs, no status, no cancellation. A migration would fabricate an in-memory project store (state no consumer would query), a `generate` that holds the HTTP request for minutes (worse than today's thin routers), and a no-op `cancel` lie.
- `BrandSettings` (`services/brand/settings.py`) is **not a content generator** — a per-user in-memory settings store + watermark/intro helpers. All 10 abstract members would be fiction.
- The stated gains don't hold: uniform CRUD has no consumer (the revisit condition — "a new consumer needs uniform generator semantics across content types" — is unmet), and health aggregation was already eliminated in Phase 5 (`health_all` deleted as dead code; `EbookContentGenerator` exposes `/text/ebook/health` directly).
- `EbookContentGenerator` remains the sole, correct implementation (DB-backed project lifecycle). The three engines keep their thin functional routers (`services/routers/{faceless,brand,clipper}.py`), live-verified on :8767 (`faceless/*`, `brand/*`, `clipper/*` in the 98 OpenAPI paths).

Override path: if a consumer later needs uniform generator semantics, execute the migration then — the fabricated lifecycle is not worth shipping today (YAGNI / refuse unnecessary abstractions).

---

## Rollback / safety

Phase 4 is the only phase with a code-change recipe; its rollback is a per-file revert of `services/di.py` plus any engine import lines touched (full recipe in `phase4-static-imports.md`). Phases 1-3 and 5 required no changes (verified complete/no-op), so nothing to roll back.
