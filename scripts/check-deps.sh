#!/bin/bash
# Check-deps: verifies all production dependencies are installed.
# Fails with exit 1 if any are missing — meant for deploy/restart hooks.
#
# Usage: bash scripts/check-deps.sh

set -euo pipefail

PKG_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[check-deps] 1ai-content dependency check"

# ── Content Engine (Python) ────────────────────────────────────────
# Try to find the right python — venv first, then system
if command -v uv &>/dev/null; then
    PY="$(uv python find 2>/dev/null || echo '')"
fi
if [ -z "$PY" ] || [ ! -f "$PY" ]; then
    PY="$(command -v python3)"
fi
echo "  Python: $PY"

ENGINE_DEPS=(
    "httpx"
    "fastapi"
    "uvicorn"
)

for dep in "${ENGINE_DEPS[@]}"; do
    if $PY -c "import $dep" 2>/dev/null; then
        echo "  ✅ $dep"
    else
        echo "  ❌ $dep — MISSING"
        MISSING=1
    fi
done

# yt-dlp is a standalone CLI binary, not a Python module
if command -v yt-dlp &>/dev/null; then
    echo "  ✅ yt-dlp (CLI)"
else
    echo "  ❌ yt-dlp — MISSING"
    MISSING=1
fi

# ── Hub dependencies ───────────────────────────────────────────────
if [ -d "${PKG_DIR}/../1ai-hub" ]; then
    HUB_DEPS=(
        "chromadb"
        "feedparser"
    )
    for dep in "${HUB_DEPS[@]}"; do
        if $PY -c "import $dep" 2>/dev/null; then
            echo "  ✅ $dep"
        else
            echo "  ❌ $dep — MISSING"
            MISSING=1
        fi
    done
    # playwright — binary tool, check separately
    if python3 -c "import playwright" 2>/dev/null; then
        echo "  ✅ playwright"
    else
        echo "  ❌ playwright — MISSING"
        MISSING=1
    fi
fi

if [ -n "${MISSING:-}" ]; then
    echo "[check-deps] ❌ Some dependencies missing. Run: uv pip install -r requirements.txt"
    exit 1
fi

echo "[check-deps] ✅ All dependencies satisfied"