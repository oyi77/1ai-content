"""Faceless routes — faceless content generation (placeholder).

No /faceless/* routes currently exist. The faceless engine is used internally
by the trending generate endpoint.
"""
from fastapi import APIRouter

faceless_router = APIRouter(prefix="", tags=["faceless"])