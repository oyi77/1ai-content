# Service Layer Remediation — 6-Phase Status

**Status**: 6 of 6 phases resolved (5 implemented + runtime-verified 2026-08-10, 1 no-op verified, Phase 6 executed 2026-08-10 via thin `ContentGenerator` wrappers — see Phase 6).

Last verified: 2026-08-10. All line anchors re-checked against current `master`; Phase 4 runtime-verified on live :8767.

| Phase | Status | Evidence |
|-------|--------|----------|
| 1. Flatten DI | ✅ Done | `services/di.py` is a flat lazy-singleton registry (240 lines), consumed by all routers |
| 2. Extract routes from api.py | ✅ Done | `services/api.py` now 192 lines (was 877 at 2026-07-29 audit); 28 routers registered |
| 3. Type-annotate getters | ✅ Done | All 25 getters return-annotated; `TYPE_CHECKING` block for types |
| 4. Static imports | ✅ Done | `services/di.py` static imports (242 lines, +0.385s boot); engines kept lazy for singleton safety — see `phase4-static-imports.md` |
| 5. Dedupe `/health` | ✅ No-op | Single `/health` route; no duplicates exist |
| 6. Optional ABC hardening | ✅ Executed — wrapper migration | Faceless/Clipper wrapped as thin `ContentGenerator`s (commit `3526537`); engines stay non-subclassed; see Phase 6 |

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
- `services/generator.py` `health_all(generators)` — **deleted 2026-08-10** (was dead code, zero callers in `services/`; the status-doc recommendation from 2026-08-09 was delete, and it was executed). No aggregation wiring planned — each registered generator exposes its own `{prefix}/health` directly (3 generators since the Phase 6 wrapper migration: `/text/ebook/health`, `/faceless/health`, `/clipper/health`).

## Phase 6 — Optional ABC hardening ✅ Executed — wrapper migration (2026-08-10)

`services/generator.py` is correct and used:

- `ContentGenerator(ABC)` (l.30) with 10 abstract members (`info` l.53, `create` l.61, `status` l.73, `get` l.84, `list` l.89, `delete` l.96, `health` l.103, `generate` l.115, `update` l.126, `cancel` l.134) + concrete `extra_routes` (l.144). (`health_all` module-level helper deleted 2026-08-10 — dead code.)
- `GeneratorRegistry` (l.173): `add_router` (l.184), `register(generator, *, prefix, tags)` (l.188-204), `wire(app)` (l.206-213, imports `register_generator_routes` from `services.routers`).
- Implementations today (3): `EbookContentGenerator`, `FacelessContentGenerator`, `ClipperContentGenerator` (registered at api.py l.132-134).

**Decision (2026-08-10) — override executed via thin wrappers (commit `3526537`).** The original evaluation (below) concluded the three engines should stay non-subclassed; the user's plugin/provider-pattern mandate (every provider must use the modular/plugin/provider pattern) overrode that "do not migrate" call. Resolution: keep the engines as-is and add thin `ContentGenerator` wrappers that satisfy the ABC contract bidirectionally — every provider uses the pattern *and* direct engine callers keep the thin functional routers.

- Wrappers: `FacelessContentGenerator` (`services/faceless/generator.py`), `ClipperContentGenerator` (`services/clipper/generator.py`) — full 10-member contract, thread-safe in-memory project store (cap 100), lazy engine via `services.di.get_faceless()` / `get_clipper()` (getter names unchanged — public test contract per Phase 4).
- Cancellation is **cooperative, not a no-op**: both engines accept `progress_cb` / `cancel_check` kwargs and honor them at every stage boundary (`services/faceless/engine.py` l.102-104, 110-111, 130-132, 148-150, 157 — script→TTS→stock→compose; clipper likewise). `generate` runs on a background thread (HTTP request never blocks), `cancel` sets the cancel event the engine polls.
- The original fabricated-lifecycle concern partially stands and is accepted: the wrapper store is in-memory and ephemeral (projects vanish on restart), and no consumer queries it today — the store exists to satisfy the contract gate, not to serve a product need. `BrandSettings` (`services/brand/settings.py`) remains **not wrapped** — a per-user in-memory settings store; all 10 abstract members would still be fiction.
- Live-verified on :8767 2026-08-10 (after `sudo -n systemctl restart 1ai-content.service`): `faceless/health`, `clipper/health`, `text/ebook/health` all 200; **110 OpenAPI paths**; full store contract exercised — POST `/faceless/projects` 422 Pydantic `missing` without `topic`, create `faceless_1` with `topic`, GET status `created`, DELETE 200, GET-after-delete 404. Thin functional routers (`services/routers/{faceless,clipper}.py`) coexist with the generator lifecycle routes — dual HTTP surface is intentional (wrapper docstrings), both delegate to the same engine.
- `EbookContentGenerator` remains the reference implementation (DB-backed project lifecycle); the two wrappers extend the same registration path (`api.py:132-134`). Future: only wrap more providers when the plugin pattern demands it; do not extend store semantics without a consumer.

