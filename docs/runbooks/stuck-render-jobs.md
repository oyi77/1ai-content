# Runbook: Stuck Render Jobs (video/ebook jobs not progressing)

**Symptoms:** users report "still processing", `videos` rows stuck in `status='processing'`, `/health/jobs` shows `staleCount > 0`.

## 1. Detect
```bash
TOKEN=$(…from .env…) 
curl -s "http://127.0.0.1:3002/health/jobs?staleAfterMin=10" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```
Each entry: `jobId`, `stage`, `progress`, `lastHeartbeat`, `ageMs`, `stale`, `failureReason`.
- **`lastHeartbeat: null`** → worker never started or Redis lost the key.
- **`lastHeartbeat` old + `stage: "processing"`** → worker died mid-job (or is genuinely slow).
- **`failureReason` set** → job failed but row not updated (crash between error and DB write).

## 2. Auto-resolution (preferred)
The cleanup worker runs daily at 03:00 and marks videos `processing > 30 min` as failed, refunds credits, and notifies the user (`src/workers/cleanup.worker.ts`). If you can wait, this handles it.

## 3. Manual resolution
```bash
# Inspect the specific job
redis-cli -u "$REDIS_URL" get "jobhb:VID-xxxx"
psql "$DATABASE_URL" -c "select job_id,status,progress,created_at from videos where job_id='VID-xxxx';"
```
Then either:
- **Requeue** (worker was down, job is still valid): re-add to the queue with the same `jobId` (dedupe-safe) — restart the service so workers are up first: `sudo systemctl restart 1ai-content`.
- **Fail + refund** (job is truly dead): mark failed and refund via the same path the worker uses (`VideoService.updateStatus` + `UserService.refundCredits`), guarded by the `refund-lock:<jobId>` Redis key so it can't double-refund.

## 4. Prevent recurrence
- Ensure the heartbeat beat points fire: worker start, `updateProgress`, completion, failure.
- Alert when `staleCount` grows (symptom alert, not process-death alert).
- Never delete a video file for a job that is still `processing` (cleanup worker already skips active job IDs).
