"""Tests for MCP server tool functions (no real DB, no real files for most tests)."""

import json
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

import src.mcp.server as server

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_project(project_id: int = 1, status: str = "draft") -> dict:
    return {
        "id": project_id,
        "title": "Test Ebook",
        "idea": "How to test software",
        "product_mode": "lead_magnet",
        "target_language": "en",
        "chapter_count": 5,
        "status": status,
    }


def _mock_repo(projects=None):
    repo = MagicMock()
    repo.list_projects.return_value = projects or []
    repo.get_project.return_value = None
    return repo


# ---------------------------------------------------------------------------
# tool_list_projects
# ---------------------------------------------------------------------------


def test_list_projects_returns_project_list():
    """tool_list_projects wraps repo.list_projects and returns projects + count."""
    projects = [_make_project(1), _make_project(2)]
    repo = _mock_repo(projects=projects)

    with patch("src.mcp.server._get_repo", return_value=repo):
        result = server.tool_list_projects(limit=20)

    assert result["count"] == 2
    assert len(result["projects"]) == 2
    repo.list_projects.assert_called_once_with(limit=20)


def test_list_projects_returns_empty_when_no_projects():
    repo = _mock_repo(projects=[])

    with patch("src.mcp.server._get_repo", return_value=repo):
        result = server.tool_list_projects()

    assert result["count"] == 0
    assert result["projects"] == []


def test_list_projects_respects_limit_parameter():
    repo = _mock_repo(projects=[_make_project(1)])

    with patch("src.mcp.server._get_repo", return_value=repo):
        server.tool_list_projects(limit=5)

    repo.list_projects.assert_called_once_with(limit=5)


# ---------------------------------------------------------------------------
# tool_get_status
# ---------------------------------------------------------------------------


def test_get_status_returns_db_status_for_known_project():
    repo = _mock_repo()
    repo.get_project.return_value = _make_project(1, status="completed")

    with (
        patch("src.mcp.server._get_repo", return_value=repo),
        patch.dict(server._generation_progress, {}, clear=True),
    ):
        result = server.tool_get_status(project_id=1)

    assert result["project_id"] == 1
    assert result["db_status"] == "completed"


def test_get_status_returns_error_for_unknown_project():
    repo = _mock_repo()
    repo.get_project.return_value = None

    with patch("src.mcp.server._get_repo", return_value=repo):
        result = server.tool_get_status(project_id=999)

    assert "error" in result
    assert "999" in result["error"]


def test_get_status_includes_in_memory_progress_when_running():
    repo = _mock_repo()
    repo.get_project.return_value = _make_project(1, status="generating")
    progress = {"status": "running", "progress": 50, "message": "Writing chapters..."}

    with (
        patch("src.mcp.server._get_repo", return_value=repo),
        patch.dict(server._generation_progress, {1: progress}, clear=True),
    ):
        result = server.tool_get_status(project_id=1)

    assert result["status"] == "running"
    assert result["progress"] == 50
    assert result["message"] == "Writing chapters..."


# ---------------------------------------------------------------------------
# tool_list_files
# ---------------------------------------------------------------------------


def test_list_files_returns_file_list(tmp_path):
    """tool_list_files lists all files in the project directory."""
    project_dir = tmp_path / "1"
    project_dir.mkdir()
    (project_dir / "strategy.json").write_text('{"audience": "devs"}')
    (project_dir / "toc.md").write_text("# TOC")
    sub = project_dir / "chapters"
    sub.mkdir()
    (sub / "1.md").write_text("Chapter one content")

    with patch("src.mcp.server.PROJECTS_DIR", tmp_path):
        result = server.tool_list_files(project_id=1)

    assert result["count"] == 3
    paths = {f["path"] for f in result["files"]}
    assert "strategy.json" in paths
    assert "toc.md" in paths
    assert str(Path("chapters") / "1.md") in paths


