"""Error handling utilities with decorators, context managers, and helper functions.

This module provides reusable patterns for error handling across the application:
- Decorators for retry logic, error logging, and graceful degradation
- Context managers for safe operations with automatic logging
- Helper functions for error classification and user-friendly formatting
"""

from __future__ import annotations

import functools
import time
from contextlib import contextmanager
from typing import Any, Callable, Generator, Optional, TypeVar

import structlog

# Type variables for generic decorators
F = TypeVar("F", bound=Callable[..., Any])
T = TypeVar("T")


def is_transient_error(exception: Exception) -> bool:
    """Determine if an exception represents a transient (retryable) error.

    Transient errors are temporary failures that may succeed on retry:
    - Network timeouts and connection errors
    - Rate limiting (429)
    - Temporary service unavailability (503)
    - Temporary file system issues

    Permanent errors (not retryable):
    - Validation errors (ValueError, TypeError)
    - Authentication failures (401)
    - Authorization failures (403)
    - Not found errors (404)
    - Malformed requests (400)

    Args:
        exception: The exception to classify

    Returns:
        True if the error is transient and should be retried, False otherwise

    Examples:
        >>> is_transient_error(TimeoutError())
        True
        >>> is_transient_error(ValueError("invalid input"))
        False
    """
    transient_types = (
        TimeoutError,
        ConnectionError,
        OSError,
        IOError,
        BrokenPipeError,
        ConnectionResetError,
        ConnectionAbortedError,
    )

    if isinstance(exception, transient_types):
        return True

    # Check for HTTP-like status codes in exception message
    error_msg = str(exception).lower()
    if any(code in error_msg for code in ["429", "503", "timeout", "connection"]):
        return True

    return False


def format_error_for_user(exception: Exception) -> str:
    """Format an exception into a user-friendly error message.

    Converts technical error details into clear, actionable messages that
    don't expose internal implementation details or security-sensitive info.

    Args:
        exception: The exception to format

    Returns:
        A user-friendly error message string

    Examples:
        >>> format_error_for_user(TimeoutError("Connection timed out"))
        'The operation took too long. Please try again.'
        >>> format_error_for_user(ValueError("invalid chapter count"))
        'Invalid input: invalid chapter count'
    """
    exc_msg = str(exception)

    # Transient errors
    if isinstance(exception, TimeoutError):
        return "The operation took too long. Please try again."
    if isinstance(exception, (ConnectionError, BrokenPipeError)):
        return "Connection failed. Please check your network and try again."

    # Validation errors
    if isinstance(exception, ValueError):
        return f"Invalid input: {exc_msg}"
    if isinstance(exception, TypeError):
        return f"Type error: {exc_msg}"

    # File system errors
    if isinstance(exception, FileNotFoundError):
        return "The requested file was not found."
    if isinstance(exception, PermissionError):
        return "You don't have permission to access this resource."

    # Generic fallback
    return f"An error occurred: {exc_msg}"


def retry_on_transient(
    max_attempts: int = 3,
    backoff: float = 2.0,
    initial_delay: float = 0.1,
    logger: Optional[structlog.stdlib.BoundLogger] = None,
) -> Callable[[F], F]:
    """Decorator to retry a function on transient errors with exponential backoff.

    Retries the decorated function if it raises a transient error (network timeout,
    connection error, etc.). Uses exponential backoff between attempts.

    Args:
        max_attempts: Maximum number of attempts (default: 3)
        backoff: Backoff multiplier for exponential delay (default: 2.0)
        initial_delay: Initial delay in seconds before first retry (default: 0.1)
        logger: Optional logger instance for retry logging

    Returns:
        Decorated function that retries on transient errors

    Raises:
        The original exception if all retries are exhausted or error is permanent

    Examples:
        >>> @retry_on_transient(max_attempts=3, backoff=2.0)
        ... def fetch_data():
        ...     # May raise TimeoutError on first attempt, succeeds on retry
        ...     pass

        >>> @retry_on_transient(max_attempts=5, initial_delay=0.5)
        ... def call_external_api():
        ...     pass
    """
    if logger is None:
        logger = structlog.get_logger(__name__)

    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            delay = initial_delay
            last_exception = None

            for attempt in range(1, max_attempts + 1):
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    last_exception = e

                    # Don't retry permanent errors
                    if not is_transient_error(e):
                        logger.error(
                            "permanent_error",
                            function=func.__name__,
                            error_type=type(e).__name__,
                            error_msg=str(e),
                        )
                        raise

                    # Last attempt failed
                    if attempt == max_attempts:
                        logger.error(
                            "max_retries_exceeded",
                            function=func.__name__,
                            attempts=max_attempts,
                            error_type=type(e).__name__,
                            error_msg=str(e),
                        )
                        raise

                    # Log retry attempt
                    logger.warning(
                        "retrying_on_transient_error",
                        function=func.__name__,
                        attempt=attempt,
                        max_attempts=max_attempts,
                        delay_seconds=delay,
                        error_type=type(e).__name__,
                    )

                    time.sleep(delay)
                    delay *= backoff

            # Should not reach here, but just in case
            if last_exception:
                raise last_exception

        return wrapper  # type: ignore

    return decorator


