"""MCP server for AI Ebook Generator — raw stdio JSON-RPC 2.0, no SDK required."""

from __future__ import annotations

import json
import os
import sys
import threading
import traceback
from pathlib import Path

# ---------------------------------------------------------------------------
# Path setup — ensure project root is importable
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

os.chdir(PROJECT_ROOT)

DB_PATH = PROJECT_ROOT / "data" / "ebook_generator.db"
PROJECTS_DIR = PROJECT_ROOT / "projects"

# ---------------------------------------------------------------------------
# Lazy imports from project modules
# ---------------------------------------------------------------------------


def _get_repo():
    from services.ebook.db.repository import ProjectRepository

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    return ProjectRepository(DB_PATH)


# In-process progress store shared with generate thread
_generation_progress: dict[int, dict] = {}
_progress_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Tool implementations
# ---------------------------------------------------------------------------


def tool_list_projects(limit: int = 20) -> dict:
    repo = _get_repo()
    projects = repo.list_projects(limit=limit)
    return {"projects": projects, "count": len(projects)}


def tool_create_project(
    title: str,
    idea: str,
    product_mode: str = "lead_magnet",
    target_language: str = "en",
    chapter_count: int = 5,
) -> dict:
    repo = _get_repo()
    project_id = repo.create_project(
        title=title,
        idea=idea,
        product_mode=product_mode,
        target_language=target_language,
        chapter_count=chapter_count,
    )
    project = repo.get_project(project_id)
    return project


def tool_generate(project_id: int) -> dict:
    repo = _get_repo()
    project = repo.get_project(project_id)
    if project is None:
        return {"error": f"Project {project_id} not found"}

    with _progress_lock:
        current = _generation_progress.get(project_id, {})
        if current.get("status") == "running":
            return {"project_id": project_id, "message": "Generation already running"}

        _generation_progress[project_id] = {
            "status": "running",
            "progress": 0,
            "message": "Starting...",
        }

    def _run():
        try:
            from services.ebook.pipeline.orchestrator import PipelineOrchestrator

            orchestrator = PipelineOrchestrator(
                db_path=str(DB_PATH),
                projects_dir=str(PROJECTS_DIR),
            )

            def on_progress(pct: int, msg: str):
                with _progress_lock:
                    _generation_progress[project_id] = {
                        "status": "running",
                        "progress": pct,
                        "message": msg,
                    }

            orchestrator.run_full_pipeline(project_id, on_progress=on_progress)
            with _progress_lock:
                _generation_progress[project_id] = {
                    "status": "completed",
                    "progress": 100,
                    "message": "Complete!",
                }
        except Exception as exc:
            with _progress_lock:
                _generation_progress[project_id] = {
                    "status": "failed",
                    "progress": 0,
                    "message": str(exc),
                }

    thread = threading.Thread(target=_run, daemon=True)
    thread.start()
    return {"project_id": project_id, "message": "Generation started"}


def tool_get_status(project_id: int) -> dict:
    repo = _get_repo()
    project = repo.get_project(project_id)
    if project is None:
        return {"error": f"Project {project_id} not found"}

    with _progress_lock:
        progress = _generation_progress.get(
            project_id,
            {"status": project["status"], "progress": 0, "message": ""},
        )
    return {"project_id": project_id, "db_status": project["status"], **progress}


def tool_get_export_info(project_id: int) -> dict:
    import base64

    repo = _get_repo()
    project = repo.get_project(project_id)
    if project is None:
        return {"error": f"Project {project_id} not found"}

    project_dir = PROJECTS_DIR / str(project_id)

    strategy: dict = {}
    strategy_file = project_dir / "strategy.json"
    if strategy_file.exists():
        with open(strategy_file) as f:
            strategy = json.load(f)

    marketing_kit: dict = {}
    mk_file = project_dir / "marketing_kit.json"
    if mk_file.exists():
        with open(mk_file) as f:
            marketing_kit = json.load(f)

    cover_image_b64 = ""
    cover_file = project_dir / "cover" / "cover.png"
    if cover_file.exists():
        with open(cover_file, "rb") as f:
            cover_image_b64 = base64.b64encode(f.read()).decode("utf-8")

    word_count = 0
    manuscript_json = project_dir / "manuscript.json"
    if manuscript_json.exists():
        with open(manuscript_json) as f:
            mdata = json.load(f)
        word_count = sum(ch.get("word_count", 0) for ch in mdata.get("chapters", []))

    description = marketing_kit.get("book_description") or strategy.get("goal") or ""

    return {
        "project_id": project_id,
        "title": project.get("title", ""),
        "description": description,
        "audience": strategy.get("audience", ""),
        "tone": strategy.get("tone", ""),
        "keywords": marketing_kit.get("keywords", []),
        "ad_hooks": marketing_kit.get("ad_hooks", []),
        "suggested_price": marketing_kit.get("suggested_price", "$9.99"),
        "word_count": word_count,
        "cover_image_base64": cover_image_b64,
        "product_mode": project.get("product_mode", ""),
    }


