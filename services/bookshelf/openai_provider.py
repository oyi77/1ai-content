"""OpenAI-compatible API provider — sync and async client singletons.

Uses the local OmniRoute instance for model inference.
Replace with any OpenAI-compatible endpoint by changing base_url and api_key.
"""
import os
from typing import Optional

from openai import OpenAI, AsyncOpenAI


_client: Optional[OpenAI] = None
_async_client: Optional[AsyncOpenAI] = None

OMNIROUTE_BASE_URL = "http://localhost:20128/v1"


def get_groq_client() -> OpenAI:
    """Get or create the global sync OpenAI client singleton (backward-compatible name)."""
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("OMNIROUTE_API_KEY", os.environ.get("GROQ_API_KEY", ""))
    _client = OpenAI(api_key=api_key, base_url=OMNIROUTE_BASE_URL)
    return _client


def get_async_groq_client() -> AsyncOpenAI:
    """Get or create the global async OpenAI client singleton (backward-compatible name)."""
    global _async_client
    if _async_client is not None:
        return _async_client
    api_key = os.environ.get("OMNIROUTE_API_KEY", os.environ.get("GROQ_API_KEY", ""))
    _async_client = AsyncOpenAI(api_key=api_key, base_url=OMNIROUTE_BASE_URL)
    return _async_client


def reset_client():
    """Reset all singletons (e.g. for testing)."""
    global _client, _async_client
    _client = None
    _async_client = None
