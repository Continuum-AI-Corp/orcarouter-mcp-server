export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(
    message: string,
    status: number,
    body?: unknown,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class AuthenticationError extends ApiError {
  constructor(message: string, body?: unknown) {
    super(message, 401, body);
    this.name = "AuthenticationError";
  }
}

/**
 * HTTP 403. Distinct from {@link AuthenticationError} (401): the credentials
 * are valid but the operation is not permitted. Preserves status 403 instead
 * of collapsing into a 401.
 */
export class PermissionDeniedError extends ApiError {
  constructor(message: string, body?: unknown) {
    super(message, 403, body);
    this.name = "PermissionDeniedError";
  }
}

/**
 * The account/key is out of quota (HTTP 402 or 403 carrying an
 * `insufficient_quota` / `insufficient_user_quota` error code). Mapped
 * separately so callers can surface a top-up prompt rather than a generic
 * auth/permission failure. Status mirrors the upstream response.
 */
export class InsufficientQuotaError extends ApiError {
  constructor(message: string, status: number, body?: unknown) {
    super(message, status, body);
    this.name = "InsufficientQuotaError";
  }
}

/**
 * The request was aborted via a caller-supplied `AbortSignal`. Distinct from
 * a timeout (the SDK's internal deadline) — name is `AbortError` so existing
 * abort-aware callers keep working.
 */
export class RequestCancelledError extends Error {
  constructor(
    message = "OrcaRouter request cancelled by caller.",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "AbortError";
  }
}

export class RateLimitError extends ApiError {
  retryAfter?: number;
  constructor(message: string, retryAfter?: number, body?: unknown) {
    super(message, 429, body);
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class InternalServerError extends ApiError {
  constructor(message: string, status: number, body?: unknown) {
    super(message, status, body);
    this.name = "InternalServerError";
  }
}

export class MissingApiKeyError extends Error {
  constructor(toolName: string) {
    super(
      `ORCAROUTER_API_KEY is required for tool "${toolName}". ` +
        `Set the ORCAROUTER_API_KEY environment variable when launching the MCP server.`,
    );
    this.name = "MissingApiKeyError";
  }
}
