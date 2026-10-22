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
  /** OrcaRouter's code for the failure, wherever its answer put it. */
  code?: string;
  /** The JSON envelope without its redundant `success: false`; {} if none. */
  body: Record<string, unknown>;
  /** Whether the answer was a JSON object at all. */
  json: boolean;
  /** The message, bounded (MAX_MESSAGE). */
  message: string;
  /** Seconds, on a 429 that said. */
  retryAfter?: number;
}

// A proxy or WAF in front of OrcaRouter can answer with a whole HTML page,
// which the client then reports as the message; the agent needs its first
// line, not 50 KB of markup in its context.
const MAX_MESSAGE = 300;

// Cut by code point, so an emoji at the edge is not split into half a
// surrogate pair.
function bounded(text: string): string {
  const flat = Array.from(text.replace(/\s+/g, " ").trim());
  return flat.length > MAX_MESSAGE ? `${flat.slice(0, MAX_MESSAGE).join("")}…` : flat.join("");
}

// Every string in a JSON error body is bounded, not only `message`: a WAF can
// put its page in `error`, `detail` or a nested field just as well.
function boundedJson(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return bounded(value);
  if (depth >= 4 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => boundedJson(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = boundedJson(v, depth + 1);
  }
  return out;
}

// OrcaRouter's codes are identifiers (send_in_progress, agent_binding_required,
// system_cpu_overloaded). A proxy's `{ "error": "upstream request timeout" }`
// is prose, and reading it as a code would hide that the answer did not come
// from OrcaRouter at all.
const CODE = /^[a-z][a-z0-9_]*$/;

// Where OrcaRouter puts the code: `code` on the capability handlers' own
// answers; `error` on the agent-binding middleware's refusal
// (`{ error: "agent_binding_required", reason }`); `error.code` on the
// OpenAI-shaped refusals of the middleware in front of every relay route
// (`{ error: { code: "system_cpu_overloaded", message } }`).
function codeOf(body: Record<string, unknown>): string | undefined {
  const inner =
    body.error && typeof body.error === "object" && !Array.isArray(body.error)
      ? (body.error as Record<string, unknown>).code
      : undefined;
  for (const v of [body.code, body.error, inner]) {
    if (typeof v === "string" && CODE.test(v)) return v;
  }
  return undefined;
}

export function readCapabilityFailure(err: ApiError): CapabilityFailure {
  const json = !!err.body && typeof err.body === "object" && !Array.isArray(err.body);
  const body = json ? { ...(err.body as Record<string, unknown>) } : {};
  delete body.success;
  return {
    status: err.status,
    code: codeOf(body),
    body,
    json,
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
  const details: Record<string, unknown> = {
    status: f.status,
    ...(boundedJson(f.body) as Record<string, unknown>),
  };
  if (f.retryAfter !== undefined) {
    details.retry_after = f.retryAfter;
  }
  // A page that was not JSON (a proxy's HTML or text) is quoted once, bounded,
  // in the summary; there is no envelope to repeat it in.
  const head =
    `${action} failed (HTTP ${f.status}${f.code ? `, code ${f.code}` : ""})` +
    (f.message && f.message !== f.code ? `: ${f.message}` : ".");
  const lines = [head];
  const next =
    hint?.(f) ?? (f.code === "agent_binding_required" ? BIND_HINT : undefined);
  if (next) lines.push(next);
  if (f.json || f.retryAfter !== undefined) {
    lines.push("", JSON.stringify(details, null, 2));
  }
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

/**
 * A 2xx that carried no result: an empty answer, or an envelope without
 * `data` (or with `success: false`). The client does not expose the status,
 * so none is claimed.
 */
export function missingResultText(
  action: string,
  envelope: { code?: string; message?: string } | undefined,
): string {
  const code = envelope?.code ? ` (code ${envelope.code})` : "";
  const message = envelope?.message ? `: ${bounded(envelope.message)}` : "";
  return `${action}: OrcaRouter's answer carried no result${code}${message}.`;
}
