# Runbook: Database Outage (PostgreSQL / Prisma)

**Symptoms:** `/readyz` returns 503, `/health/db` unhealthy, Prisma connection errors in logs, bot/API errors on any data path.

## 1. Confirm
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/readyz   # 503 expected
TOKEN=$(…same as README runbooks…) && curl -s "http://127.0.0.1:3002/health/db" -H "Authorization: Bearer $TOKEN"
sudo systemctl status postgresql   # or the platform-postgres container
tail -50 /var/log/1ai-content.log | grep -i prisma
```

## 2. Mitigate by cause
- **Postgres down/restarting:** start it (`sudo systemctl start postgresql`). The app's Prisma client retries; no app restart needed if outage < a few minutes.
- **Connection pool exhausted:** check `SELECT count(*) FROM pg_stat_activity;`. Restart the app to dump pools: `sudo systemctl restart 1ai-content` (graceful — SIGTERM handler stops bot, closes Fastify).
- **Disk full:** `df -h`; vacuum/WAL growth. Free space or extend volume; Postgres may refuse writes when full.
- **Bad migration:** see [rollback.md](rollback.md).

## 3. Data integrity on recovery
- Payments: pending transactions older than 2h are auto-failed by the cleanup worker; gateway webhooks that retried during the outage should have re-delivered — verify recent Payment records vs gateway dashboard.
- Video jobs: workers that died mid-job leave `processing` rows with no heartbeat — `GET /health/jobs` lists them; see [stuck-render-jobs.md](stuck-render-jobs.md) for refund/resolve.

## 4. Escalate
If DB stays down > 15 min or data loss is suspected, page the owner and prepare restore: [restore-from-backup.md](restore-from-backup.md).
