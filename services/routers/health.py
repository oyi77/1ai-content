"""Health check endpoint."""
from datetime import datetime
from fastapi import APIRouter

health_router = APIRouter(tags=["health"])


@health_router.get("/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "1ai-content-factory",
        "timestamp": datetime.now().isoformat(),
    }