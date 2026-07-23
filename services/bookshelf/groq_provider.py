"""Groq API provider — sync and async client singletons."""
import os
from typing import Optional

from groq import Groq, AsyncGroq


_client: Optional[Groq] = None
_async_client: Optional[AsyncGroq] = None


def get_groq_client() -> Groq:
    """Get or create the global Groq sync client singleton."""
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("GROQ_API_KEY", "")
    _client = Groq(api_key=api_key)
    return _client


def get_async_groq_client() -> AsyncGroq:
    """Get or create the global Groq async client singleton."""
    global _async_client
    if _async_client is not None:
        return _async_client
    api_key = os.environ.get("GROQ_API_KEY", "")
    _async_client = AsyncGroq(api_key=api_key)
    return _async_client


def reset_client():
    """Reset all singletons (e.g. for testing)."""
    global _client, _async_client
    _client = None
    _async_client = None
