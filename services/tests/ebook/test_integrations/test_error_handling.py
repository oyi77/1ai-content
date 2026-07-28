"""Tests for webhook error handling, retry logic, and structured logging."""

import json
from unittest.mock import patch, MagicMock
import pytest
import httpx

from services.ebook.integrations.manager import Integration, IntegrationManager


@pytest.fixture
def mgr(tmp_path):
    config = tmp_path / "integrations.json"
    return IntegrationManager(config_file=config)


@pytest.fixture
def test_integration():
    return Integration(
        id="test_hook",
        name="Test Webhook",
        type="webhook",
        url="http://example.com/hook",
        api_key="secret",
        enabled=True,
        meta={},
    )


def test_network_error_retries_three_times_and_returns_error_status(
    mgr, test_integration
):
    mgr.add(test_integration)

    mock_post = MagicMock(side_effect=httpx.ConnectError("Connection refused"))

    import services.ebook.integrations.manager as _mgr_mod

    with (
        patch.object(httpx, "post", mock_post),
        patch.object(mgr, "_is_circuit_open", return_value=False),
        patch.object(mgr, "_log_attempt") as mock_log,
        patch.object(mgr, "_increment_failures") as mock_increment,
        patch.object(_mgr_mod.logger, "info"),
        patch.object(_mgr_mod.logger, "warning"),
        patch.object(_mgr_mod.logger, "error"),
        patch("time.sleep"),
    ):

        result = mgr._invoke_webhook_sync(
            "test_hook", "ebook.completed", {"project_id": 1}
        )

    assert mock_post.call_count == 3
    assert result["success"] is False
    assert "Network error" in result["error"]
    assert result["retries"] == 3
    assert result["error_type"] == "network_error"
    mock_log.assert_called_once()
    mock_increment.assert_called_once()


def test_timeout_error_retries_and_logs_with_context(mgr, test_integration):
    mgr.add(test_integration)

    mock_post = MagicMock(side_effect=httpx.TimeoutException("Request timeout"))

    import services.ebook.integrations.manager as _mgr_mod

    with (
        patch.object(httpx, "post", mock_post),
        patch.object(mgr, "_is_circuit_open", return_value=False),
        patch.object(mgr, "_log_attempt"),
        patch.object(mgr, "_increment_failures"),
        patch.object(_mgr_mod.logger, "info"),
        patch.object(_mgr_mod.logger, "warning") as mock_warning,
        patch.object(_mgr_mod.logger, "error"),
        patch("time.sleep"),
    ):

        result = mgr._invoke_webhook_sync(
            "test_hook", "ebook.failed", {"error": "timeout"}
        )

    assert mock_post.call_count == 3
    assert result["success"] is False
    assert "timeout" in result["error"].lower()
    assert result["error_type"] == "timeout"

    assert mock_warning.call_count >= 3
    first_warning = mock_warning.call_args_list[0]
    assert first_warning[0][0] == "Webhook timeout"
    assert first_warning[1]["integration_id"] == "test_hook"
    assert first_warning[1]["webhook_url"] == "http://example.com/hook"


def test_http_500_error_retries_and_returns_status(mgr, test_integration):
    mgr.add(test_integration)

    mock_response = MagicMock()
    mock_response.status_code = 500
    mock_error = httpx.HTTPStatusError(
        "Server error", request=MagicMock(), response=mock_response
    )
    mock_post = MagicMock(side_effect=mock_error)

    import services.ebook.integrations.manager as _mgr_mod

    with (
        patch.object(httpx, "post", mock_post),
        patch.object(mgr, "_is_circuit_open", return_value=False),
        patch.object(mgr, "_log_attempt") as mock_log,
        patch.object(mgr, "_increment_failures"),
        patch.object(_mgr_mod.logger, "info"),
        patch.object(_mgr_mod.logger, "warning"),
        patch.object(_mgr_mod.logger, "error"),
        patch("time.sleep"),
    ):

        result = mgr._invoke_webhook_sync("test_hook", "ebook.completed", {})

    assert mock_post.call_count == 3
    assert result["success"] is False
    assert "HTTP 500" in result["error"]
    assert result["error_type"] == "http_error"

    call_args = mock_log.call_args[0]
    assert call_args[2] == "failed"


