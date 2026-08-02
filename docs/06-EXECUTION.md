# 06 — Execution

This document is an intern-readable guide to setting up, running, deploying, and debugging the 1ai-content application end-to-end.

## Prerequisites

- Node.js 20+ (see `.nvmrc`)
- PostgreSQL 15+ (or Docker instance)
- Redis 7+ (for rate limiting, intercept caching)
- Python 3.10+ (for media processing backend on port 8767)
- nginx (via Cloudflare Router for production)
- Cloudflare account (for production deployment)

## Local Development Setup

### 1. Clone & Install

```bash
git clone <repo-url> ~/projects/1ai-content
cd ~/projects/1ai-content

# Install Node dependencies
npm install

# Install SPA dependencies (single admin-ui bundle)
cd admin-ui && npm install && cd ..
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` with these required values:

| Variable | Purpose | Example |
|----------|---------|--------|
| `DATABASE_URL` | PostgreSQL connection | `postgresql://user:pass@localhost:5432/1ai_content` |
| `REDIS_URL` | Redis connection | `redis://localhost:6379` |
| `ADMIN_PASSWORD` | Admin login password | `your-secure-password` |
| `BOT_TOKEN` | Telegram bot token | `123456:ABC-DEF1234` |
| `SESSION_KEY` | Session encryption key (64 hex chars) | `a1b2...64chars` |
| `COOKIE_DOMAIN` | Cookie domain for auth | `localhost` (dev) or `content.aitradepulse.com` (prod) |
| `NODE_ENV` | Environment mode | `development` or `production` |

Optional variables:
| `PORT` | Server port (default: 3002) |
| `PYTHON_API_URL` | Python backend URL (default: `http://localhost:8767`) |
| `SENTRY_DSN` | Error reporting (production only) |

### 3. Database Setup

```bash
# Run Prisma migrations
npx prisma db push

# Verify database state
npx prisma studio    # Opens Prisma Studio at localhost:5555
```

Note: The project uses `prisma db push` (not `prisma migrate`) — there are 0 applied migrations in `_prisma_migrations`. Schema changes are applied directly. If a `prisma/migrations/` directory exists with migration files, they are aspirational and may not reflect the live database.

### 4. Build SPAs

```bash
# Build SPA (single admin-ui bundle)
cd admin-ui && npm run build && cd ..
```

### 5. Start Development Server

```bash
# Option A: Direct start
npm run dev

# Option B: Using tsx directly (watch mode)
npx tsx watch src/index.ts

# Option C: PM2 (persistent)
pm2 start npm --name "1ai-content" -- run dev
```

The server starts on `http://localhost:3002`.

### 6. Start Python Backend (Optional)

For media processing endpoints (video loop, captions, etc.):

```bash
cd services
python3 -m uvicorn api:app --host 0.0.0.0 --port 8767 --reload
```

## Production Deployment