def test_list_files_returns_error_when_project_dir_missing(tmp_path):
    with patch("src.mcp.server.PROJECTS_DIR", tmp_path):
        result = server.tool_list_files(project_id=9999)

    assert "error" in result


def test_list_files_includes_size_bytes(tmp_path):
    project_dir = tmp_path / "2"
    project_dir.mkdir()
    content = "Hello world"
    (project_dir / "readme.txt").write_text(content)

    with patch("src.mcp.server.PROJECTS_DIR", tmp_path):
        result = server.tool_list_files(project_id=2)

    assert result["files"][0]["size_bytes"] == len(content.encode())


# ---------------------------------------------------------------------------
# tool_read_file
# ---------------------------------------------------------------------------


def test_read_file_returns_text_content(tmp_path):
    project_dir = tmp_path / "3"
    project_dir.mkdir()
    (project_dir / "strategy.json").write_text('{"tone": "casual"}')

    with patch("src.mcp.server.PROJECTS_DIR", tmp_path):
        result = server.tool_read_file(project_id=3, filename="strategy.json")

    assert result["content"] == '{"tone": "casual"}'
    assert result["filename"] == "strategy.json"
    assert result["project_id"] == 3


def test_read_file_returns_error_for_missing_file(tmp_path):
    project_dir = tmp_path / "4"
    project_dir.mkdir()

    with patch("src.mcp.server.PROJECTS_DIR", tmp_path):
        result = server.tool_read_file(project_id=4, filename="nonexistent.md")

    assert "error" in result
    assert "nonexistent.md" in result["error"]


def test_read_file_rejects_unsupported_extension(tmp_path):
    project_dir = tmp_path / "5"
    project_dir.mkdir()
    (project_dir / "cover.png").write_bytes(b"\x89PNG\r\n")

    with patch("src.mcp.server.PROJECTS_DIR", tmp_path):
        result = server.tool_read_file(project_id=5, filename="cover.png")

    assert "error" in result
    assert "Unsupported" in result["error"]


def test_read_file_blocks_path_traversal(tmp_path):
    project_dir = tmp_path / "6"
    project_dir.mkdir()

    with patch("src.mcp.server.PROJECTS_DIR", tmp_path):
        result = server.tool_read_file(project_id=6, filename="../7/secret.md")

    assert "error" in result


def test_read_file_reads_markdown(tmp_path):
    project_dir = tmp_path / "7"
    project_dir.mkdir()
    (project_dir / "manuscript.md").write_text("# Chapter 1\nContent here.")

    with patch("src.mcp.server.PROJECTS_DIR", tmp_path):
        result = server.tool_read_file(project_id=7, filename="manuscript.md")

    assert "Chapter 1" in result["content"]


# ---------------------------------------------------------------------------
# handle_request — JSON-RPC dispatch
# ---------------------------------------------------------------------------


def test_handle_request_tools_list_returns_tools():
    msg = {"jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {}}
    response = server.handle_request(msg)
    assert response["result"]["tools"] is not None
    assert any(t["name"] == "ebook_list_projects" for t in response["result"]["tools"])


def test_handle_request_initialize_returns_server_info():
    msg = {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
    response = server.handle_request(msg)
    assert response["result"]["serverInfo"]["name"] == "ebook-generator"


def test_handle_request_unknown_method_returns_error():
    msg = {"jsonrpc": "2.0", "id": 1, "method": "nonexistent/method", "params": {}}
    response = server.handle_request(msg)
    assert "error" in response


def test_handle_request_initialized_notification_returns_none():
    """The 'initialized' notification must return None (no response)."""
    msg = {"jsonrpc": "2.0", "method": "initialized"}
    response = server.handle_request(msg)
    assert response is None


def test_handle_request_unknown_tool_returns_error():
    msg = {
        "jsonrpc": "2.0",
        "id": 2,
        "method": "tools/call",
        "params": {"name": "totally_unknown_tool", "arguments": {}},
    }
    response = server.handle_request(msg)
    assert "error" in response
