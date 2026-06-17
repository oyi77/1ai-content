#!/usr/bin/env python3
"""Single-process launcher: FastAPI (port 8765) + Streamlit (port 8501).

Run with: python3 run.py
Systemd: point ExecStart at this file — one service covers both.
"""

import subprocess
import sys
import threading

import uvicorn


def _run_api() -> None:
    uvicorn.run(
        "src.api.server:app",
        host="0.0.0.0",
        port=8765,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    api_thread = threading.Thread(target=_run_api, daemon=True, name="ebook-api")
    api_thread.start()

    # Streamlit runs in the main thread — when it exits, the process exits
    # and systemd restarts both together.
    subprocess.run(
        [
            sys.executable,
            "-m",
            "streamlit",
            "run",
            "app/main.py",
            "--server.port=8501",
            "--server.address=0.0.0.0",
            "--server.headless=true",
        ],
        check=False,
    )
