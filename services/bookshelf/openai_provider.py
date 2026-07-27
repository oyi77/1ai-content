"""OpenAI-compatible API provider — sync and async client singletons.

Uses the local Ollama instance for model inference by default.
Fallback to OmniRoute via BOOKSHELF_LOCAL_URL env var or LOCAL_LLAMA_BASE_URL.
"""
import os
from typing import Optional

import httpx
from openai import OpenAI, AsyncOpenAI

_local_client: Optional[OpenAI] = None
_async_local_client: Optional[AsyncOpenAI] = None
_omniroute_client: Optional[OpenAI] = None
_async_omniroute_client: Optional[AsyncOpenAI] = None

LOCAL_LLAMA_BASE_URL = "http://localhost:11434/v1"
OMNIROUTE_BASE_URL = "http://localhost:20128/v1"
DEFAULT_TIMEOUT = httpx.Timeout(120.0, connect=15.0)


def _make_sync_http_client() -> httpx.Client:
    return httpx.Client(timeout=DEFAULT_TIMEOUT)


def _make_async_http_client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=DEFAULT_TIMEOUT)


def get_local_client() -> OpenAI:
    """Get or create a sync OpenAI client pointing to the local llama-server."""
    global _local_client
    if _local_client is not None:
        return _local_client
    base_url = os.environ.get("BOOKSHELF_LOCAL_URL", LOCAL_LLAMA_BASE_URL)
    _local_client = OpenAI(api_key="not-needed", base_url=base_url, http_client=_make_sync_http_client())
    return _local_client


def get_async_local_client() -> AsyncOpenAI:
    """Get or create an async OpenAI client pointing to the local llama-server."""
    global _async_local_client
    if _async_local_client is not None:
        return _async_local_client
    base_url = os.environ.get("BOOKSHELF_LOCAL_URL", LOCAL_LLAMA_BASE_URL)
    _async_local_client = AsyncOpenAI(api_key="not-needed", base_url=base_url, http_client=_make_async_http_client())
    return _async_local_client


def get_groq_client() -> OpenAI:
    """Get or create the global sync OpenAI client singleton for OmniRoute."""
    global _omniroute_client
    if _omniroute_client is not None:
        return _omniroute_client
    api_key = os.environ.get("OMNIROUTE_API_KEY", os.environ.get("GROQ_API_KEY", ""))
    _omniroute_client = OpenAI(api_key=api_key, base_url=OMNIROUTE_BASE_URL, http_client=_make_sync_http_client())
    return _omniroute_client


def get_async_groq_client() -> AsyncOpenAI:
    """Get or create the global async OpenAI client singleton for OmniRoute."""
    global _async_omniroute_client
    if _async_omniroute_client is not None:
        return _async_omniroute_client
    api_key = os.environ.get("OMNIROUTE_API_KEY", os.environ.get("GROQ_API_KEY", ""))
    _async_omniroute_client = AsyncOpenAI(api_key=api_key, base_url=OMNIROUTE_BASE_URL, http_client=_make_async_http_client())
    return _async_omniroute_client


def reset_client():
    """Reset all singletons (e.g. for testing)."""
    global _local_client, _async_local_client, _omniroute_client, _async_omniroute_client
    _local_client = None
    _async_local_client = None
    _omniroute_client = None
    _async_omniroute_client = None
