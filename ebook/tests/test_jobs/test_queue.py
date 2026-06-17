import time
import pytest


def test_job_lifecycle(test_db_path):
    from src.jobs.queue import JobQueue

    queue = JobQueue(test_db_path)

    job_id = queue.enqueue(project_id=1, step="strategy")
    progress = queue.get_progress(job_id)
    assert progress["status"] == "pending"
    assert progress["progress"] == 0

    queue.update_status(job_id, "running", 50)
    progress = queue.get_progress(job_id)
    assert progress["status"] == "running"
    assert progress["progress"] == 50

    queue.update_status(job_id, "completed", 100)
    progress = queue.get_progress(job_id)
    assert progress["status"] == "completed"
    assert progress["progress"] == 100


def test_polling_returns_progress(test_db_path):
    from src.jobs.queue import JobQueue

    queue = JobQueue(test_db_path)
    job_id = queue.enqueue(project_id=1, step="Writing chapter 2/5")
    queue.update_status(job_id, "running", 33)
    progress = queue.get_progress(job_id)
    assert progress["status"] == "running"
    assert progress["progress"] == 33
    assert "chapter" in progress["step"]


def test_dequeue_returns_pending_job(test_db_path):
    from src.jobs.queue import JobQueue

    queue = JobQueue(test_db_path)
    job_id = queue.enqueue(project_id=1, step="test")
    job = queue.dequeue()
    assert job is not None
    assert job["status"] == "running"


def test_worker_processes_job(test_db_path):
    from src.jobs.queue import JobQueue, JobWorker

    queue = JobQueue(test_db_path)
    processed = []

    def process_fn(job):
        processed.append(job)
        return "done"

    worker = JobWorker(queue, process_fn)
    job_id = queue.enqueue(project_id=1, step="test")
    worker.start()
    time.sleep(2)
    worker.stop()
    assert len(processed) == 1
