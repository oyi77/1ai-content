import os
import requests
import time
from src.logger import get_logger

logger = get_logger(__name__)

OMNIROUTE_BASE_URL = os.getenv("OMNIROUTE_BASE_URL", "http://localhost:20128/v1")

_last_fetch = 0
_cached_models = []
_CACHE_TTL = 300  # 5 minutes


def get_available_models():
    global _cached_models, _last_fetch
    now = time.time()
    if now - _last_fetch < _CACHE_TTL and _cached_models:
        return _cached_models
    try:
        resp = requests.get(f"{OMNIROUTE_BASE_URL}/models", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            models = [m["id"] for m in data.get("data", [])]
            _cached_models = models
            _last_fetch = now
            return models
    except Exception as e:
        logger.info("Failed to fetch available models, using defaults", error=str(e))
    return ["auto/best-chat", "auto/best-fast", "auto/best-reasoning"]
