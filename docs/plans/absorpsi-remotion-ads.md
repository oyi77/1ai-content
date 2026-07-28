# Absorption Plan: `remotion-ads/` → 1ai-content Monorepo

**Status**: Plan — not yet approved.

---

## Current State

### What exists at `remotion-ads/`

| Component | File | Lines | Purpose |
|-----------|------|-------|---------|
| Entry point | `remotion-ads/src/index.tsx` | ~10 | `registerRoot()` — Remotion bootstrap |
| Composition registry | `remotion-ads/src/Root.tsx` | ~20 | Registers `ProductAd` + short hook variant |
| Main composition | `remotion-ads/src/ProductAd.tsx` | ~180 | 3-scene video ad (9:16, 1080×1920), category gradients |
| Ad copy generator | `remotion-ads/src/adCopy.ts` | ~60 | Category-specific product copy (6 categories: electronics, fashion, home, beauty, sports, food) |
| CLI renderer | `remotion-ads/src/render.ts` | ~100 | CLI + programmatic render, image download, bundling, H.264 MP4 output |
| Config | `remotion-ads/package.json` | — | Remotion deps (`remotion`, `@remotion/cli`, `@remotion/renderer`, `@remotion/player`) |
| Config | `remotion-ads/tsconfig.json` | — | TypeScript config for Remotion |
| Meta | `remotion-ads/README.md` | — | Project description |
| **Missing** | `.gitignore` | — | Not present — `node_modules/`, `out/`, bundles not ignored |
| Missing | Tests | — | None |

### What the monorepo already has

| Component | File | Detail |
|-----------|------|--------|
| Python wrapper | `services/remotion/__init__.py` | Async subprocess wrapper calling Remotion CLI |
| Router | `services/routers/remotion.py` | `POST /content/render-ad` with `RenderAdRequest` Pydantic model |
| Registration | `services/api.py` lines 831, 851 | `app.include_router(remotion_router)` with prefix `""` and tag `"remotion"` |
| Frontend | `src/pages/admin/Tools/RenderAd.tsx` | React component calling the render-ad endpoint |

### Known issues

1. **Hardcoded REMOTION_DIR path** (`services/remotion/__init__.py` line 14): `Path(__file__).parent.parent.parent / "remotion-ads"` — fragile relative path that breaks if service layout changes
2. **Duplicated Remotion deps**: Root `package.json` may have `remotion` / `@remotion/*` entries that duplicate `remotion-ads/package.json`
3. **Frontend-backend schema mismatch** in `RenderAd.tsx` — independently reportable bug
4. **No Python tests** for `services/remotion/__init__.py`
5. **No `.gitignore`** in `remotion-ads/`

---

## Plan

### Step 1. Fix REMOTION_DIR path

**File**: `services/remotion/__init__.py` (read current content first)

**Current approach**: `Path(__file__).parent.parent.parent / "remotion-ads"`

**Target approach**: Make it stable regardless of where `__init__.py` lives. Two options:

**Option A** (recommended): Use a project-relative path based on a configurable env var with a fixed default:
```python
REMOTION_DIR = Path(os.environ.get("REMOTION_ADS_DIR", default_path))
```
Where `default_path` resolves to the `remotion-ads/` dir relative to the monorepo root.

**Option B**: Move `remotion-ads/` source into `services/remotion-ads/` and use `Path(__file__).parent / "remotion-ads"`. This makes the path self-contained but moves the source code.

**Decision needed**: Which option?

**Verification**: After fix, run `python3 -c "from services.remotion import REMOTION_DIR; print(REMOTION_DIR.exists())"` from the monorepo root. Must print `True`.

### Step 2. Remove duplicated Remotion deps from root `package.json`

**Check**: Grep root `package.json` for `remotion`:
```bash
python3 -c "import json; d=json.load(open('package.json')); [print(k) for k in d.get('dependencies',{}) if 'remotion' in k.lower()]"
```

**If found**: Remove each entry from `dependencies`. The deps live in `remotion-ads/package.json` — that's where `npm install` runs for Remotion.

**Verification**: `npm ls 2>&1 | grep remotion` — should show unmet peer dep warnings only from within `remotion-ads/`, not from root.

### Step 3. Add `.gitignore` to `remotion-ads/`

