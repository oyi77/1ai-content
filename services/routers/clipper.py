"""Clipper routes — video clipping/transform endpoints (currently used internally via video reframer).

The services.clipper.reframer module is used by video endpoints directly;
no standalone /clipper/* routes exist yet.
"""
from fastapi import APIRouter

clipper_router = APIRouter(prefix="", tags=["clipper"])
# No standalone clipper endpoints — the Reframer is used internally by video.py