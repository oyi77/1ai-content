# Runbook: Provider Outage (video/image generation providers)

**Symptoms:** rising provider failure counters, circuit breakers `open` in `/health/providers`, users report generation failures with provider errors, queue `failed` counts growing in `/health/queue`.

## 1. Confirm which provider is down
```bash
TOKEN=$(node -e 'console.log(require("crypto").createHmac("sha256",process.env.ADMIN_PASSWORD).update("openclaw-admin-v1").digest("hex"))')  # from .env
curl -s "http://127.0.0.1:3002/health/providers" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Look for `state: "open"` and failure counts. Cross-check the provider's own status page.

## 2. Verify automatic fallback
The provider router + circuit breaker (`src/services/circuit-breaker.service.ts`, `video-fallback.service.ts`) should already fail over to the next provider in `providerChain`. If jobs are still failing, the chain may have only one healthy provider left.

## 3. Mitigate
- If one provider is down and others are healthy: nothing to do — breaker opens, traffic shifts automatically. Recovery is automatic after `recoveryTimeout` (half-open probe).
- If ALL providers for a modality are down: pause intake to avoid burning retries/credits:
  ```bash
  # Stop draining jobs but keep API + bot alive: set maintenance mode in admin UI,
  # or restart the worker after fixing: sudo systemctl restart 1ai-content
  ```
- Communicate: users get "Video generation failed … Credits refunded" automatically on worker failure. For ETA broadcast, use admin broadcast endpoint.

## 4. After recovery
- Watch `/health/providers` flip `open → half-open → closed`.
- Check `/metrics` for `generation_failure` returning to baseline.
- Stuck jobs: run the stale-job detector — `GET /health/jobs` — and see [stuck-render-jobs.md](stuck-render-jobs.md).
