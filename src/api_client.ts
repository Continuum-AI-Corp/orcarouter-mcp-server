import {
  ApiError,
  AuthenticationError,
  InsufficientQuotaError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
  RequestCancelledError,
} from "./errors.js";
import { PACKAGE_VERSION } from "./version.js";

export {
  ApiError,
  AuthenticationError,
  InsufficientQuotaError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
  RequestCancelledError,
} from "./errors.js";

export interface ApiClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Per-request timeout in milliseconds. Defaults to 300000 (5 minutes). */
  timeoutMs?: number;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

const DEFAULT_BASE_URL = "https://api.orcarouter.ai";
const DEFAULT_TIMEOUT_MS = 300_000;
const USER_AGENT = `@orcarouter/mcp/${PACKAGE_VERSION} (Node.js)`;

export class ApiClient {
  readonly apiKey?: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiClientOptions = {}) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs =
      typeof opts.timeoutMs === "number" && opts.timeoutMs > 0
        ? opts.timeoutMs
        : DEFAULT_TIMEOUT_MS;
  }

  get<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
    return this.request<T>("GET", path, undefined, opts);
  }

  post<T = unknown>(
    path: string,
    body: unknown,
    opts: RequestOptions = {},
  ): Promise<T> {
    return this.request<T>("POST", path, body, opts);
  }

  async raw(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    opts: RequestOptions = {},
  ): Promise<Response> {
    const url = this.buildUrl(path, opts.query);
    const headers = this.buildHeaders(body !== undefined, opts.headers);
    const externalSignal = opts.signal;
    const { signal, cancel, didTimeout } =
      this.makeTimeoutSignal(externalSignal);
    const init: RequestInit = {
      method,
      headers,
      signal,
    };
    if (body !== undefined) {
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    try {
      return await this.fetchImpl(url, init);
    } catch (e) {
      // The composed signal aborts for one of two reasons: the SDK's own
      // deadline elapsed, or the caller aborted their supplied signal.
      // Detection must rely on the *signal state*, not the thrown error's
      // `name`: fetch can reject with the exact AbortSignal.reason (e.g.
      // `controller.abort(new Error("cancelled"))`) whose name is just
      // "Error", which would otherwise bypass the cancellation path.

      // 1. Internal deadline fired -> timeout (independent of error name).
      if (didTimeout()) {
        throw new Error(
          `OrcaRouter request timed out after ${this.timeoutMs}ms (${method} ${path}).`,
        );
      }
      // 2. Caller's signal (or the composed controller) aborted without the
      //    internal timeout firing -> explicit caller cancellation. Preserve
      //    the original error/reason as `cause` for debuggability.
      if (externalSignal?.aborted || signal.aborted) {
        throw new RequestCancelledError(
          `OrcaRouter request cancelled by caller (${method} ${path}).`,
          { cause: e },
        );
      }
      // 3. Fallback for environments that throw a plain DOMException without
      //    an observable signal state. A timeout would have set the flag in
      //    (1), so a name-based abort here is a caller cancellation.
      if (this.isAbortError(e)) {
        throw new RequestCancelledError(
          `OrcaRouter request cancelled by caller (${method} ${path}).`,
          { cause: e },
        );
      }
      throw e;
    } finally {
      cancel();
    }
  }

  private isAbortError(e: unknown): boolean {
    if (!e || typeof e !== "object") return false;
    const name = (e as { name?: string }).name;
    return name === "AbortError" || name === "TimeoutError";
  }

  private makeTimeoutSignal(external?: AbortSignal): {
    signal: AbortSignal;
    cancel: () => void;
    didTimeout: () => boolean;
  } {
    const controller = new AbortController();
    // Set strictly inside the timeout handler so the caller can later tell
    // an SDK-deadline abort apart from a caller-initiated cancellation.
    let didTimeoutFlag = false;
    const timer = setTimeout(() => {
      didTimeoutFlag = true;
      controller.abort(new Error("OrcaRouter request timeout"));
    }, this.timeoutMs);
    const onExternalAbort = () => controller.abort(external?.reason);
    if (external) {
      if (external.aborted) {
        controller.abort(external.reason);
      } else {
        external.addEventListener("abort", onExternalAbort, { once: true });
      }
    }
    const cancel = () => {
      clearTimeout(timer);
      if (external) external.removeEventListener("abort", onExternalAbort);
    };
    // Strictly the internal-deadline flag. Caller-abort detection is done
    // separately via signal state in raw(), so this no longer conflates a
    // missing external signal with a timeout.
    const didTimeout = () => didTimeoutFlag;
    return { signal: controller.signal, cancel, didTimeout };
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body: unknown,
    opts: RequestOptions,
  ): Promise<T> {
    const response = await this.raw(method, path, body, opts);
    if (!response.ok) {
      await this.throwForStatus(response);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>,
  ): string {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = new URL(this.baseUrl + normalizedPath);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined || value === null) continue;
        url.searchParams.append(key, String(value));
      }
    }
    return url.toString();
  }

  private buildHeaders(
    hasBody: boolean,
    extra?: Record<string, string>,
  ): Headers {
    const headers = new Headers();
    if (this.apiKey) {
      headers.set("Authorization", `Bearer ${this.apiKey}`);
    }
    headers.set("Accept", "application/json");
    headers.set("User-Agent", USER_AGENT);
    if (hasBody) {
      headers.set("Content-Type", "application/json");
    }
    if (extra) {
      for (const [k, v] of Object.entries(extra)) {
        headers.set(k, v);
      }
    }
    return headers;
  }

  private async throwForStatus(response: Response): Promise<never> {
    const status = response.status;
    let bodyText = "";
    let parsed: unknown = undefined;
    try {
      bodyText = await response.text();
      if (bodyText) {
        try {
          parsed = JSON.parse(bodyText);
        } catch {
          parsed = undefined;
        }
      }
    } catch {
      // ignore body read failures
    }

    const message =
      extractErrorMessage(parsed) ?? (bodyText || response.statusText);

    // Quota exhaustion is reported as 402 or 403 with an
    // insufficient_quota / insufficient_user_quota error code. Map it
    // before the generic auth/permission handling so callers can prompt
    // a top-up instead of treating it as a credential problem.
    if (
      (status === 402 || status === 403) &&
      hasInsufficientQuotaCode(parsed)
    ) {
      throw new InsufficientQuotaError(message, status, parsed);
    }
    if (status === 401) {
      throw new AuthenticationError(message, parsed);
    }
    if (status === 403) {
      // Valid credentials, operation not permitted — preserve status 403
      // instead of collapsing into AuthenticationError (hardcoded 401).
      throw new PermissionDeniedError(message, parsed);
    }
    if (status === 429) {
      throw new RateLimitError(
        message,
        parseRetryAfter(response.headers.get("retry-after")),
        parsed,
      );
    }
    if (status >= 500) {
      throw new InternalServerError(message, status, parsed);
    }
    throw new ApiError(message, status, parsed);
  }
}