def test_successful_retry_on_second_attempt_returns_success(mgr, test_integration):
    mgr.add(test_integration)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()

    call_count = 0

    def side_effect(*args, **kwargs):
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise httpx.ConnectError("Connection refused")
        return mock_response

    mock_post = MagicMock(side_effect=side_effect)

    import services.ebook.integrations.manager as _mgr_mod

    with (
        patch.object(httpx, "post", mock_post),
        patch.object(mgr, "_is_circuit_open", return_value=False),
        patch.object(mgr, "_log_attempt") as mock_log,
        patch.object(mgr, "_reset_circuit") as mock_reset,
        patch.object(_mgr_mod.logger, "info"),
        patch.object(_mgr_mod.logger, "warning"),
        patch("time.sleep"),
    ):

        result = mgr._invoke_webhook_sync(
            "test_hook", "ebook.completed", {"project_id": 1}
        )

    assert mock_post.call_count == 2
    assert result["success"] is True
    assert result["status_code"] == 200
    assert result["retries"] == 1
    mock_reset.assert_called_once()

    call_args = mock_log.call_args[0]
    assert call_args[2] == "success"


def test_max_retries_exceeded_returns_error_with_retry_count(mgr, test_integration):
    mgr.add(test_integration)

    mock_post = MagicMock(side_effect=httpx.NetworkError("Network unreachable"))

    import services.ebook.integrations.manager as _mgr_mod

    with (
        patch.object(httpx, "post", mock_post),
        patch.object(mgr, "_is_circuit_open", return_value=False),
        patch.object(mgr, "_log_attempt"),
        patch.object(mgr, "_increment_failures"),
        patch.object(_mgr_mod.logger, "info"),
        patch.object(_mgr_mod.logger, "warning"),
        patch.object(_mgr_mod.logger, "error") as mock_error,
        patch("time.sleep"),
    ):

        result = mgr._invoke_webhook_sync("test_hook", "ebook.completed", {})

    assert result["success"] is False
    assert result["retries"] == 3

    final_error_call = mock_error.call_args_list[-1]
    assert final_error_call[0][0] == "Webhook delivery failed after all retries"
    assert final_error_call[1]["retries"] == 3


def test_exponential_backoff_delays_are_correct(mgr, test_integration):
    mgr.add(test_integration)

    mock_post = MagicMock(side_effect=httpx.ConnectError("Connection refused"))

    import services.ebook.integrations.manager as _mgr_mod

    with (
        patch.object(httpx, "post", mock_post),
        patch.object(mgr, "_is_circuit_open", return_value=False),
        patch.object(mgr, "_log_attempt"),
        patch.object(mgr, "_increment_failures"),
        patch.object(_mgr_mod.logger, "info"),
        patch.object(_mgr_mod.logger, "warning"),
        patch.object(_mgr_mod.logger, "error"),
        patch("time.sleep") as mock_sleep,
    ):

        mgr._invoke_webhook_sync("test_hook", "ebook.completed", {})

    assert mock_sleep.call_count == 2
    assert mock_sleep.call_args_list[0][0][0] == 1
    assert mock_sleep.call_args_list[1][0][0] == 2


def test_first_attempt_success_no_retries(mgr, test_integration):
    mgr.add(test_integration)

    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.raise_for_status = MagicMock()
    mock_post = MagicMock(return_value=mock_response)

    import services.ebook.integrations.manager as _mgr_mod

    with (
        patch.object(httpx, "post", mock_post),
        patch.object(mgr, "_is_circuit_open", return_value=False),
        patch.object(mgr, "_log_attempt"),
        patch.object(mgr, "_reset_circuit"),
        patch.object(_mgr_mod.logger, "info"),
        patch("time.sleep") as mock_sleep,
    ):

        result = mgr._invoke_webhook_sync("test_hook", "ebook.completed", {})

    assert mock_post.call_count == 1
    assert result["success"] is True
    assert result["retries"] == 0
    mock_sleep.assert_not_called()


def test_unknown_exception_type_logged_as_unexpected_error(mgr, test_integration):
    mgr.add(test_integration)

    mock_post = MagicMock(side_effect=ValueError("Unexpected error"))

    import services.ebook.integrations.manager as _mgr_mod

    with (
        patch.object(httpx, "post", mock_post),
        patch.object(mgr, "_is_circuit_open", return_value=False),
        patch.object(mgr, "_log_attempt"),
        patch.object(mgr, "_increment_failures"),
        patch.object(_mgr_mod.logger, "info"),
        patch.object(_mgr_mod.logger, "warning"),
        patch.object(_mgr_mod.logger, "error") as mock_error,
        patch("time.sleep"),
    ):

        result = mgr._invoke_webhook_sync("test_hook", "ebook.completed", {})

    assert result["success"] is False
    assert result["error_type"] == "unknown_error"
    assert "Unexpected error" in result["error"]

    error_calls = [
        call
        for call in mock_error.call_args_list
        if call[0][0] == "Webhook unexpected error"
    ]
    assert len(error_calls) == 3
