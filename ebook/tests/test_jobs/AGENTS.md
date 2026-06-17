<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-04-03 | Updated: 2026-04-03 -->

# tests/test_jobs

## Purpose
Unit tests for `src/jobs/queue.py` — job lifecycle, queue operations, and worker threading.

## Key Files

| File | Description |
|------|-------------|
| `test_queue.py` | Tests for `JobQueue` (enqueue, dequeue, update_status, get_progress) and `JobWorker` (start/stop, process_fn invocation) |

## For AI Agents

### Working In This Directory
- Use `test_db_path` for isolated SQLite state
- `JobWorker` tests should use short-lived workers — call `worker.stop()` in teardown
- Mock `process_fn` to avoid running real pipeline logic

### Common Patterns
- Verify dequeue returns `None` on empty queue
- Verify `get_progress` returns `{"status": "not_found", ...}` for unknown job IDs

<!-- MANUAL: -->
