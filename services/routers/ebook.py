"""Ebook generator router.

Registered via register_generator_routes() for standard CRUD endpoints,
plus a manual /{project_id}/generate trigger.
"""

from __future__ import annotations

from services.ebook import EbookContentGenerator

# Lazy singleton — import gates on first use so wheel imports don't fail.
_gen: EbookContentGenerator | None = None


def _get() -> EbookContentGenerator:
    global _gen
    if _gen is None:
        _gen = EbookContentGenerator()
    return _gen


async def trigger_generation(project_id: str) -> dict:
    """POST /ebook/projects/{project_id}/generate"""
    from fastapi import HTTPException

    gen = _get()
    try:
        return gen.generate(int(project_id))
    except HTTPException:
        raise
    except Exception as exc:
        return {"project_id": project_id, "error": str(exc)}


async def get_export(project_id: str) -> dict:
    """GET /ebook/projects/{project_id}/export"""
    from fastapi import HTTPException

    gen = _get()
    result = gen.export_data(int(project_id))
    if "error" in result:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


async def get_download(project_id: str, fmt: str):
    """GET /ebook/projects/{project_id}/download/{format}"""
    from fastapi import HTTPException
    from fastapi.responses import FileResponse

    if fmt not in ("docx", "pdf", "epub"):
        raise HTTPException(status_code=400, detail="Unsupported format. Use docx, pdf, or epub.")

    gen = _get()
    file_path = gen.download_path(int(project_id), fmt)
    if file_path is None:
        raise HTTPException(status_code=404, detail=f"File {fmt} not found for project {project_id}")

    media_types = {
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "pdf": "application/pdf",
        "epub": "application/epub+zip",
    }
    return FileResponse(
        path=str(file_path),
        media_type=media_types[fmt],
        filename=f"ebook-{project_id}.{fmt}",
    )

__all__ = ["_get", "trigger_generation", "get_export", "get_download"]