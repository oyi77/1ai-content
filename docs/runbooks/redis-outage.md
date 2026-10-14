# Runbook: Redis Outage (cache / BullMQ / rate-limit)

**Symptoms:** `/readyz` 503, `/health/redis` unhealthy, BullMQ job stalls, rate-limit errors, log shows `❌ Redis error` / `🔄 Redis reconnecting`.

## 1. Confirm
```bash
curl -s "http://127.0.0.1:3002/health/redis" -H "Authorization: Bearer $TOKEN"
redis-cli -u "$REDIS_URL" ping     # from .env
```

## 2. Impact while down
- **BullMQ queues** (`video-generation`, `payment-processing`, `notifications`, `billing`, `cleanup`): no new jobs run; enqueued jobs stay in Redis. Jobs do NOT run from Postgres — a long outage means generated work stops, not data loss.
- **Rate limiting / caching**: degraded, may allow more requests than usual.
- **Circuit-breaker state** (`cb:*` keys): unreadable → providers default to allowed; failures won't trip breakers until Redis returns.
- **Job heartbeats** (`jobhb:*`): missing → `/health/jobs` flags everything stale. Ignore stale flags while Redis is down.

## 3. Mitigate
- Restart Redis: `sudo systemctl restart redis` (or the container). ioredis reconnects automatically (retryStrategy in `src/config/redis.ts`).
- If Redis data lost (e.g. empty after restart): in-flight BullMQ jobs and breaker state are gone — that's acceptable. Users with pending video jobs: resolve via [stuck-render-jobs.md](stuck-render-jobs.md).
- If BullMQ workers wedged after recovery: `sudo systemctl restart 1ai-content` re-inits queues/worker.

## 4. After recovery
- Verify `/health/queue` counters move again (enqueue a test via staging flow or wait for real traffic).
- Run `GET /health/jobs` and resolve anything actually stuck.