---

## Rollback / safety

Phase 4 is the only phase with a code-change recipe; its rollback is a per-file revert of `services/di.py` plus any engine import lines touched (full recipe in `phase4-static-imports.md`). Phases 1-3 and 5 required no changes (verified complete/no-op), so nothing to roll back.

---

## Security Verification — `/api/py` Gate (2026-08-10)

Cross-check of the two-layer gate protecting the Python media-api (`:8767`) behind the TS bot (`:3002`), exposed live as `content.aitradepulse.com`.

**Architecture.** `content.aitradepulse.com` is a **cloudflared** tunnel to `http://localhost:3002` (verified `/etc/cloudflared/config.yml`, daemon PID 5953; stale `~/.cloudflare-router/config.yml` is only the router-tool regeneration source, not the live mapping). Nginx proxies to `:3002` for `api.`/other hosts — the TS bot is the only reachable app port for this hostname. Two independent gates sit between the internet and `services/api.py`:

1. **Fastify proxy gate** (`src/index.ts` `/api/py/*` ~l.312-359): rate limit 120 req/min/IP, request-body validation, server-side `X-API-Key` injection ("never trust a caller-supplied value"), and an allowlist mirroring the Python gate (`/api/py/health`, GET `/api/py/text/articles`). Non-allowlisted paths → 401 `{"error":"Unauthorized"}` without an admin session.
2. **FastAPI middleware gate** (`services/api.py` l.147-158): `PUBLIC_ALLOWLIST = {"/health"}` (plus special-case GET `/text/articles`), `enforce_api_key` via `secrets.compare_digest`, 401 JSON. **Env-gated**: if `EBOOK_API_KEY` is unset the middleware passes everything (default-open posture — keeps the legacy caller contract; TS clients always send `X-API-Key`).

**Live + local evidence (probed 2026-08-10, `curl -o /tmp/probe_final_*.txt`):**

| Path | Route | Result |
|------|-------|--------|
| LIVE `/api/py/health` | cloudflared → :3002 → :8767 | 200 |
| LIVE `/api/py/pydocs` | proxy gate | 401 |
| LIVE `/api/py/docs` | proxy gate | 401 (24B `{"error":"Unauthorized"}`, x-ratelimit headers present) |
| LIVE `/pydocs` | no route at :3002 | 404 |
| LOCAL :3002 `/api/py/pydocs` | proxy gate | 401 |
| LOCAL :3002 `/api/py/docs` | proxy gate | 401 |
| LOCAL :3002 `/api/py/health` | proxy → uvicorn | 200 (790B uvicorn header) |
| DIRECT :8767 `/docs` | api.py middleware | 401 (proves `EBOOK_API_KEY` is set in prod) |
| DIRECT :8767 `/api/py/pydocs` | api.py middleware | 401 unless allowlisted |

`netstat -ltnp` shows `:8767` bound to loopback only (127.0.0.1); `:3002` binds 0.0.0.0 behind the tunnel. Nginx vhosts: `aitradepulse` family → `:3002`.

**Severity: LOW (informational).** No live exposure: `/docs` (and every non-allowlisted path) returns 401 at both layers; loopback-only `:8767` has no off-host route; the default-open posture only matters for a local attacker who can already read `.env`. This is a hardening recommendation, not a live finding.

**Remediation (documented only — no code/config change shipped in this pass):**

1. **Fail closed**: make the FastAPI middleware reject when `EBOOK_API_KEY` is unset (`raise`/`sys.exit` in env loading or middleware explicit 503), instead of default-open. Keep `PUBLIC_ALLOWLIST` as the narrow bypass.
2. **Allowlist-sync test**: add a unit test asserting `PUBLIC_ALLOWLIST` (api.py) and the `/api/py` proxy allowlist (`src/index.ts`) match — the two lists are maintained by hand today and can drift silently (gap-1: any new public path added on one side must appear on the other).
3. **Prod `docs_url=None`**: run `uvicorn ... --docs-url None` (or FastAPI `docs_url=None`) in `run_api.py` prod path so `/docs`/`/openapi.json` never render even behind the gate.

**Guardrail note**: `smoke_test.py` negative tests expect 404 on `/pydocs` etc. — with the key set, the gate returns 401 for non-allowlisted proxy paths but 404 remains correct for routes that don't exist at all; the two statuses are orthogonal and both checked in the suite.
