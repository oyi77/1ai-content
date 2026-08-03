#!/bin/bash
# =============================================================================
# 1AI CONTENT — RESTART BOT SERVICE
# =============================================================================
# Restarts the single PM2 process (1ai-content, port 3002) and verifies it
# comes back online. Usage: ./scripts/restart-all.sh [--no-verify]
# NOTE: the Python media-api (:8767) is systemd-managed — do NOT restart it here.
# =============================================================================

set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

VERIFY=true
[[ "${1:-}" == "--no-verify" ]] && VERIFY=false

log()  { echo -e "${BLUE}[restart]${NC} $1"; }
ok()   { echo -e "${GREEN}[  ok  ]${NC} $1"; }
err()  { echo -e "${RED}[FAIL ]${NC} $1"; }

# ── Ensure pm2 is available ─────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  err "pm2 is not installed or not in PATH"
  exit 1
fi

# ── Restart 1ai-content ──────────────────────────────────────────
log "Restarting 1ai-content..."
if pm2 restart 1ai-content 2>/dev/null; then
  ok "1ai-content restart signaled"
else
  err "1ai-content restart failed (process may not be registered)"
  log "Attempting to start 1ai-content from ecosystem config..."
  pm2 start ecosystem.config.js --only 1ai-content 2>/dev/null || true
fi

# ── Wait for processes to stabilize ─────────────────────────────
log "Waiting 5s for processes to stabilize..."
sleep 5

# ── Verify ──────────────────────────────────────────────────────
if [[ "$VERIFY" == true ]]; then
  echo ""
  log "Verifying process status..."

  ALL_OK=true

  for PROC in 1ai-content; do
    STATUS=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    apps = json.load(sys.stdin)
    for a in apps:
        if a['name'] == '$PROC':
            print(a['pm2_env']['status'])
            break
    else:
        print('not_found')
except:
    print('error')
" 2>/dev/null || echo "error")
    if [[ "$STATUS" == "online" ]]; then
      ok "$PROC is online"
    else
      err "$PROC status: $STATUS"
      ALL_OK=false
    fi
  done

  echo ""
  if [[ "$ALL_OK" == true ]]; then
    log "Restart complete. Saving pm2 process list..."
    pm2 save 2>/dev/null || true
    echo -e "${GREEN}All services restarted successfully.${NC}"
  else
    err "Some services did not come back online. Check logs:"
    echo "  pm2 logs 1ai-content --lines 20"
    exit 1
  fi
else
  log "Skipping verification (--no-verify)"
fi
