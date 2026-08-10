# Phase 4 — Static Imports for `services/di.py`

**Status**: ✅ COMPLETED (2026-08-10). Option B executed; all verification gates green (see Execution record).

## Execution record (2026-08-10)

Implemented **Option B** — full static conversion in `services/di.py` (242 lines, +2):

- Docstring (l.1-7) rewritten: eager module-load imports for boot-time determinism; getters lazily instantiate and cache singletons.
- `TYPE_CHECKING` block (l.12-37) → 25 module-top static engine imports (l.13-38) with comment `# Static imports — eager module load for boot-time determinism (Phase 4).`
- Getter bodies and `_instances` cache untouched (l.43-241) — 25 getters, `get_storyboard` first, `get_interactive` last. In-function imports in getters remain as harmless `sys.modules` lookups.
- **Step 2 deviation (intentional)**: the 3 in-function `services.di` sites in engines (`services/podcast/engine.py:62,115`; `services/screenrec/engine.py:111`) were left AS-IS. Direct engine-class calls there would bypass the cached `_instances` singletons — a singleton regression. Their lazy comments now serve lazy access, not cycle prevention (no load-time cycle exists: `di.py` imports those engines statically, and the engines only reference `di` at call time).

Verification gates (all green):

| Gate | Result |
|---|---|
| `import services.di` cost | 0.467s real (25 getters) vs 0.082s lazy baseline — +0.385s, within the <1s acceptance bar |
| Import surface | `from services.di import` = 24 files unchanged; `import services.di` = 11 test files unchanged |
| App boot | `services/api.py` assembles → FastAPI, 105 routes (import path replicated from `run_api.py`) |
| Full pytest (`services/`) | **596 passed, 1 skipped** (51.46s; bot-e2e skips cleanly without BOT_TOKEN) |
| Live :8767 (systemd restarted) | `/health` 200; `/audio/speech/voices` 200; `/image/carousel/styles` 200; `/text/ebook/health` 200 — 98 routes registered |

Tradeoff (honest): eager module-load adds ~0.39s to `services.di` import at process start; heavy deps (playwright/moviepy/torch) remain lazy inside the engines themselves.

## Goal

Convert the 25 lazy singleton getters in `services/di.py` from function-body `import` statements to module-top static imports, keeping the singleton `_instances` cache and getter names intact.

## Current state (verified)

- `services/di.py` (240 lines): `TYPE_CHECKING` block (l.12-37), `_instances` cache (l.39), 25 getters (l.42-240). Every getter lazily imports its engine inside the function body, per docstring l.3-6 ("avoid up-front import cost at module load").
- 21 routers import getters at module level from `services.di` — the public consumption pattern.
- 2 engines lazy-import `services.di` **inside functions** with cycle-avoidance comments (`services/podcast/engine.py:62,115`; `services/screenrec/engine.py:111`). These are the only places that would create a load-time cycle if `di.py` imported their modules statically — see Risk 1.
- 11 test files (`services/tests/test_*_api.py`) `import services.di as di` and replace getters with stubs (`_StubFaceless`, `_StubClipper`, …). **Getter names and laziness contract are pinned by these tests.**

## Real tradeoff (read before executing)

Full static conversion moves every engine's import cost (moviepy, playwright, torch-adjacent deps, etc.) from first-request to process start. That means:

- Slower `services/api.py` boot (media-api :8767 startup, every pytest session that imports `api.py`).
- Raise of `services.di` import cost for the 11 test files that already import it.

The documented rationale for the current design is exactly this cost avoidance. Two defensible options:

- **Option A (recommended): keep lazy getters in `di.py`, only convert the module-level router imports to direct engine imports.** This removes the `di` indirection at the call sites that don't need lazy semantics (they import eagerly today anyway) while preserving startup cost for heavy engines.
- **Option B: full static conversion inside `di.py`** — execute the recipe below; acceptable only if boot-time cost is measured and deemed fine (see Verification).

Recipe below is for Option B; Option A is a subset (skip Step 1, do Steps 2-3).

