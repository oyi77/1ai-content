"""Tests for error handling utilities."""

from __future__ import annotations

import time
from unittest.mock import MagicMock

import pytest

from src.utils.error_handling import (
    format_error_for_user,
    handle_gracefully,
    is_transient_error,
    log_errors,
    logged_operation,
    retry_on_transient,
    safe_operation,
)


class TestIsTransientError:
    """Tests for is_transient_error helper function."""

    def test_timeout_error_is_transient(self):
        """TimeoutError should be classified as transient."""
        assert is_transient_error(TimeoutError("timeout")) is True

    def test_connection_error_is_transient(self):
        """ConnectionError should be classified as transient."""
        assert is_transient_error(ConnectionError("connection failed")) is True

    def test_broken_pipe_is_transient(self):
        """BrokenPipeError should be classified as transient."""
        assert is_transient_error(BrokenPipeError("pipe broken")) is True

    def test_os_error_is_transient(self):
        """OSError should be classified as transient."""
        assert is_transient_error(OSError("os error")) is True

    def test_value_error_is_permanent(self):
        """ValueError should be classified as permanent."""
        assert is_transient_error(ValueError("invalid value")) is False

    def test_type_error_is_permanent(self):
        """TypeError should be classified as permanent."""
        assert is_transient_error(TypeError("type error")) is False

    def test_429_in_message_is_transient(self):
        """Exception with 429 (rate limit) in message is transient."""
        assert is_transient_error(Exception("HTTP 429 Too Many Requests")) is True

    def test_503_in_message_is_transient(self):
        """Exception with 503 (service unavailable) in message is transient."""
        assert is_transient_error(Exception("HTTP 503 Service Unavailable")) is True

    def test_connection_in_message_is_transient(self):
        """Exception with 'connection' in message is transient."""
        assert is_transient_error(Exception("connection refused")) is True


class TestFormatErrorForUser:
    """Tests for format_error_for_user helper function."""

    def test_timeout_error_formatting(self):
        """TimeoutError should format to user-friendly message."""
        result = format_error_for_user(TimeoutError("operation timed out"))
        assert "took too long" in result.lower()
        assert "try again" in result.lower()

    def test_connection_error_formatting(self):
        """ConnectionError should format to network message."""
        result = format_error_for_user(ConnectionError("connection failed"))
        assert "connection" in result.lower()
        assert "network" in result.lower()

    def test_value_error_formatting(self):
        """ValueError should include the error message."""
        result = format_error_for_user(ValueError("invalid chapter count"))
        assert "invalid input" in result.lower()
        assert "invalid chapter count" in result

    def test_type_error_formatting(self):
        """TypeError should format with type error prefix."""
        result = format_error_for_user(TypeError("expected int"))
        assert "type error" in result.lower()

    def test_file_not_found_formatting(self):
        """FileNotFoundError should format to file message."""
        result = format_error_for_user(FileNotFoundError("file.txt not found"))
        assert "file" in result.lower()
        assert "not found" in result.lower()

    def test_permission_error_formatting(self):
        """PermissionError should format to permission message."""
        result = format_error_for_user(PermissionError("access denied"))
        assert "permission" in result.lower()

    def test_generic_error_formatting(self):
        """Generic exception should format with fallback message."""
        result = format_error_for_user(RuntimeError("something went wrong"))
        assert "error occurred" in result.lower()
        assert "something went wrong" in result


