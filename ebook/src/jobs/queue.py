import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Optional

from src.db.repository import JobRepository


class JobQueue:
    def __init__(self, db_path: Path | str):
        self.db_path = db_path
        self.job_repo = JobRepository(db_path)
        self._lock = threading.Lock()

    def enqueue(self, project_id: int, step: str) -> int:
        with self._lock:
            job_id = self.job_repo.create_job(project_id, step)
            return job_id

    def dequeue(self) -> Optional[dict]:
        with self._lock:
            import sqlite3

            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM jobs WHERE status = ? ORDER BY created_at ASC LIMIT 1",
                ("pending",),
            )
            row = cursor.fetchone()
            if row:
                job_id = row["id"]
                cursor.execute(
                    "UPDATE jobs SET status = ?, updated_at = ? WHERE id = ?",
                    ("running", datetime.now().isoformat(), job_id),
                )
                conn.commit()
                cursor.execute("SELECT * FROM jobs WHERE id = ?", (job_id,))
                row = cursor.fetchone()
            conn.close()
            return dict(row) if row else None

    def update_status(
        self,
        job_id: int,
        status: str,
        progress: int,
        error_message: Optional[str] = None,
    ) -> None:
        with self._lock:
            self.job_repo.update_job_progress(job_id, status, progress, error_message)

    def get_progress(self, job_id: int) -> dict[str, Any]:
        job = self.job_repo.get_job(job_id)
        if not job:
            return {"status": "not_found", "progress": 0, "step": ""}
        return {
            "status": job["status"],
            "progress": job["progress"],
            "step": job["step"],
            "error_message": job.get("error_message"),
        }


class JobWorker:
    def __init__(self, queue: JobQueue, process_fn: Callable[[dict], Any]):
        self.queue = queue
        self.process_fn = process_fn
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._thread:
            self._thread.join()

    def _run(self):
        while self._running:
            job = self.queue.dequeue()
            if job:
                try:
                    self.process_fn(job)
                    self.queue.update_status(job["id"], "completed", 100)
                except Exception as e:
                    self.queue.update_status(
                        job["id"], "failed", job.get("progress", 0), str(e)
                    )
            else:
                time.sleep(1)
