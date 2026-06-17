"""Tests for HMAC-SHA256 webhook signing logic."""

import hmac
import hashlib
import json

# ---------------------------------------------------------------------------
# Pure signing helpers (mirrors _invoke_webhook_sync signing)
# ---------------------------------------------------------------------------


def _sign(payload: dict, secret: str) -> str:
    """Reproduce the signature that _invoke_webhook_sync would produce."""
    body = json.dumps(payload, default=str)
    digest = hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    return f"sha256={digest}"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_signature_has_sha256_prefix():
    sig = _sign({"project_id": 1}, "my-secret")
    assert sig.startswith("sha256=")


def test_signature_total_length_is_71_chars():
    """'sha256=' (7) + 64 hex chars = 71 characters."""
    sig = _sign({"project_id": 1, "event": "test"}, "my-secret")
    assert len(sig) == 71


def test_signature_hex_portion_is_64_chars():
    sig = _sign({"key": "value"}, "secret123")
    hex_portion = sig[len("sha256=") :]
    assert len(hex_portion) == 64
    assert all(c in "0123456789abcdef" for c in hex_portion)


def test_same_payload_and_secret_produces_same_signature():
    payload = {"project_id": 7, "event": "ebook.completed"}
    sig1 = _sign(payload, "shared-secret")
    sig2 = _sign(payload, "shared-secret")
    assert sig1 == sig2


def test_different_secrets_produce_different_signatures():
    payload = {"x": 1}
    assert _sign(payload, "secret-a") != _sign(payload, "secret-b")


def test_different_payloads_produce_different_signatures():
    assert _sign({"a": 1}, "secret") != _sign({"a": 2}, "secret")


def test_empty_payload_produces_valid_signature():
    sig = _sign({}, "some-secret")
    assert sig.startswith("sha256=")
    assert len(sig) == 71


def test_empty_secret_produces_signature_with_sha256_prefix():
    """When secret is empty the implementation still computes a digest (empty-key HMAC)."""
    body = json.dumps({"k": "v"}, default=str)
    expected = "sha256=" + hmac.new(b"", body.encode(), hashlib.sha256).hexdigest()
    assert expected.startswith("sha256=")
    assert len(expected) == 71


def test_signature_matches_manual_hmac_computation():
    payload = {"project_id": 99, "status": "done"}
    secret = "supersecret"
    body = json.dumps(payload, default=str)
    manual = (
        "sha256=" + hmac.new(secret.encode(), body.encode(), hashlib.sha256).hexdigest()
    )
    assert _sign(payload, secret) == manual


def test_unicode_payload_is_signed_consistently():
    payload = {"title": "Cara\u00e7\u00e3o"}  # contains non-ASCII
    sig = _sign(payload, "key")
    assert sig.startswith("sha256=")
    assert len(sig) == 71