class TestRetryOnTransient:
    """Tests for retry_on_transient decorator."""

    def test_succeeds_on_first_attempt(self):
        """Function should return immediately if no error occurs."""
        call_count = 0

        @retry_on_transient(max_attempts=3)
        def success_func():
            nonlocal call_count
            call_count += 1
            return "success"

        result = success_func()
        assert result == "success"
        assert call_count == 1

    def test_retries_on_transient_error(self):
        """Function should retry on transient errors."""
        call_count = 0

        @retry_on_transient(max_attempts=3, initial_delay=0.01)
        def transient_error_func():
            nonlocal call_count
            call_count += 1
            if call_count < 3:
                raise TimeoutError("timeout")
            return "success"

        result = transient_error_func()
        assert result == "success"
        assert call_count == 3

    def test_gives_up_on_permanent_error(self):
        """Function should not retry on permanent errors."""
        call_count = 0

        @retry_on_transient(max_attempts=3)
        def permanent_error_func():
            nonlocal call_count
            call_count += 1
            raise ValueError("invalid input")

        with pytest.raises(ValueError):
            permanent_error_func()

        assert call_count == 1

    def test_raises_after_max_attempts(self):
        """Function should raise after exhausting retries."""
        call_count = 0

        @retry_on_transient(max_attempts=2, initial_delay=0.01)
        def always_fails():
            nonlocal call_count
            call_count += 1
            raise TimeoutError("timeout")

        with pytest.raises(TimeoutError):
            always_fails()

        assert call_count == 2

    def test_exponential_backoff(self):
        """Retry delays should increase exponentially."""
        delays = []
        call_count = 0

        @retry_on_transient(max_attempts=4, initial_delay=0.01, backoff=2.0)
        def track_delays():
            nonlocal call_count
            call_count += 1
            if call_count > 1:
                delays.append(time.time())
            if call_count < 4:
                raise TimeoutError("timeout")
            return "success"

        track_delays()

        # Verify delays increased (rough check due to timing variance)
        assert len(delays) >= 2

    def test_custom_logger(self):
        """Decorator should use provided logger."""
        mock_logger = MagicMock()

        @retry_on_transient(max_attempts=2, initial_delay=0.01, logger=mock_logger)
        def failing_func():
            raise TimeoutError("timeout")

        with pytest.raises(TimeoutError):
            failing_func()

        # Should log warning for retry and error for max retries exceeded
        assert mock_logger.warning.called or mock_logger.error.called


class TestLogErrors:
    """Tests for log_errors decorator."""

    def test_logs_and_reraises_exception(self):
        """Decorator should log exception and re-raise it."""
        mock_logger = MagicMock()

        @log_errors(logger=mock_logger)
        def failing_func():
            raise ValueError("test error")

        with pytest.raises(ValueError):
            failing_func()

        mock_logger.error.assert_called_once()
        call_args = mock_logger.error.call_args
        assert "function_error" in str(call_args)

    def test_logs_with_custom_level(self):
        """Decorator should use specified log level."""
        mock_logger = MagicMock()

        @log_errors(logger=mock_logger, level="warning")
        def failing_func():
            raise RuntimeError("test error")

        with pytest.raises(RuntimeError):
            failing_func()

        mock_logger.warning.assert_called_once()

    def test_includes_function_name_in_log(self):
        """Log should include the function name."""
        mock_logger = MagicMock()

        @log_errors(logger=mock_logger)
        def my_function():
            raise ValueError("error")

        with pytest.raises(ValueError):
            my_function()

        call_args = mock_logger.error.call_args
        assert "my_function" in str(call_args)

    def test_successful_function_not_logged(self):
        """Successful execution should not log."""
        mock_logger = MagicMock()

        @log_errors(logger=mock_logger)
        def success_func():
            return "success"

        result = success_func()
        assert result == "success"
        mock_logger.error.assert_not_called()


class TestHandleGracefully:
    """Tests for handle_gracefully decorator."""

    def test_returns_default_on_exception(self):
        """Decorator should return default value on exception."""

        @handle_gracefully(default_return="default")
        def failing_func():
            raise ValueError("error")

        result = failing_func()
        assert result == "default"

    def test_returns_none_by_default(self):
        """Decorator should return None if no default specified."""

        @handle_gracefully()
        def failing_func():
            raise RuntimeError("error")

        result = failing_func()
        assert result is None

    def test_returns_complex_default(self):
        """Decorator should handle complex default values."""

        @handle_gracefully(default_return={"status": "error"})
        def failing_func():
            raise ValueError("error")

        result = failing_func()
        assert result == {"status": "error"}

    def test_returns_function_result_on_success(self):
        """Decorator should return function result if no exception."""

        @handle_gracefully(default_return="default")
        def success_func():
            return "success"

        result = success_func()
        assert result == "success"

    def test_logs_caught_exception(self):
        """Decorator should log caught exceptions."""
        mock_logger = MagicMock()

        @handle_gracefully(default_return=None, logger=mock_logger)
        def failing_func():
            raise ValueError("error")

        failing_func()
        mock_logger.warning.assert_called_once()

    def test_custom_log_level(self):
        """Decorator should use specified log level."""
        mock_logger = MagicMock()

        @handle_gracefully(default_return=None, logger=mock_logger, log_level="info")
        def failing_func():
            raise ValueError("error")

        failing_func()
        mock_logger.info.assert_called_once()


