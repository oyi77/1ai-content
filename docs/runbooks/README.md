# Operations Runbooks — 1ai-content

Short, actionable procedures for on-call. Each runbook assumes:
- App: `1ai-content` Fastify server (prod: `PORT=3002`, loopback), Python media API `:8767`, nginx cf-router `:6969`.
- Logs: `/var/log/1ai-content.log`, `/var/log/1ai-*.log` (journald for systemd units).
- Health: `curl http://127.0.0.1:3002/livez` (process), `/readyz` (DB+Redis), `/healthz` (alias). Diagnostics behind admin token: `/health/db`, `/health/redis`, `/health/queue`, `/health/providers`, `/health/jobs` (stale-job detector), `/metrics`.

| # | Runbook |
|---|---------|
| 1 | [provider-outage.md](provider-outage.md) |
| 2 | [database-outage.md](database-outage.md) |
| 3 | [redis-outage.md](redis-outage.md) |
| 4 | [stuck-render-jobs.md](stuck-render-jobs.md) |
| 5 | [failed-payment-callbacks.md](failed-payment-callbacks.md) |
| 6 | [rollback.md](rollback.md) |
| 7 | [restore-from-backup.md](restore-from-backup.md) |
| 8 | [rotate-secrets.md](rotate-secrets.md) |
| 9 | [clear-poisoned-queues.md](clear-poisoned-queues.md) |
