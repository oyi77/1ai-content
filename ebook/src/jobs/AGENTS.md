<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# src/jobs

## Purpose
SQLite-backed threaded job queue for running pipeline stages in the background. Decouples the Streamlit UI from long-running generation work.

## Key Files

| File | Description |
|------|-------------|
| `queue.py` | `JobQueue` — enqueue/dequeue/update_status/get_progress with a `threading.Lock` for concurrency safety; `JobWorker` — daemon thread that polls the queue and calls a `process_fn` callback |

## For AI Agents

### Working In This Directory
- `JobQueue` uses `JobRepository` for persistence but also does raw SQL in `dequeue()` to atomically claim a job (read + status update in one locked block)
- `JobWorker` runs as a daemon thread — it stops when the main process exits
- Call `worker.start()` once at app startup; call `worker.stop()` on shutdown

### Testing Requirements
- Use `test_db_path` for an isolated SQLite file
- Test `enqueue` → `dequeue` → `update_status` round-trips without starting a real `JobWorker` thread
- For `JobWorker` tests, use short `time.sleep` polling or mock the `process_fn`

### Common Patterns
- Job steps are plain strings (e.g. `"strategy"`, `"outline"`, `"manuscript"`)
- Progress is 0–100 integer; status is one of `pending | running | completed | failed`
- `get_progress()` returns `{"status": "not_found", ...}` when job ID is unknown

## Dependencies

### Internal
- `src/db/repository.JobRepository`

### External
- `threading`, `time` — stdlib only

<!-- MANUAL: -->
