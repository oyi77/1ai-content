"""Tests for IntegrationManager — add, list, webhook dispatch, circuit breaker, log attempt."""

import hmac
import hashlib
import json
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest

from services.ebook.integrations.manager import Integration, IntegrationManager

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_integration(**kwargs) -> Integration:
    defaults = dict(
        id="hook1",
        name="Test Hook",
        type="webhook",
        url="http://example.com/hook",
        api_key="s3cr3t",
        enabled=True,
        meta={},
    )
    defaults.update(kwargs)
    return Integration(**defaults)


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def mgr(tmp_path):
    config = tmp_path / "integrations.json"
    return IntegrationManager(config_file=config)


# ---------------------------------------------------------------------------
# add / list
# ---------------------------------------------------------------------------


def test_add_integration_stores_entry(mgr):
    ig = _make_integration(id="i1", name="Webhook One")
    mgr.add(ig)
    result = mgr.list()
    assert len(result) == 1
    assert result[0].id == "i1"


def test_list_returns_empty_when_no_integrations(mgr):
    assert mgr.list() == []


def test_list_integrations_returns_dicts(mgr):
    ig = _make_integration(id="i2", name="Webhook Two")
    mgr.add(ig)
    dicts = mgr.list_integrations()
    assert isinstance(dicts, list)
    assert dicts[0]["name"] == "Webhook Two"


def test_add_multiple_integrations(mgr):
    mgr.add(_make_integration(id="a", name="Alpha"))
    mgr.add(_make_integration(id="b", name="Beta"))
    assert len(mgr.list()) == 2


# ---------------------------------------------------------------------------
# invoke_webhook — HMAC signature, headers
# ---------------------------------------------------------------------------


def test_invoke_webhook_sends_hmac_signature(mgr):
    """_invoke_webhook_sync must include X-Signature-SHA256 header with sha256= prefix."""
    ig = _make_integration(id="hook1", url="http://ex.com/hook", api_key="mysecret")
    mgr.add(ig)

    payload = {"project_id": 42, "event": "ebook.completed"}
    body = json.dumps(payload, default=str)
    expected_sig = (
        "sha256="
        + hmac.new("mysecret".encode(), body.encode(), hashlib.sha256).hexdigest()
    )

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = MagicMock()

    import httpx as _httpx
    import services.ebook.integrations.manager as _mgr_mod

    with (
        patch.object(_httpx, "post", return_value=mock_resp) as mock_post,
        patch.object(mgr, "_is_circuit_open", return_value=False),
        patch.object(mgr, "_log_attempt"),
        patch.object(mgr, "_reset_circuit"),
        patch.object(_mgr_mod.logger, "info"),
        patch.object(_mgr_mod.logger, "warning"),
    ):
        mgr._invoke_webhook_sync("hook1", "ebook.completed", payload)

    assert mock_post.called
    headers = mock_post.call_args.kwargs.get("headers", {})
    assert headers.get("X-Signature-SHA256") == expected_sig


def test_invoke_webhook_sets_x_event_header(mgr):
    """X-Event header must match the event name passed to _invoke_webhook_sync."""
    ig = _make_integration(id="hook2", url="http://ex.com/hook", api_key="key")
    mgr.add(ig)

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = MagicMock()

    import httpx as _httpx
    import services.ebook.integrations.manager as _mgr_mod

    with (
        patch.object(_httpx, "post", return_value=mock_resp) as mock_post,
        patch.object(mgr, "_is_circuit_open", return_value=False),
        patch.object(mgr, "_log_attempt"),
        patch.object(mgr, "_reset_circuit"),
        patch.object(_mgr_mod.logger, "info"),
        patch.object(_mgr_mod.logger, "warning"),
    ):
        mgr._invoke_webhook_sync("hook2", "project.created", {"x": 1})

    headers = mock_post.call_args.kwargs.get("headers", {})
    assert headers.get("X-Event") == "project.created"


