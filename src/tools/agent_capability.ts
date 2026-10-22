import { ApiError, RateLimitError } from "../errors.js";
import type { McpToolResult } from "./types.js";

// The agent capability routes (/v1/agents/...) answer a failure with
// `{ success: false, code, message }`, plus the fields a caller recovers
// with: `retry_ref` and `message_id` on send_in_progress, `deny` on
// policy_declined. The server's generic error text keeps only the HTTP status
// and message, and these callers have to branch on `code` — a 409 means
// "retry with the same client_ref" for send_in_progress and "retry with a new
// one" for send_key_burned — so the whole envelope is handed back, as JSON
// after a one-line summary (the same JSON-in-text convention the catalog
// tools use).

export function errorResult(text: string): McpToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

/** The failure envelope's fields, without the redundant `success: false`. */
export function capabilityErrorBody(err: ApiError): Record<string, unknown> {
  const body =
    err.body && typeof err.body === "object" && !Array.isArray(err.body)
      ? { ...(err.body as Record<string, unknown>) }
      : {};
  delete body.success;
  return body;
}

// The capability handlers name the failure in `code`. The middleware in front
// of them refuses a key that is not bound to an agent with `error` instead
// (`{ error: "agent_binding_required", reason }`), so that is read as the code
// when there is none.
export function capabilityErrorCode(err: ApiError): string | undefined {
  const body = capabilityErrorBody(err);
  for (const v of [body.code, body.error]) {
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

const BIND_HINT =
  "This API key is not bound to an agent: bind it in the OrcaRouter console " +
  "(Console → Agents → your agent → API access), then retry.";

/**
 * The error result for a capability call that got an HTTP answer: the
 * status, the server's `code`, its message, an optional line on what to do
 * next, and the envelope as JSON.
 */
export function capabilityErrorResult(
  action: string,
  err: ApiError,
  hint?: string,
): McpToolResult {
  const body = capabilityErrorBody(err);
  const code = capabilityErrorCode(err);
  const details: Record<string, unknown> = { status: err.status, ...body };
  // A body with no message of its own (a proxy's plain-text 502) keeps the
  // client's reading of it; one that only names its code says nothing more.
  if (typeof details.message !== "string" && err.message && err.message !== code) {
    details.message = err.message;
  }
  if (err instanceof RateLimitError && err.retryAfter !== undefined) {
    details.retry_after = err.retryAfter;
  }
  const head =
    `${action} failed (HTTP ${err.status}${code ? `, code ${code}` : ""})` +
    (err.message && err.message !== code ? `: ${err.message}` : ".");
  const lines = [head];
  const next = hint ?? (code === "agent_binding_required" ? BIND_HINT : undefined);
  if (next) lines.push(next);
  lines.push("", JSON.stringify(details, null, 2));
  return errorResult(lines.join("\n"));
}
