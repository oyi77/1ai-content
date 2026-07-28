"""Router package — domain-split FastAPI routers for content services."""

from __future__ import annotations

from fastapi import APIRouter, FastAPI
from services.generator import ContentGenerator


def register_generator_routes(
    app: FastAPI,
    generator: ContentGenerator,
    *,
    prefix: str = "",
    tags: list[str] | None = None,
) -> None:
    """Register standard CRUD + generate endpoints for any ContentGenerator.

    This creates routes at:
        GET    {prefix}/health
        GET    {prefix}/projects
        POST   {prefix}/projects          (create/generate)
        GET    {prefix}/projects/{id}
        GET    {prefix}/projects/{id}/status
        DELETE {prefix}/projects/{id}

    Args:
        app: FastAPI app to register routes on.
        generator: ContentGenerator implementation.
        prefix: URL prefix (e.g. "/ebook", "/audio").
        tags: OpenAPI tags for generated endpoints.
    """
    router = APIRouter(prefix=prefix, tags=tags or [generator.info.name])
    gen = generator  # local alias for closure capture

    @router.get("/health")
    async def health():
        return await gen.health()

    @router.get("/projects")
    async def list_projects(limit: int = 100):
        return await gen.list()

    @router.post("/projects")
    async def create_project(params: dict):
        return await gen.create(params)

    @router.get("/projects/{project_id}")
    async def get_project(project_id: str):
        return await gen.get(project_id)

    @router.get("/projects/{project_id}/status")
    async def get_status(project_id: str):
        return await gen.status(project_id)

    @router.delete("/projects/{project_id}")
    async def delete_project(project_id: str):
        ok = await gen.delete(project_id)
        if not ok:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Project not found")
        return {"deleted": project_id}

    app.include_router(router)