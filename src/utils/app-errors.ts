/**
 * Custom error classes with structured error codes.
 *
 * Per REFACTORING_AUDIT.md §3.1, we replace 172 generic `throw new Error("...")`
 * with typed errors that carry machine-readable codes for monitoring/alerting.
 *
 * Convention:
 *   - Code format: DOMAIN_REASON (e.g., CREDIT_INSUFFICIENT, PROVIDER_TIMEOUT)
 *   - All errors extend AppError which has `code`, `statusCode`, and optional `cause`
 *   - HTTP-aware errors (ApiError) carry a statusCode for direct use in route responses
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.cause = cause;
  }
}

/** Errors that should bubble up to the user as a specific HTTP status */
export class ApiError extends AppError {
  public readonly statusCode: number;

  constructor(code: string, message: string, statusCode: number, cause?: unknown) {
    super(code, message, cause);
    this.statusCode = statusCode;
  }
}

// ----- Domain-specific errors -----

/** User has insufficient credits for an operation */
export class InsufficientCreditsError extends ApiError {
  constructor(message: string = 'Insufficient credits', cause?: unknown) {
    super('CREDIT_INSUFFICIENT', message, 402, cause);
  }
}

/** External AI provider failed or timed out */
export class ProviderError extends AppError {
  public readonly provider: string;
  constructor(provider: string, message: string, cause?: unknown) {
    super(`PROVIDER_${provider.toUpperCase()}_ERROR`, `${provider}: ${message}`, cause);
    this.provider = provider;
  }
}

/** All providers in the fallback chain failed */
export class AllProvidersFailedError extends AppError {
  constructor(message: string = 'All providers in fallback chain failed', cause?: unknown) {
    super('PROVIDER_ALL_FAILED', message, cause);
  }
}

/** Provider-specific timeout */
export class ProviderTimeoutError extends ProviderError {
  constructor(provider: string, timeoutMs: number, cause?: unknown) {
    super(provider, `Timeout after ${timeoutMs}ms`, cause);
  }
}

/** Circuit breaker is open — provider is being skipped */
export class CircuitOpenError extends AppError {
  public readonly provider: string;
  constructor(provider: string, cause?: unknown) {
    super('CIRCUIT_OPEN', `Circuit breaker open for ${provider}`, cause);
    this.provider = provider;
  }
}

/** Required resource not found */
export class NotFoundError extends ApiError {
  constructor(resource: string, id?: string, cause?: unknown) {
    super(
      'NOT_FOUND',
      id ? `${resource} not found: ${id}` : `${resource} not found`,
      404,
      cause
    );
  }
}

/** Validation failed at the service layer (distinct from request validation) */
export class ValidationError extends ApiError {
  constructor(message: string, _field?: string, cause?: unknown) {
    super('VALIDATION_ERROR', message, 400, cause);
  }
}

/** Unauthorized / unauthenticated */
export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized', cause?: unknown) {
    super('UNAUTHORIZED', message, 401, cause);
  }
}

/** Forbidden */
export class ForbiddenError extends ApiError {
  constructor(message: string = 'Forbidden', cause?: unknown) {
    super('FORBIDDEN', message, 403, cause);
  }
}

/** User already banned, or already subscribed, etc. */
export class ConflictError extends ApiError {
  constructor(message: string, cause?: unknown) {
    super('CONFLICT', message, 409, cause);
  }
}

/** Payment gateway returned a non-success status */
export class PaymentError extends AppError {
  public readonly gateway: string;
  constructor(gateway: string, message: string, cause?: unknown) {
    super(`PAYMENT_${gateway.toUpperCase()}_ERROR`, message, cause);
    this.gateway = gateway;
  }
}

/** Queue / job error */
export class QueueError extends AppError {
  constructor(message: string, jobId?: string, cause?: unknown) {
    super('QUEUE_ERROR', jobId ? `${message} (job ${jobId})` : message, cause);
  }
}

/** Database / Prisma error */
export class DatabaseError extends AppError {
  constructor(message: string, cause?: unknown) {
    super('DATABASE_ERROR', message, cause);
  }
}

/** Configuration missing (e.g., required env var) */
export class ConfigError extends AppError {
  constructor(key: string, cause?: unknown) {
    super('CONFIG_MISSING', `Missing configuration: ${key}`, cause);
  }
}

/** Rate limit exceeded */
export class RateLimitError extends ApiError {
  constructor(retryAfterMs?: number, cause?: unknown) {
    super(
      'RATE_LIMITED',
      retryAfterMs ? `Rate limited. Retry after ${retryAfterMs}ms` : 'Rate limited',
      429,
      cause
    );
  }
}

/** Convert any thrown value into a typed AppError */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof Error) return new AppError('UNKNOWN_ERROR', err.message, err);
  return new AppError('UNKNOWN_ERROR', String(err));
}