> **CATATAN 2026-08-02 — runtime aktual**: bot TS produksi = **:3002 via PM2 `1ai-content`** (`ecosystem.config.js`, NODE_ENV=production, nginx `app_content.conf` → 127.0.0.1:3002), auto-restart saat reboot via systemd `pm2-openclaw.service` (enabled). Dua blok systemd di bawah ini (### Systemd Service = `src/index.ts`, ### Systemd Bot Service = `src/bot.ts`) **OBSOLETE / TIDAK DIPAKAI** — unit `1ai-content-bot.service` sudah di-`systemctl disable --now` (disabled/inactive); jangan re-create. Satu-satunya unit systemd yang masih aktif untuk repo ini: `1ai-content.service` = media-api Python **:8767** (`services/run_api.py`, Type=simple, User=openclaw, Restart=always, log `/var/log/1ai-content.log`).

### Systemd Service

```bash
# 1ai-content.service
[Unit]
Description=1ai-content Node.js server
After=network.target postgresql.service redis.service

[Service]
Type=simple
User=openclaw
WorkingDirectory=/home/openclaw/projects/1ai-content
EnvironmentFile=/home/openclaw/projects/1ai-content/.env
ExecStart=/usr/bin/npx tsx src/index.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### Systemd Bot Service

```bash
# 1ai-content-bot.service
[Unit]
Description=1ai-content Telegram bot
After=network.target 1ai-content.service
BindsTo=1ai-content.service

[Service]
Type=simple
User=openclaw
WorkingDirectory=/home/openclaw/projects/1ai-content
EnvironmentFile=/home/openclaw/projects/1ai-content/.env
ExecStart=/usr/bin/npx tsx src/bot.ts
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

### nginx Configuration (via Cloudflare Router)

The production site runs behind nginx at `content.aitradepulse.com`. The config lives at:

```
~/.cloudflare-router/nginx/sites/app_content.conf
```

Key location blocks:

```nginx
# Node.js backend
location / {
    proxy_pass http://127.0.0.1:3002;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 300s;
}

# Python API
location /api/py/ {
    proxy_pass http://127.0.0.1:8767/;  # Trailing slash strips /api/py prefix
    proxy_read_timeout 600s;            # Long timeout for AI generation
}
```

To regenerate nginx config:

```bash
export CF_ROUTER_HOME=/home/openclaw/.cloudflare-router
cf-router generate
```

### PM2 for SPAs (When needed)

```bash
# Rebuild admin SPA
cd admin-ui && npm run build

# Restart Node server
pm2 restart 1ai-content

# Verify new build served
curl -s http://localhost:3002/admin/ | grep -o '<title>[^<]*</title>'
```

## Common Debugging Procedures

### 1. Server Won't Start (Port Conflict)

```bash
sudo ss -tlnp | grep 3002    # See what's on port 3002
systemctl --user status 1ai-content   # Check systemd status
journalctl --user -u 1ai-content -n 50  # Recent logs
pm2 list                     # Check PM2
```

### 2. 404 on Admin Routes

- Verify SPA catch-all is inside `adminRoutes()` in `src/routes/admin.ts`
- Check the catch-all route is defined AFTER all API routes
- Check `@fastify/static` root points to correct build dir

```typescript
// src/routes/admin.ts :: adminRoutes()
// SPA catch-all — MUST be inside adminRoutes scope for auth to fire
server.get("/admin/*", async (req, reply) => {
  await reply.sendFile("index.html", rootPath);
});
```

### 3. 401 on Admin Routes (Wrong Cookie)

- Verify `ADMIN_PASSWORD` matches between `.env` and form entry
- Check cookie domain matches (localhost ≠ content.aitradepulse.com)
- Cookie doesn't set `Secure` flag in dev (HTTP-only, no HTTPS localhost)
- Clear browser cookies and re-login

### 4. Python API "Failed to Fetch"

- Verify Python backend running: `curl http://localhost:8767/health`
- Check nginx `proxy_read_timeout` — AI generation takes >60s
- Check browser `fetchWithTimeout` (30s default) — increase or switch to SSE

### 5. SPA Shows Blank Page

- Open browser DevTools → Console for JS errors
- Check Vite base path: must match Fastify route prefix
- Verify `admin-ui/dist/index.html` exists and references correct `/admin/assets/` paths
- Rebuild SPA: `cd admin-ui && npm run build`

### 6. Nginx Config Not Updating

- `CF_ROUTER_HOME` must be set before `cf-router generate`
- Verify `~/.cloudflare-router/nginx/sites/app_content.conf` was regenerated
- Check apps.yaml at `~/.cloudflare-router/apps.yaml`

## Database: Schema vs Code

### Current State

The Prisma schema at `prisma/schema.prisma` is the AUTHORITATIVE representation of the database. Any discrepancy between migration files and the actual database should be resolved by:

```bash
# Apply current schema to database (non-destructive)
npx prisma db push

# Verify schema matches
npx prisma db validate
```

### Schema Changes Workflow

1. Edit `prisma/schema.prisma`
2. Run `npx prisma generate` (regenerates Prisma client types)
3. Run `npx prisma db push` (applies changes to database)
4. Run `npm run test` to verify existing tests still pass
5. Update affected service files

## Rollback Procedures

### Code Rollback

```bash
# Revert to previous commit
git revert HEAD
git push origin master

# Or hard reset (if not pushed)
git reset --hard HEAD~1

# Full rollback to tag
git checkout tags/v1.0.0
```

### Database Rollback

```bash
# Prisma db push is NOT reversible via migration
# To roll back a schema change:
# 1. Revert prisma/schema.prisma to previous state
# 2. Manually craft SQL to undo the change
psql "$DATABASE_URL" -c "ALTER TABLE ..."

# Schema backup before changes:
pg_dump "$DATABASE_URL" --schema-only > schema-backup.sql
```

### nginx Rollback

```bash
export CF_ROUTER_HOME=/home/openclaw/.cloudflare-router
# Auto-backup exists at:
ls ~/.cloudflare-router/nginx/backups/
# Restore from backup:
cp ~/.cloudflare-router/nginx/backups/app_content.conf.<date> \
   ~/.cloudflare-router/nginx/sites/app_content.conf
```

## CI/CD Pipeline

The project uses GitHub Actions for:

- **CI**: Run lint + Jest tests on push/PR
- **Deploy**: Manual trigger for production deployment
  - Build SPAs
  - Restart systemd services
  - Verify health endpoint

## Smoke Test Procedure

After any deployment:

```bash
# 1. Server health
curl http://localhost:3002/health

# 2. Public page
curl -s http://localhost:3002/ | grep -q "Vilona Content"

# 3. Admin login page
curl -s http://localhost:3002/admin/login | grep -q "Admin Login"

# 4. Admin protected (should return 401)
STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/admin/dashboard)
[ "$STATUS" = "401" ] && echo "Auth OK" || echo "Auth FAIL ($STATUS)"

# 5. Admin login + dashboard access
curl -s -c /tmp/cookies.txt -X POST -d "password=$ADMIN_PASSWORD" \
  http://localhost:3002/admin/login
curl -s -b /tmp/cookies.txt http://localhost:3002/admin/dashboard | grep -q "Dashboard"

# 6. Playwright E2E
npx playwright test

echo "Smoke test complete"