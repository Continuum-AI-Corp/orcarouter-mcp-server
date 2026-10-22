import { ApiError, RateLimitError } from "../errors.js";
import { errorResult, type McpToolResult } from "./types.js";

// The agent capability routes (/v1/agents/...) answer a failure with
// `{ success: false, code, message }`, plus the fields a caller recovers with:
// `retry_ref` and `message_id` on send_in_progress, `deny` on
// policy_declined. The server's generic error text keeps only the HTTP status
// and message, and these callers have to branch on `code` — a 409 means
// "retry with the same client_ref" for send_in_progress and "retry with a new
// one" for send_key_burned — so the whole envelope is handed back, as JSON
// after a one-line summary (the same JSON-in-text convention the catalog
// tools use).

/** One failed capability call, read once. */
export interface CapabilityFailure {
  status: number;
  /** The server's code: `code`, or the middleware's `error` (see below). */
  code?: string;
  /** The envelope without its redundant `success: false`. */
  body: Record<string, unknown>;
  /** The message, bounded (MAX_MESSAGE). */
  message: string;
  /** Seconds, on a 429 that said. */
  retryAfter?: number;
}

// A proxy or WAF in front of OrcaRouter can answer with a whole HTML page,
// which the client then reports as the message; the agent needs its first
// line, not 50 KB of markup in its context.
const MAX_MESSAGE = 300;

function bounded(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > MAX_MESSAGE ? `${flat.slice(0, MAX_MESSAGE)}…` : flat;
}

// The capability handlers name the failure in `code`. The middleware in front
// of them refuses a key that is not bound to an agent with `error` instead
// (`{ error: "agent_binding_required", reason }`), so that is read as the code
// when there is none.
export function readCapabilityFailure(err: ApiError): CapabilityFailure {
  const body =
    err.body && typeof err.body === "object" && !Array.isArray(err.body)
      ? { ...(err.body as Record<string, unknown>) }
      : {};
  delete body.success;
  let code: string | undefined;
  for (const v of [body.code, body.error]) {
    if (typeof v === "string" && v.length > 0) {
      code = v;
      break;
    }
  }
  return {
    status: err.status,
    code,
    body,
    message: bounded(err.message ?? ""),
    retryAfter: err instanceof RateLimitError ? err.retryAfter : undefined,
  };
}

const BIND_HINT =
  "This API key is not bound to an agent: bind it in the OrcaRouter console " +
  "(Console → Agents → your agent → API access), then retry.";

/**
 * The error result for a capability call that got an HTTP answer: the
 * status, the server's `code`, its message, a line on what to do next when
 * `hint` has one, and the envelope as JSON.
 */
export function capabilityErrorResult(
  action: string,
  err: ApiError,
  hint?: (f: CapabilityFailure) => string | undefined,
): McpToolResult {
  const f = readCapabilityFailure(err);
  const details: Record<string, unknown> = { status: f.status, ...f.body };
  if (typeof details.message === "string") {
    details.message = bounded(details.message);
  } else if (f.message && f.message !== f.code) {
    // A body with no message of its own (a proxy's plain-text or HTML page)
    // keeps the client's reading of it, bounded; one that only names its
    // code says nothing more.
    details.message = f.message;
  }
  if (f.retryAfter !== undefined) {
    details.retry_after = f.retryAfter;
  }
  const head =
    `${action} failed (HTTP ${f.status}${f.code ? `, code ${f.code}` : ""})` +
    (f.message && f.message !== f.code ? `: ${f.message}` : ".");
  const lines = [head];
  const next =
    hint?.(f) ?? (f.code === "agent_binding_required" ? BIND_HINT : undefined);
  if (next) lines.push(next);
  lines.push("", JSON.stringify(details, null, 2));
  return errorResult(lines.join("\n"));
}

/**
 * A 2xx whose body is not JSON: something other than the OrcaRouter API
 * answered (a web page, a captive portal, a proxy).
 */
export function notJsonText(reason: string): string {
  return (
    `the answer was not JSON (${bounded(reason)}). Check that ORCAROUTER_BASE_URL ` +
    `is OrcaRouter's API origin (https://api.orcarouter.ai on the hosted service).`
  );
}