def tool_research_market(
    query: str,
    language: str = "en",
    max_results: int = 10,
) -> dict:
    from services.ebook.research.ebook_reference import search_ebooks

    results = search_ebooks(query=query, language=language, max_results=max_results)
    return {
        "query": query,
        "results": [r.to_dict() for r in results],
        "count": len(results),
    }


def tool_list_files(project_id: int) -> dict:
    project_dir = PROJECTS_DIR / str(project_id)
    if not project_dir.exists():
        return {"error": f"Project directory for id {project_id} not found"}

    files = []
    for path in sorted(project_dir.rglob("*")):
        if path.is_file():
            rel = path.relative_to(project_dir)
            files.append({"path": str(rel), "size_bytes": path.stat().st_size})

    return {"project_id": project_id, "files": files, "count": len(files)}


def tool_read_file(project_id: int, filename: str) -> dict:
    project_dir = PROJECTS_DIR / str(project_id)
    target = (project_dir / filename).resolve()

    # Safety: ensure resolved path stays inside project dir
    try:
        target.relative_to(project_dir.resolve())
    except ValueError:
        return {"error": "Path traversal not allowed"}

    if not target.exists():
        return {"error": f"File not found: {filename}"}

    suffix = target.suffix.lower()
    if suffix in (".md", ".json", ".txt", ".csv", ".html"):
        with open(target, encoding="utf-8", errors="replace") as f:
            content = f.read()
        return {"project_id": project_id, "filename": filename, "content": content}
    else:
        return {
            "error": f"Unsupported file type: {suffix}. Only .md, .json, .txt, .csv, .html are readable."
        }


# ---------------------------------------------------------------------------
# Tool registry
# ---------------------------------------------------------------------------

TOOLS = [
    {
        "name": "ebook_list_projects",
        "description": "List all ebook projects with their status",
        "inputSchema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Max results to return",
                    "default": 20,
                }
            },
        },
    },
    {
        "name": "ebook_create_project",
        "description": "Create a new ebook project",
        "inputSchema": {
            "type": "object",
            "required": ["title", "idea"],
            "properties": {
                "title": {"type": "string", "description": "Ebook title"},
                "idea": {
                    "type": "string",
                    "description": "Core idea / brief description",
                },
                "product_mode": {
                    "type": "string",
                    "enum": [
                        "lead_magnet",
                        "paid_ebook",
                        "bonus_content",
                        "authority",
                        "novel",
                    ],
                    "default": "lead_magnet",
                    "description": "Product mode",
                },
                "target_language": {
                    "type": "string",
                    "default": "en",
                    "description": "BCP-47 language code",
                },
                "chapter_count": {
                    "type": "integer",
                    "default": 5,
                    "description": "Number of chapters",
                },
            },
        },
    },
    {
        "name": "ebook_generate",
        "description": "Start background generation for a project",
        "inputSchema": {
            "type": "object",
            "required": ["project_id"],
            "properties": {
                "project_id": {"type": "integer", "description": "Project ID"}
            },
        },
    },
    {
        "name": "ebook_get_status",
        "description": "Get generation status and progress for a project",
        "inputSchema": {
            "type": "object",
            "required": ["project_id"],
            "properties": {
                "project_id": {"type": "integer", "description": "Project ID"}
            },
        },
    },
    {
        "name": "ebook_get_export_info",
        "description": "Get export metadata: strategy, marketing kit, keywords, ad hooks, pricing, word count",
        "inputSchema": {
            "type": "object",
            "required": ["project_id"],
            "properties": {
                "project_id": {"type": "integer", "description": "Project ID"}
            },
        },
    },
    {
        "name": "ebook_research_market",
        "description": "Search Google Books and Open Library for competing/reference ebooks on a topic",
        "inputSchema": {
            "type": "object",
            "required": ["query"],
            "properties": {
                "query": {"type": "string", "description": "Search keywords"},
                "language": {
                    "type": "string",
                    "default": "en",
                    "description": "BCP-47 language code",
                },
                "max_results": {
                    "type": "integer",
                    "default": 10,
                    "description": "Max results (capped at 40)",
                },
            },
        },
    },
    {
        "name": "ebook_list_files",
        "description": "List all files in a project directory with sizes",
        "inputSchema": {
            "type": "object",
            "required": ["project_id"],
            "properties": {
                "project_id": {"type": "integer", "description": "Project ID"}
            },
        },
    },
    {
        "name": "ebook_read_file",
        "description": "Read the contents of a project file (markdown, JSON, or text)",
        "inputSchema": {
            "type": "object",
            "required": ["project_id", "filename"],
            "properties": {
                "project_id": {"type": "integer", "description": "Project ID"},
                "filename": {
                    "type": "string",
                    "description": "Path relative to project dir, e.g. 'strategy.json' or 'chapters/1.md'",
                },
            },
        },
    },
]

