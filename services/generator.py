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