/**
 * Parse a `Retry-After` header. Supports both the delta-seconds form
 * (`"120"`) and the HTTP-date form (`"Wed, 21 Oct 2015 07:28:00 GMT"`).
 * For an HTTP-date the delay is `max(0, round((parsed - now) / 1000))`.
 * Returns `undefined` when absent or unparseable.
 */
function parseRetryAfter(raw: string | null): number | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return undefined;
  const asNumber = Number(trimmed);
  if (Number.isFinite(asNumber)) {
    return asNumber;
  }
  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) {
    return Math.max(0, Math.round((asDate - Date.now()) / 1000));
  }
  return undefined;
}

function hasInsufficientQuotaCode(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const codes = new Set(["insufficient_quota", "insufficient_user_quota"]);
  const b = body as Record<string, unknown>;
  if (typeof b.code === "string" && codes.has(b.code)) return true;
  if (b.error && typeof b.error === "object") {
    const inner = b.error as Record<string, unknown>;
    if (typeof inner.code === "string" && codes.has(inner.code)) return true;
  }
  return false;
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.message === "string") return b.message;
  if (b.error && typeof b.error === "object") {
    const inner = b.error as Record<string, unknown>;
    if (typeof inner.message === "string") return inner.message;
  }
  if (typeof b.error === "string") return b.error;
  return undefined;
}