def test_invoke_webhook_sets_content_type_json(mgr):
    """Content-Type must be application/json."""
    ig = _make_integration(id="hook3", url="http://ex.com/hook", api_key="key")
    mgr.add(ig)

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = MagicMock()

    import httpx as _httpx
    import services.ebook.integrations.manager as _mgr_mod

    with (
        patch.object(_httpx, "post", return_value=mock_resp) as mock_post,
        patch.object(mgr, "_is_circuit_open", return_value=False),
        patch.object(mgr, "_log_attempt"),
        patch.object(mgr, "_reset_circuit"),
        patch.object(_mgr_mod.logger, "info"),
        patch.object(_mgr_mod.logger, "warning"),
    ):
        mgr._invoke_webhook_sync("hook3", "some.event", {"a": "b"})

    headers = mock_post.call_args.kwargs.get("headers", {})
    assert headers.get("Content-Type") == "application/json"


# ---------------------------------------------------------------------------
# Circuit breaker — POST skipped when circuit is open
# ---------------------------------------------------------------------------


def test_invoke_webhook_skipped_when_circuit_open(mgr):
    """When _is_circuit_open returns True, httpx.post must NOT be called."""
    ig = _make_integration(id="hook4", url="http://ex.com/hook", api_key="key")
    mgr.add(ig)

    import httpx as _httpx
    import services.ebook.integrations.manager as _mgr_mod

    with (
        patch.object(_httpx, "post") as mock_post,
        patch.object(mgr, "_is_circuit_open", return_value=True),
        patch.object(mgr, "_log_attempt"),
        patch.object(_mgr_mod.logger, "info"),
        patch.object(_mgr_mod.logger, "warning"),
    ):
        mgr._invoke_webhook_sync("hook4", "ebook.failed", {"err": "timeout"})

    mock_post.assert_not_called()


def test_invoke_webhook_logs_skipped_when_circuit_open(mgr):
    """When circuit is open, _log_attempt should record 'skipped'."""
    ig = _make_integration(id="hook5", url="http://ex.com/hook", api_key="key")
    mgr.add(ig)

    import httpx as _httpx
    import services.ebook.integrations.manager as _mgr_mod

    with (
        patch.object(_httpx, "post"),
        patch.object(mgr, "_is_circuit_open", return_value=True),
        patch.object(mgr, "_log_attempt") as mock_log,
        patch.object(_mgr_mod.logger, "info"),
        patch.object(_mgr_mod.logger, "warning"),
    ):
        mgr._invoke_webhook_sync("hook5", "ebook.failed", {})

    mock_log.assert_called_once()
    call = mock_log.mock_calls[0]
    # call.args: (integration_id, event, status, http_status, error)
    assert call.args[2] == "skipped"


# ---------------------------------------------------------------------------
# _log_attempt — does not crash
# ---------------------------------------------------------------------------


def test_log_attempt_does_not_crash_when_db_unavailable(mgr):
    """_log_attempt must silently absorb — no engine means safe no-op."""
    mgr._log_attempt("hook_x", "event.test", "success", 200, None)


def test_log_attempt_does_not_crash_with_error_payload(mgr):
    """_log_attempt with an error string must not raise."""
    mgr._log_attempt("hook_x", "event.fail", "failed", 500, "connection refused")


# ---------------------------------------------------------------------------
# Persistence — config file round-trip
# ---------------------------------------------------------------------------


def test_integrations_persist_to_file(tmp_path):
    """Adding an integration writes it to the config file and reloads correctly."""
    config = tmp_path / "integrations.json"
    mgr1 = IntegrationManager(config_file=config)
    mgr1.add(_make_integration(id="persist1", name="Persisted Hook"))

    # Re-instantiate to load from disk
    mgr2 = IntegrationManager(config_file=config)
    result = mgr2.list()
    assert len(result) == 1
    assert result[0].id == "persist1"
    assert result[0].name == "Persisted Hook"
