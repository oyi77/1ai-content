# Logging Best Practices

This document outlines the structured logging standards for the AI Ebook Generator codebase.

## Overview

We use `structlog` for structured logging with consistent field names across all exception handlers. This enables better debugging, monitoring, and alerting.

## Standard Log Fields

All log entries should include these standard fields:

- **error**: String representation of the exception (`str(e)`)
- **error_type**: Exception class name (`type(e).__name__`)
- **context**: Dictionary with operation-specific metadata
- **severity**: Log level as string (`"error"`, `"warning"`, `"info"`)

### Context Field

The `context` dictionary should include:

- **operation**: Name of the operation that failed (e.g., `"generate_text"`, `"pdf_conversion"`)
- **Additional fields**: Operation-specific data (project_id, file paths, model names, etc.)

## Usage Examples

### Basic Exception Handler

```python
from src.logger import get_logger

logger = get_logger(__name__)

try:
    result = risky_operation()
except Exception as e:
    error_type = type(e).__name__
    context = {
        "operation": "risky_operation",
        "input_param": some_value,
    }
    logger.error(
        "Operation failed",
        error=str(e),
        error_type=error_type,
        context=context,
        severity="error"
    )
    raise
```

### Warning for Recoverable Errors

```python
try:
    optional_feature()
except Exception as e:
    error_type = type(e).__name__
    context = {
        "operation": "optional_feature",
    }
    logger.warning(
        "Optional feature failed, continuing",
        error=str(e),
        error_type=error_type,
        context=context,
        severity="warning"
    )
```

### Info for Expected Conditions

```python
try:
    check_libreoffice()
except RuntimeError as e:
    error_type = type(e).__name__
    context = {
        "operation": "check_libreoffice",
    }
    logger.info(
        "LibreOffice not found, skipping PDF conversion",
        error=str(e),
        error_type=error_type,
        context=context,
        severity="info"
    )
```

## Correlation IDs for Request Tracing

FastAPI requests automatically include correlation IDs for distributed tracing.

### Middleware (Already Configured)

The API server includes correlation ID middleware that:
- Accepts `X-Correlation-ID` header from clients
- Generates a new correlation ID if not provided
- Binds the correlation ID to the request context
- Returns the correlation ID in the response header

### Manual Correlation ID Binding

For background jobs or non-HTTP contexts:

```python
from src.logger import bind_correlation_id, clear_correlation_id, generate_correlation_id

correlation_id = generate_correlation_id()
bind_correlation_id(correlation_id)

try:
    # All logs within this context will include correlation_id
    do_work()
finally:
    clear_correlation_id()
```

## Log Levels

Use appropriate log levels:

- **ERROR**: Operation failed and cannot continue
- **WARNING**: Operation failed but system can recover or continue
- **INFO**: Expected conditions or informational messages

## Anti-Patterns to Avoid

### ❌ Bare print() Statements

```python
# BAD
except Exception as e:
    print(f"Error: {e}")
```

### ❌ Logging Without Context

```python
# BAD
except Exception as e:
    logger.error("Failed")
```

### ❌ Missing error_type

```python
# BAD
except Exception as e:
    logger.error("Failed", error=str(e))
```

### ✅ Correct Pattern

```python
# GOOD
except Exception as e:
    error_type = type(e).__name__
    context = {
        "operation": "specific_operation",
        "relevant_param": value,
    }
    logger.error(
        "Operation failed",
        error=str(e),
        error_type=error_type,
        context=context,
        severity="error"
    )
```

## Verification

To verify structured logging compliance:

```bash
# Check for bare print() statements (should return 0 in src/ and app/)
grep -r "print(" src/ app/ --include="*.py" | grep -v test | wc -l

# Check for logging without context (manual review required)
grep -r "logger\." src/ app/ --include="*.py"
```

## Configuration

### Environment Variables

- `LOG_FORMAT`: Set to `"json"` for JSON output, `"console"` for human-readable (default: `"console"`)
- `LOG_LEVEL`: Set log level (`"DEBUG"`, `"INFO"`, `"WARNING"`, `"ERROR"`) (default: `"INFO"`)

### JSON Output for Production

```bash
export LOG_FORMAT=json
export LOG_LEVEL=INFO
```

### Console Output for Development

```bash
export LOG_FORMAT=console
export LOG_LEVEL=DEBUG
```

## Integration with Monitoring

Structured logs can be easily parsed by log aggregation tools:

- **Elasticsearch/Kibana**: Parse JSON logs and create dashboards
- **Datadog/New Relic**: Automatic field extraction from structured logs
- **CloudWatch Logs Insights**: Query by error_type, operation, correlation_id

Example CloudWatch query:

```
fields @timestamp, error_type, context.operation, error
| filter severity = "error"
| stats count() by error_type
```

## Summary

- Always use `logger.error()`, `logger.warning()`, or `logger.info()`
- Include `error`, `error_type`, `context`, and `severity` fields
- Use correlation IDs for request tracing
- Never use bare `print()` statements
- Choose appropriate log levels
