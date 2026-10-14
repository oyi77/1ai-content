# Runbook: Rollback (bad deploy / bad migration)

**Symptoms:** errors spike right after a deploy, `/readyz` degrades, CI green but prod broken, migration changed schema incompatibly.

## 1. Decide scope
- **Code-only regression** → roll back the app.
- **Schema migration** → rolling back code may not be enough; the DB may be in a newer shape. Prefer forward-fix unless the migration was destructive.

## 2. Roll back the app (fast path)
```bash
cd ~/projects/1ai-content
git log --oneline -5                 # identify the last good commit
git revert --no-edit <bad_commit>    # prefer revert over reset on a shared branch
npm ci && npm run build
sudo systemctl restart 1ai-content
curl -s http://127.0.0.1:3002/readyz  # expect 200
```
Graceful shutdown (SIGTERM handler in `src/index.ts`) stops the bot and closes Fastify; the queue/worker restart with the service.

## 3. Roll back a migration
Prisma migrations are forward-only in production. Options:
- **Non-destructive:** write a new forward migration that undoes the change; `npx prisma migrate deploy`.
- **Destructive + restore needed:** stop the app, restore the DB snapshot taken before the deploy — see [restore-from-backup.md](restore-from-backup.md). This loses writes since the snapshot.
Never `prisma migrate reset` in production — it drops the database.

## 4. Verify
- `/livez`, `/readyz`, `/healthz` all green.
- `/health/queue` drains (no runaway failures).
- `/health/jobs` shows no new stale jobs.
- Smoke: send a test message to the bot / hit a public API route.

## 5. Follow-up
File the incident: what deployed, what broke, the revert SHA, and the guard that would have caught it (smoke test, coverage gate, secret scan — all in CI).