TOOL_DISPATCH = {
    "ebook_list_projects": lambda args: tool_list_projects(limit=args.get("limit", 20)),
    "ebook_create_project": lambda args: tool_create_project(
        title=args["title"],
        idea=args["idea"],
        product_mode=args.get("product_mode", "lead_magnet"),
        target_language=args.get("target_language", "en"),
        chapter_count=args.get("chapter_count", 5),
    ),
    "ebook_generate": lambda args: tool_generate(project_id=args["project_id"]),
    "ebook_get_status": lambda args: tool_get_status(project_id=args["project_id"]),
    "ebook_get_export_info": lambda args: tool_get_export_info(
        project_id=args["project_id"]
    ),
    "ebook_research_market": lambda args: tool_research_market(
        query=args["query"],
        language=args.get("language", "en"),
        max_results=args.get("max_results", 10),
    ),
    "ebook_list_files": lambda args: tool_list_files(project_id=args["project_id"]),
    "ebook_read_file": lambda args: tool_read_file(
        project_id=args["project_id"],
        filename=args["filename"],
    ),
}

# ---------------------------------------------------------------------------
# JSON-RPC 2.0 handler
# ---------------------------------------------------------------------------


def make_response(req_id, result):
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def make_error(req_id, code: int, message: str):
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def handle_request(msg: dict) -> dict | None:
    req_id = msg.get("id")
    method = msg.get("method", "")
    params = msg.get("params") or {}

    if method == "initialize":
        return make_response(
            req_id,
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "ebook-generator", "version": "1.0"},
            },
        )

    if method == "initialized":
        # notification — no response needed
        return None

    if method == "tools/list":
        return make_response(req_id, {"tools": TOOLS})

    if method == "tools/call":
        tool_name = params.get("name", "")
        tool_args = params.get("arguments") or {}

        if tool_name not in TOOL_DISPATCH:
            return make_error(req_id, -32601, f"Unknown tool: {tool_name}")

        try:
            result = TOOL_DISPATCH[tool_name](tool_args)
            return make_response(
                req_id,
                {
                    "content": [
                        {
                            "type": "text",
                            "text": json.dumps(result, ensure_ascii=False, default=str),
                        }
                    ],
                    "isError": "error" in result if isinstance(result, dict) else False,
                },
            )
        except Exception as exc:
            tb = traceback.format_exc()
            sys.stderr.write(f"Tool error [{tool_name}]: {tb}\n")
            sys.stderr.flush()
            return make_error(req_id, -32603, f"Tool execution error: {exc}")

    return make_error(req_id, -32601, f"Method not found: {method}")


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------


def main():
    sys.stderr.write("ebook-generator MCP server started\n")
    sys.stderr.flush()

    for raw_line in sys.stdin:
        raw_line = raw_line.strip()
        if not raw_line:
            continue

        try:
            msg = json.loads(raw_line)
        except json.JSONDecodeError as exc:
            response = make_error(None, -32700, f"Parse error: {exc}")
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
            continue

        try:
            response = handle_request(msg)
        except Exception as exc:
            tb = traceback.format_exc()
            sys.stderr.write(f"Handler error: {tb}\n")
            sys.stderr.flush()
            response = make_error(msg.get("id"), -32603, f"Internal error: {exc}")

        if response is not None:
            sys.stdout.write(
                json.dumps(response, ensure_ascii=False, default=str) + "\n"
            )
            sys.stdout.flush()


if __name__ == "__main__":
    main()
