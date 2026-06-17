"""Background job tracker using file-based state for cross-session persistence."""

import json
import threading
from pathlib import Path

JOBS_DIR = Path("data/jobs")
JOBS_DIR.mkdir(parents=True, exist_ok=True)

# Semaphore to limit concurrent AI calls (prevent overwhelming OmniRoute)
_ai_semaphore = threading.Semaphore(2)  # Max 2 concurrent AI calls


def _job_file(project_id: int) -> Path:
    return JOBS_DIR / f"{project_id}.json"


def get_job_status(project_id: int) -> dict:
    f = _job_file(project_id)
    if f.exists():
        with open(f) as fh:
            return json.load(fh)
    return {"progress": 0, "message": "", "status": "idle", "error": None}


def update_job_status(project_id: int, **kwargs):
    status = get_job_status(project_id)
    status.update(kwargs)
    with open(_job_file(project_id), "w") as f:
        json.dump(status, f)


def clear_job(project_id: int):
    f = _job_file(project_id)
    if f.exists():
        f.unlink()


def get_all_active_jobs() -> dict:
    """Return {project_id: status} for all running jobs."""
    active = {}
    for f in JOBS_DIR.glob("*.json"):
        pid = int(f.stem)
        status = get_job_status(pid)
        if status.get("status") == "running":
            active[pid] = status
    return active


def run_pipeline_bg(project_id: int, db_path_str: str, projects_dir_str: str):
    """Run pipeline in background thread with file-based status updates."""
    from src.pipeline.orchestrator import PipelineOrchestrator

    update_job_status(
        project_id, progress=0, message="Starting...", status="running", error=None
    )

    try:
        orchestrator = PipelineOrchestrator(
            db_path=db_path_str, projects_dir=projects_dir_str
        )

        # Get starting progress
        prog = orchestrator._check_progress(project_id)
        completed = prog["completed_chapters"]
        steps_done = sum(
            [
                prog["strategy"],
                prog["outline"],
                bool(completed > 0),
                prog["cover"],
                prog["qa"],
                prog["export"],
            ]
        )
        start_pct = int((steps_done / 6) * 100)
        update_job_status(project_id, progress=start_pct, message="Resuming...")

        def on_progress(pct, msg):
            update_job_status(project_id, progress=pct, message=msg, status="running")

        # Use semaphore to limit concurrent AI calls
        with _ai_semaphore:
            result = orchestrator.run_full_pipeline(project_id, on_progress=on_progress)

        update_job_status(
            project_id,
            progress=100,
            message="Complete!",
            status="completed",
            error=None,
            docx=str(result["exports"]["docx"]),
            pdf=str(result["exports"]["pdf"]),
        )
    except Exception as e:
        update_job_status(
            project_id,
            progress=0,
            message=f"Failed: {e}",
            status="failed",
            error=str(e),
        )


def start_resume(project_id: int, db_path_str: str, projects_dir_str: str):
    """Start or resume a project in background thread."""
    current = get_job_status(project_id)
    if current.get("status") == "running":
        return  # Already running

    thread = threading.Thread(
        target=run_pipeline_bg,
        args=(project_id, db_path_str, projects_dir_str),
        daemon=True,
    )
    thread.start()
