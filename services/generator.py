"""
1AI-Content Generator Protocol — uniform interface for ALL content generators.

Any new content type (audio, video, animation, comics, etc.) can be absorbed
by implementing `ContentGenerator` and registering via the router factory.

Current implementations:
- services/ebook.generator.EbookContentGenerator — AI ebook generation pipeline
- services/remotion — Remotion video ads (via subprocess, not direct generator)
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any
from fastapi import APIRouter, FastAPI


@dataclass
class GeneratorInfo:
    """Metadata about a content generator."""

    name: str
    description: str
    version: str = "1.0"
    capabilities: list[str] = field(default_factory=list)


class ContentGenerator(ABC):
    """Base interface for all content generators in 1ai-content.

    Implementations MUST be async-safe since they're called by FastAPI routes.

    Example:
        class AudioContentGenerator(ContentGenerator):
            @property
            def info(self) -> GeneratorInfo:
                return GeneratorInfo(
                    name="audio",
                    description="AI audio/book narration generation",
                    capabilities=["tts", "music", "voiceover"],
                )

            async def create(self, params: dict) -> dict:
                project_id = await self._pipeline.start(params)
                return {"project_id": project_id}

            async def status(self, project_id: str) -> dict:
                return await self._tracker.get_status(project_id)
    """

    @property
    @abstractmethod
    def info(self) -> GeneratorInfo:
        """Return generator metadata."""
        ...

    # ── Lifecycle ───────────────────────────────────────────────

    @abstractmethod
    async def create(self, params: dict) -> dict:
        """Start a new generation project.

        Args:
            params: Project parameters (e.g. topic, language, style).

        Returns:
            Dict with at minimum {"project_id": str}.
        """
        ...

    @abstractmethod
    async def status(self, project_id: str) -> dict:
        """Get generation status for a project.

        Returns:
            Dict with at minimum {"status": str, "progress": float}.
        """
        ...

    # ── Read ────────────────────────────────────────────────────

    @abstractmethod
    async def get(self, project_id: str) -> dict:
        """Get full project details."""
        ...

    @abstractmethod
    async def list(self) -> list[dict]:
        """List all projects."""
        ...

    # ── Mutate ──────────────────────────────────────────────────

    @abstractmethod
    async def delete(self, project_id: str) -> bool:
        """Delete a project and any generated artifacts."""
        ...

    # ── Meta ────────────────────────────────────────────────────

    @abstractmethod
    async def health(self) -> dict:
        """Return generator health check.

        Returns:
            Dict with at minimum {"status": "ok" | "degraded" | "down"}.
        """
        ...


    # ── Generation trigger ────────────────────────────────────────

    @abstractmethod
    async def generate(self, project_id: str) -> dict:
        """Start content generation for a project.

        Separates project creation (create) from actual content production.
        The caller must have created the project via create() first.
        """
        ...

    # ── Lifecycle mutations ──────────────────────────────────────

    @abstractmethod
    async def update(self, project_id: str, params: dict) -> dict:
        """Update project parameters (title, config, etc.).

        Returns updated project details.
        """
        ...

    @abstractmethod
    async def cancel(self, project_id: str) -> dict:
        """Cancel an in-progress generation.

        Returns the final state of the cancelled project.
        """
        ...

    # ── Extra generator-specific routes ─────────────────────────

    def extra_routes(self) -> list[tuple[str, str, Any]]:
        """Return extra route definitions beyond core CRUD.

        Each tuple: (http_method, path, handler_function).
        Path is relative to the generator's route prefix.
        Default returns nothing — override to add custom endpoints
        (e.g. trigger, export, download).

        Handler functions receive path/query parameters from the
        request and must be async (or regular def — FastAPI handles both).
        """
        return []


async def health_all(generators: list[ContentGenerator]) -> dict[str, Any]:
    """Aggregate health from all registered generators."""
    results: dict[str, Any] = {"status": "ok", "generators": {}}
    for gen in generators:
        try:
            h = await gen.health()
            results["generators"][gen.info.name] = h
            if h.get("status") != "ok":
                results["status"] = "degraded"
        except Exception as e:
            results["generators"][gen.info.name] = {"status": "down", "error": str(e)}
            results["status"] = "degraded"
    return results


class GeneratorRegistry:
    """Registry for plain routers + ContentGenerator instances.

    Collects routers and generator registrations, then wires them
    all into a FastAPI app in one call via ``.wire(app)``.
    """

    def __init__(self) -> None:
        self._routers: list[APIRouter] = []
        self._generator_registrations: list[tuple[ContentGenerator, str, list[str]]] = []

    def add_router(self, router: APIRouter) -> None:
        """Register a plain router to be included on wire()."""
        self._routers.append(router)

    def register(
        self,
        generator: ContentGenerator,
        *,
        prefix: str = "",
        tags: list[str] | None = None,
    ) -> None:
        """Register a ContentGenerator (CRUD + extra routes).

        Args:
            generator: ContentGenerator implementation.
            prefix: URL prefix (e.g. "/ebook").
            tags: OpenAPI tags; defaults to generator info name.
        """
        self._generator_registrations.append(
            (generator, prefix, tags or [generator.info.name])
        )

    def wire(self, app: FastAPI) -> None:
        """Include all routers and register all generators on *app*."""
        from services.routers import register_generator_routes

        for r in self._routers:
            app.include_router(r)
        for gen, prefix, tags in self._generator_registrations:
            register_generator_routes(app, gen, prefix=prefix, tags=tags)