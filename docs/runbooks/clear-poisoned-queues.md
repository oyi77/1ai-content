# Runbook: Clear Poisoned Queues

**Symptoms:** a queue's `failed` count grows while `completed` stalls; the worker retries the same job over and over; `/health/queue` shows `active` pinned; Redis memory climbing.

A "poisoned" queue is one jammed by a job that always throws (bad payload, provider data that always 500s) — retries + exponential backoff keep it cycling and can starve real jobs.

## 1. Inspect
```bash
curl -s "http://127.0.0.1:3002/health/queue" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
# BullMQ dashboard via Redis:
redis-cli -u "$REDIS_URL" keys "bull:*:failed" | head
```

## 2. Identify the poison job
Look at the failed job's payload + error in the worker logs:
```bash
grep -i "failed\|retry\|exhausted" /var/log/1ai-content.log | tail -30
```
If the same `jobId` fails on every attempt with the same error (e.g. invalid payload shape, provider rejecting one input), it's poison.

## 3. Clear it
- **One job:** remove it from BullMQ (`job.remove()` via the queue, or a small `tsx scripts/...` one-off) and mark the DB row failed with a refund if the user was charged.
- **Whole queue (nuclear):** drain/obliterate only if the queue is unrecoverable — `queue.drain()` removes delayed/waiting jobs; `queue.obliterate()` wipes everything including history. Prefer targeted removal.

## 4. Fix the root cause before re-enabling
- Bad payload → add validation before enqueue (`enqueueVideoGeneration` should reject it, not the worker).
- Provider always-erroring → see [provider-outage.md](provider-outage.md); don't re-enqueue the same input against a down provider.
- Exhausted retries → BullMQ `attempts` + `backoff` are already configured per queue (`src/config/queue.ts`); the stuck job then moves to `failed` and the auto cleanup/refund path handles users.

## 5. Verify
- `/health/queue`: `waiting` drops, `completed` resumes.
- `/health/jobs`: no orphaned `processing` rows for removed jobs.
- Redis memory back to baseline.