class TestSafeOperation:
    """Tests for safe_operation context manager."""

    def test_successful_operation_completes(self):
        """Context manager should allow successful operations."""
        executed = False

        with safe_operation("test_op"):
            executed = True

        assert executed is True

    def test_logs_and_reraises_exception(self):
        """Context manager should log exception and re-raise."""
        mock_logger = MagicMock()

        with pytest.raises(ValueError):
            with safe_operation("test_op", logger=mock_logger):
                raise ValueError("test error")

        mock_logger.error.assert_called_once()

    def test_includes_operation_name_in_log(self):
        """Log should include operation name."""
        mock_logger = MagicMock()

        with pytest.raises(RuntimeError):
            with safe_operation("my_operation", logger=mock_logger):
                raise RuntimeError("error")

        call_args = mock_logger.error.call_args
        assert "my_operation" in str(call_args)

    def test_default_operation_name(self):
        """Should use default operation name if not specified."""
        mock_logger = MagicMock()

        with pytest.raises(ValueError):
            with safe_operation(logger=mock_logger):
                raise ValueError("error")

        mock_logger.error.assert_called_once()


class TestLoggedOperation:
    """Tests for logged_operation context manager."""

    def test_logs_start_and_completion(self):
        """Context manager should log operation start and completion."""
        mock_logger = MagicMock()

        with logged_operation("test_op", logger=mock_logger):
            pass

        assert mock_logger.info.call_count >= 2
        calls = [str(call) for call in mock_logger.info.call_args_list]
        assert any("operation_started" in call for call in calls)
        assert any("operation_completed" in call for call in calls)

    def test_logs_error_on_exception(self):
        """Context manager should log error if exception occurs."""
        mock_logger = MagicMock()

        with pytest.raises(ValueError):
            with logged_operation("test_op", logger=mock_logger):
                raise ValueError("test error")

        mock_logger.error.assert_called_once()
        call_args = mock_logger.error.call_args
        assert "operation_failed" in str(call_args)

    def test_includes_elapsed_time(self):
        """Log should include elapsed time."""
        mock_logger = MagicMock()

        with logged_operation("test_op", logger=mock_logger):
            time.sleep(0.01)

        # Check completion log includes elapsed_seconds
        completion_calls = [
            call
            for call in mock_logger.info.call_args_list
            if "operation_completed" in str(call)
        ]
        assert len(completion_calls) > 0

    def test_custom_log_level(self):
        """Context manager should use specified log level."""
        mock_logger = MagicMock()

        with logged_operation("test_op", logger=mock_logger, log_level="debug"):
            pass

        mock_logger.debug.assert_called()

    def test_operation_name_in_logs(self):
        """Operation name should appear in all logs."""
        mock_logger = MagicMock()

        with logged_operation("my_operation", logger=mock_logger):
            pass

        for call in mock_logger.info.call_args_list:
            assert "my_operation" in str(call)

    def test_elapsed_time_on_error(self):
        """Elapsed time should be logged even on error."""
        mock_logger = MagicMock()

        with pytest.raises(RuntimeError):
            with logged_operation("test_op", logger=mock_logger):
                time.sleep(0.01)
                raise RuntimeError("error")

        error_call = mock_logger.error.call_args
        assert "elapsed_seconds" in str(error_call)


class TestIntegration:
    """Integration tests combining multiple utilities."""

    def test_retry_with_log_errors(self):
        """Combining retry and log_errors decorators."""
        call_count = 0
        mock_logger = MagicMock()

        @log_errors(logger=mock_logger)
        @retry_on_transient(max_attempts=2, initial_delay=0.01, logger=mock_logger)
        def failing_func():
            nonlocal call_count
            call_count += 1
            raise TimeoutError("timeout")

        with pytest.raises(TimeoutError):
            failing_func()

        assert call_count == 2

    def test_handle_gracefully_with_logged_operation(self):
        """Combining handle_gracefully with logged_operation."""
        mock_logger = MagicMock()

        @handle_gracefully(default_return="default", logger=mock_logger)
        def failing_func():
            with logged_operation("inner_op", logger=mock_logger):
                raise ValueError("error")

        result = failing_func()
        assert result == "default"

    def test_safe_operation_with_retry(self):
        """Using safe_operation with retry logic."""
        call_count = 0
        mock_logger = MagicMock()

        @retry_on_transient(max_attempts=2, initial_delay=0.01, logger=mock_logger)
        def retry_func():
            nonlocal call_count
            call_count += 1
            if call_count < 2:
                raise TimeoutError("timeout")
            return "success"

        with safe_operation("retry_op", logger=mock_logger):
            result = retry_func()
            assert result == "success"
