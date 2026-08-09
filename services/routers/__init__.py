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
        POST   {prefix}/projects          (create project)
        GET    {prefix}/projects/{id}
        GET    {prefix}/projects/{id}/status
        PUT    {prefix}/projects/{id}     (update project)
        DELETE {prefix}/projects/{id}
        POST   {prefix}/projects/{id}/generate  (start generation)
        POST   {prefix}/projects/{id}/cancel    (cancel generation)

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
    async def list_projects(limit: int = 100, owner: str | None = None):
        return await gen.list(owner=owner)

    @router.post("/projects")
    async def create_project(params: dict, owner: str | None = None):
        return await gen.create(params, owner=owner)

    @router.get("/projects/{project_id}")
    async def get_project(project_id: str, owner: str | None = None):
        return await gen.get(project_id, owner=owner)

    @router.get("/projects/{project_id}/status")
    async def get_status(project_id: str, owner: str | None = None):
        return await gen.status(project_id, owner=owner)

    @router.delete("/projects/{project_id}")
    async def delete_project(project_id: str, owner: str | None = None):
        ok = await gen.delete(project_id, owner=owner)
        if not ok:
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Project not found")
        return {"deleted": project_id}

    @router.post("/projects/{project_id}/generate")
    async def generate(project_id: str, owner: str | None = None):
        return await gen.generate(project_id, owner=owner)

    @router.put("/projects/{project_id}")
    async def update_project(project_id: str, params: dict, owner: str | None = None):
        return await gen.update(project_id, params, owner=owner)

    @router.post("/projects/{project_id}/cancel")
    async def cancel_generation(project_id: str, owner: str | None = None):
        return await gen.cancel(project_id, owner=owner)

    # ── Extra generator-specific routes ────────────────────────────
    for method, path, handler in generator.extra_routes():
        router.add_api_route(path, handler, methods=[method])

    app.include_router(router)