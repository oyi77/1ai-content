import pytest
import json
from src.pipeline.error_classifier import ErrorClassifier
from src.ai_client import PermanentAPIError


def test_classify_permanent_api_error():
    exc = PermanentAPIError("test error")
    msg = ErrorClassifier.classify(exc)
    assert "API key" in msg or "provider" in msg.lower()


def test_classify_timeout():
    exc = TimeoutError("request timed out")
    msg = ErrorClassifier.classify(exc)
    assert "timed out" in msg.lower() or "timeout" in msg.lower()


def test_classify_json_decode_error():
    try:
        json.loads("{invalid}")
    except json.JSONDecodeError as e:
        msg = ErrorClassifier.classify(e)
        assert "malformed" in msg.lower() or "json" in msg.lower()


def test_classify_rate_limit_pattern():
    exc = Exception("rate limit exceeded for this API key")
    msg = ErrorClassifier.classify(exc)
    assert "rate limit" in msg.lower()


def test_classify_unknown_exception():
    exc = RuntimeError("something unexpected")
    msg = ErrorClassifier.classify(exc)
    assert len(msg) > 0


def test_classify_str_known_pattern():
    msg = ErrorClassifier.classify_str("PermanentAPIError: invalid api key")
    assert "API key" in msg or "provider" in msg.lower()


def test_classify_str_unknown():
    msg = ErrorClassifier.classify_str("some random raw error string")
    assert "random" in msg or len(msg) > 0


def test_classify_connection_error():
    exc = ConnectionError("failed to connect")
    msg = ErrorClassifier.classify(exc)
    assert "connect" in msg.lower() or "proxy" in msg.lower()


def test_classify_file_not_found():
    exc = FileNotFoundError("projects/42/outline.json not found")
    msg = ErrorClassifier.classify(exc)
    assert "missing" in msg.lower() or "file" in msg.lower()


def test_classify_quota_pattern():
    exc = Exception("quota exceeded on this account")
    msg = ErrorClassifier.classify(exc)
    assert "quota" in msg.lower()


def test_classify_str_rate_limit():
    msg = ErrorClassifier.classify_str("error: rate limit exceeded")
    assert "rate limit" in msg.lower()


def test_classify_str_returns_original_when_no_match():
    original = "completely unknown error xyz123"
    msg = ErrorClassifier.classify_str(original)
    assert msg == original