**File**: `remotion-ads/.gitignore`
```
node_modules/
out/
bundles/
*.mp4
.cache/
```

**Verification**: `cd remotion-ads && git status --short` should not show any `node_modules/` or `out/` files.

### Step 4. Remove satellite metadata

**Files to delete**:
- `remotion-ads/README.md` — project description; superseded by monorepo context
- `remotion-ads/package.json` — **DO NOT DELETE** (used by Remotion CLI at runtime)
- `remotion-ads/tsconfig.json` — **DO NOT DELETE** (used by Remotion at runtime)

Only `README.md` is safe to remove. The other config files are runtime-required by `npx remotion render`.

### Step 5. Add Python tests for `services/remotion/__init__.py`

**New file**: `services/tests/test_remotion.py`

**What to test** (the wrapper is thin, so tests are focused):
1. `REMOTION_DIR` resolves to an existing directory
2. `REMOTION_DIR / "package.json"` exists (basic integrity check)
3. `remotion_bin()` returns an executable path (for `"bun"` / `"npx"` installations)
4. `RenderAdRequest` Pydantic model validates correctly

**Important**: Don't actually run `npx remotion render` in tests — that's a heavyweight process. Mock `asyncio.create_subprocess_exec`.

**Verification**: `cd services && python3 -m pytest tests/test_remotion.py -v`

### Step 6. Fix frontend-backend schema mismatch (independent bug)

**Found in summary**: `RenderAd.tsx` sends fields that don't match `RenderAdRequest` Pydantic model in `services/routers/remotion.py`.

**Action**: This is a separate bug-fix issue, not strictly absorption. Document it:
1. Read `services/routers/remotion.py` — get exact Pydantic schema
2. Read `RenderAd.tsx` — get exact JS payload shape
3. Compare — fix whichever side is wrong
4. Verify by triggering a real render-ad call

**Verification**: `curl -X POST http://localhost:8767/content/render-ad -H 'Content-Type: application/json' -d '{"..."}'` returns 200 instead of 422.

### Step 7. Verify end-to-end

```bash
# 1. Start from monorepo root
cd /home/openclaw/projects/1ai-content

# 2. Ensure remotion-ads deps installed
cd remotion-ads && npm install && cd ..

# 3. Test Python wrapper imports
cd services && python3 -c "from services.remotion import REMOTION_DIR; print('OK:', REMOTION_DIR.exists())" && cd ..

# 4. Run Python tests
cd services && python3 -m pytest tests/test_remotion.py -v && cd ..

# 5. Start services API
python3 services/run_api.py &
sleep 3

# 6. Test endpoint — use minimal valid request
curl -X POST http://localhost:8767/content/render-ad \
  -H 'Content-Type: application/json' \
  -d '{"productName":"Test Product","category":"food","description":"A test","price":"$9.99","logoUrl":"","imageUrls":[]}'

# 7. Kill test server
kill %1
```

### What this plan DOES NOT do

- Move `remotion-ads/` source files — they stay where they are. The Python wrapper already calls them by path. The only change is making the path stable.
- Add Remotion to the Python process — the wrapper uses subprocess, which is the correct pattern.
- Add frontend tests for `RenderAd.tsx` — that's a separate concern.

---

## Effort estimate

| Step | Time | Risk |
|------|------|------|
| 1. Fix REMOTION_DIR | 10min | Low |
| 2. Remove duplicated deps | 5min | Low (verify root package.json) |
| 3. Add .gitignore | 2min | None |
| 4. Remove README.md | 1min | None |
| 5. Add Python tests | 30min | Low |
| 6. Fix schema mismatch | 30min | Medium (needs coordination with frontend) |
| 7. Verify end-to-end | 15min | — |
| **Total** | **~1.5h** | |

---

## Rollback

If any step breaks, revert the specific file:

| Step | Rollback |
|------|----------|
| 1 | Restore original path calculation in `services/remotion/__init__.py` |
| 2 | Re-add removed entries to root `package.json` |
| 3 | `git rm --cached remotion-ads/.gitignore` |
| 4 | `git checkout HEAD -- remotion-ads/README.md` |
| 5 | `git rm services/tests/test_remotion.py` |
| 6 | `git checkout HEAD -- <file>` (whichever was changed) |