def log_errors(
    logger: Optional[structlog.stdlib.BoundLogger] = None,
    level: str = "error",
    include_traceback: bool = True,
) -> Callable[[F], F]:
    """Decorator to log exceptions raised by a function.

    Logs the exception with context information and re-raises it.
    Useful for adding observability to functions without changing error handling.

    Args:
        logger: Optional logger instance (defaults to module logger)
        level: Log level as string ("error", "warning", "info", etc.)
        include_traceback: Whether to include stack trace in logs

    Returns:
        Decorated function that logs exceptions before re-raising

    Examples:
        >>> @log_errors(level="warning")
        ... def process_item(item):
        ...     # Any exception will be logged before being raised
        ...     pass

        >>> @log_errors(include_traceback=False)
        ... def quick_operation():
        ...     pass
    """
    if logger is None:
        logger = structlog.get_logger(__name__)

    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                return func(*args, **kwargs)
            except Exception as e:
                log_method = getattr(logger, level.lower(), logger.error)
                log_method(
                    "function_error",
                    function=func.__name__,
                    error_type=type(e).__name__,
                    error_msg=str(e),
                    exc_info=include_traceback,
                )
                raise

        return wrapper  # type: ignore

    return decorator


def handle_gracefully(
    default_return: Any = None,
    logger: Optional[structlog.stdlib.BoundLogger] = None,
    log_level: str = "warning",
) -> Callable[[F], F]:
    """Decorator to catch exceptions and return a default value.

    Catches any exception, logs it, and returns a default value instead of
    propagating the error. Useful for non-critical operations that should
    degrade gracefully.

    Args:
        default_return: Value to return if exception occurs (default: None)
        logger: Optional logger instance
        log_level: Log level for caught exceptions

    Returns:
        Decorated function that returns default_return on exception

    Examples:
        >>> @handle_gracefully(default_return={})
        ... def get_optional_config():
        ...     # Returns {} if any error occurs
        ...     pass

        >>> @handle_gracefully(default_return=0, log_level="info")
        ... def count_items():
        ...     pass
    """
    if logger is None:
        logger = structlog.get_logger(__name__)

    def decorator(func: F) -> F:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            try:
                return func(*args, **kwargs)
            except Exception as e:
                log_method = getattr(logger, log_level.lower(), logger.warning)
                log_method(
                    "graceful_error_handling",
                    function=func.__name__,
                    error_type=type(e).__name__,
                    error_msg=str(e),
                    returning_default=True,
                )
                return default_return

        return wrapper  # type: ignore

    return decorator


@contextmanager
def safe_operation(
    operation_name: str = "operation",
    logger: Optional[structlog.stdlib.BoundLogger] = None,
) -> Generator[None, None, None]:
    """Context manager for safe operations with automatic error logging.

    Wraps a code block with try/except, logging any exceptions that occur.
    The exception is re-raised after logging.

    Args:
        operation_name: Name of the operation for logging context
        logger: Optional logger instance

    Yields:
        None

    Raises:
        Any exception that occurs within the context block

    Examples:
        >>> with safe_operation("database_write"):
        ...     db.insert(record)
        ...     # If an error occurs, it's logged with operation_name context

        >>> with safe_operation("file_cleanup"):
        ...     os.remove(temp_file)
    """
    if logger is None:
        logger = structlog.get_logger(__name__)

    try:
        yield
    except Exception as e:
        logger.error(
            "operation_failed",
            operation=operation_name,
            error_type=type(e).__name__,
            error_msg=str(e),
        )
        raise


@contextmanager
def logged_operation(
    operation_name: str,
    logger: Optional[structlog.stdlib.BoundLogger] = None,
    log_level: str = "info",
) -> Generator[None, None, None]:
    """Context manager that logs operation start, end, and any errors.

    Logs when an operation starts, completes successfully, or fails.
    Useful for tracking long-running operations and debugging.

    Args:
        operation_name: Name of the operation for logging
        logger: Optional logger instance
        log_level: Log level for start/end messages

    Yields:
        None

    Raises:
        Any exception that occurs within the context block

    Examples:
        >>> with logged_operation("data_export"):
        ...     # Logs: "operation_started" with operation="data_export"
        ...     export_data()
        ...     # Logs: "operation_completed" with operation="data_export"

        >>> with logged_operation("cleanup", log_level="debug"):
        ...     cleanup_resources()
    """
    if logger is None:
        logger = structlog.get_logger(__name__)

    log_method = getattr(logger, log_level.lower(), logger.info)

    log_method("operation_started", operation=operation_name)
    start_time = time.time()

    try:
        yield
        elapsed = time.time() - start_time
        log_method(
            "operation_completed",
            operation=operation_name,
            elapsed_seconds=elapsed,
        )
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(
            "operation_failed",
            operation=operation_name,
            error_type=type(e).__name__,
            error_msg=str(e),
            elapsed_seconds=elapsed,
        )
        raise