## Recipe

### Step 1. Convert `services/di.py` getters

For each getter, move the import to module top and keep only the cache lookup + instantiation body:

```python
# before
def get_tts() -> TtsService:
    from services.tts import TtsService
    cache_key = "tts"
    if cache_key not in _instances:
        _instances[cache_key] = TtsService()
    return _instances[cache_key]
```

```python
# after
from services.tts import TtsService  # module top, with the other 25 engine imports

def get_tts() -> TtsService:  # body unchanged
    cache_key = "tts"
    if cache_key not in _instances:
        _instances[cache_key] = TtsService()
    return _instances[cache_key]
```

Rules:
- Keep the exact getter names, signatures, and cache-key strings — test contract.
- Keep the `TYPE_CHECKING` block only for types that are not imported at runtime.
- Order static imports to match the getter order for readability.

### Step 2. Convert the 3 in-function engine imports

> **EXECUTED AS DEVIATION (2026-08-10)**: kept as-is, intentionally. Direct engine-class calls in `podcast/engine.py` / `screenrec/engine.py` would bypass the cached `_instances` singletons from `services.di` — a singleton regression. Lazy access via `get_tts`/`get_music` preserved; no load-time cycle exists after Step 1.

Files must not lazy-import `services.di` once `di.py` imports them statically — the lazy call-time import itself is not a cycle, but it is now pointless indirection:

- `services/podcast/engine.py:62` — replace `from services.di import get_tts` with a direct engine import (`from services.tts import ...`) and call directly.
- `services/podcast/engine.py:115` — same for `get_music` → `services.music`.
- `services/screenrec/engine.py:111` — same for `get_tts`.

If the engine needs the singleton semantics, import the engine class and reuse the cache via a module-level singleton in the engine module (do NOT import `di`).

### Step 3. Verify cycle safety

Before merging, prove there are no remaining module-level cycles:

```bash
# every engine that services/di.py now imports statically must NOT import services.di at module level
grep -rn "from services.di import" services/ | grep -v "def "
```

Expected: zero module-level (non-function) `services.di` imports remaining in engine code. The 21 router imports are fine — they are one-directional (router → di).

Then boot the API and run the suite (see Verification).

## Risks

1. **Import cycle at module load** (highest): if any engine statically imports a second engine that `di.py` statically imports, you get a partial-initialization cycle. Step 2 + the grep gate in Step 3 close the known paths; any new cycle appears as `ImportError: cannot import name ... from partially initialized module` at boot — fix by reverting that one import to lazy.
2. **Boot-time cost regression**: heavy engine deps load at process start. Measure `time python3 -c "import services.di"` before (baseline) and after. Acceptable if < ~1s delta; otherwise prefer Option A.
3. **Test breakage**: the 11 `test_*_api.py` files patch `di.get_X` — they keep working as long as the getters exist and are still used by routers. If Option A replaces router imports with direct engine imports, those tests MUST be updated to patch the engine module instead (per-file work; the stub pattern stays).
4. **No behavioral change intended**: the singleton cache is untouched; getter semantics identical.

## Verification

```bash
cd services

# 1. baseline vs after: import cost
time python3 -c "import services.di"

# 2. boot the whole app (catches cycles + registration)
timeout 20 python3 -c "from services.api import app; print(len(app.routes))"

# 3. full pytest (expect same pass count as before; pytest.ini rootdir=services)
python3 -m pytest tests/ -q

# 4. spot-check the two engines that had lazy imports
python3 -c "import services.podcast.engine, services.screenrec.engine"

# 5. live endpoint smoke on :8767 (systemd-managed — restart after deploy)
curl -s http://localhost:8767/health
```

## Rollback

Per-file revert:

- `services/di.py` → `git checkout HEAD -- services/di.py`
- any engine file touched in Step 2 → `git checkout HEAD -- services/podcast/engine.py services/screenrec/engine.py`

No data or schema involved; restart `systemctl restart 1ai-content.service` (media-api :8767 is systemd-managed — do NOT add a PM2/docker manager for it).