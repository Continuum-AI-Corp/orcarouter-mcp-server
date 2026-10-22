import { ApiError, MissingApiKeyError } from "../errors.js";
import {
  capabilityErrorResult,
  missingResultText,
  notJsonText,
  type CapabilityFailure,
} from "./agent_capability.js";
import {
  errorResult,
  textResult,
  ValidationError,
  type ToolDefinition,
} from "./types.js";

interface EmailSendInput {
  to?: string[];
  cc?: string[];
  reply_to?: string;
  subject?: string;
  text?: string;
  html?: string;
  client_ref?: string;
  run_ref?: string;
}

// POST /v1/agents/email/send answers `{ success: true, data }`; `simulated`
// is present (true) only for a sandbox agent, which sends nothing.
interface EmailSendData {
  message_id?: number;
  status?: string;
  simulated?: boolean;
  [k: string]: unknown;
}

interface EmailSendEnvelope {
  success?: boolean;
  data?: EmailSendData;
  code?: string;
  message?: string;
}

const TOOL = "orcarouter_email_send";

// The header the server reads a run reference from: the opt-in to charging
// the send against that run's spend envelope (OrcaRouter
// controller/agent_capability.go agentRunRefHeader, at most 191 bytes).
const RUN_REF_HEADER = "X-Orca-Run-Ref";

// A header value travels as Latin-1 and fetch trims its surrounding
// whitespace: a blank run_ref would arrive empty, which the server reads as
// no opt-in (the send charged outside the run the caller named), and a
// non-Latin-1 one throws before any request is made. So a run_ref is
// printable ASCII with no surrounding space, which reaches the server as
// written.
const RUN_REF = /^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/;
const RUN_REF_MAX = 191;

// OrcaRouter's middleware refuses before the send handler runs when the
// node is overloaded (OpenAI-shaped `error.code`): nothing was sent.
const OVERLOADED = new Set([
  "system_cpu_overloaded",
  "system_memory_overloaded",
  "system_disk_overloaded",
]);

// The 5xx codes the send handler itself answers, each with its own next step.
// Any other 5xx — no code at all, or one this tool does not know — may come
// from something in front of the handler after it called the provider.
const HANDLER_5XX = new Set([
  "provider_send_failed",
  "provider_unavailable",
  "internal_error",
  "guardrail_unavailable",
]);

// The characters Go's strings.TrimSpace strips, which is how the server reads
// a client_ref: JS whitespace plus U+0085 (NEL), which String.trim keeps.
const GO_SPACE = /^[\s\u0085]+|[\s\u0085]+$/g;

// When the send's fate is unknown — no answer, or an answer that did not come
// from the send handler — the only safe retry reuses the key.
function unknownOutcome(clientRef?: string): string {
  const next = clientRef
    ? `Retry with the same client_ref "${clientRef}": OrcaRouter returns the send that landed, or answers send_in_progress.`
    : "This call carried no client_ref, so a retry could send it twice: first look in orcarouter_email_messages for a send with this subject and recipients, and pass a client_ref next time.";
  return `The outcome is unknown — the email may or may not have been sent. ${next}`;
}

// What to do next, by the server's code. The two 409s ask for opposite
// things: the key of a send still in flight (or of unknown outcome) must be
// reused, or the email goes out twice; the key of a failed send can never
// succeed again.
function sendHint(f: CapabilityFailure, clientRef?: string): string | undefined {
  if (f.code && OVERLOADED.has(f.code)) {
    return "OrcaRouter refused before the send ran (overloaded), so nothing was sent: retry later with the same client_ref.";
  }
  if (f.status >= 500 && !(f.code && HANDLER_5XX.has(f.code))) {
    // An edge or proxy timeout in front of the send handler, possibly after
    // it had already called the provider.
    return `This answer did not come from OrcaRouter's send handler (it may be a proxy in front of it). ${unknownOutcome(clientRef)}`;
  }
  switch (f.code) {
    case "send_in_progress": {
      const retryRef =
        typeof f.body.retry_ref === "string" && f.body.retry_ref.length > 0
          ? f.body.retry_ref
          : clientRef;
      const messageId =
        typeof f.body.message_id === "number" ? f.body.message_id : undefined;
      const retry = retryRef
        ? `retry with client_ref "${retryRef}" — a new client_ref would send the email a second time`
        : "retry with the same client_ref — a new one would send the email a second time";
      const look =
        messageId !== undefined
          ? `, or look for message ${messageId} in orcarouter_email_messages`
          : "";
      // A send whose provider answer was lost stays `accepted`: nothing moves
      // it later, and the key keeps answering send_in_progress. Waiting for
      // sent/failed would never end, so the stopping point is said.
      return (
        `This send may already have landed, or may still: ${retry}${look}. ` +
        "If it keeps answering send_in_progress, or the message stays accepted, the outcome stays unknown: " +
        "do not re-send under a new client_ref unless a possible duplicate is acceptable — tell the operator."
      );
    }
    case "send_key_burned":
      return "That client_ref is spent (its send failed): retry with a new client_ref.";
    case "provider_send_failed":
      return "The provider refused this message, so it was not sent, and this client_ref is now spent: a retry needs a new client_ref.";
    case "internal_error":
      // A 500 means the provider was never called. If the retry then keeps
      // answering send_in_progress, the key's reservation is stuck, and the
      // way out is a new key (OrcaRouter's skill, "Errors").
      return f.status === 500
        ? "Nothing reached the provider: retry with the same client_ref (back off first). If that keeps answering send_in_progress long after any send could still be running, the key is stuck: because this 500 means the provider was never called, re-send under a new client_ref, and tell the operator."
        : "The spend policy could not be evaluated, so nothing was sent: back off and retry with the same client_ref.";
    case "guardrail_unavailable":
      return "The content policy could not be evaluated, so nothing was sent: retry later with the same client_ref.";
    case "provider_unavailable":
      return "No email provider is configured for this OrcaRouter deployment, so nothing was sent; retrying will not help until an operator fixes it.";
    case "blocked_by_guardrail":
      return "The workspace's content policy blocked this message: rewrite the subject or body. Retrying the same content is blocked again.";
    case "budget_exceeded":
      return "Out of money for this send (the workspace wallet, the agent's monthly cap, or the run's envelope), so nothing was sent; retrying will not help until it is topped up or the cap resets.";
    case "policy_declined":
      // `deny` carries the reason, the server's own hint, and an approval id
      // when a human has to approve. Whether a retry then passes is the
      // server's to say, so none is promised here.
      return "The workspace's spend policy declined this send, so nothing was sent: deny below says why, and gives the approval id when a human has to approve it.";
    case "all_recipients_suppressed":
      return "Every recipient is on the suppression list (a hard bounce or a complaint), so nothing was sent: the same recipients are refused again.";
    case "agent_not_active":
    case "no_capability_address":
      return "Nothing was sent. Once the agent is active with an email address, retry; if the same client_ref then answers send_key_burned, use a new one.";
    case undefined:
      if (f.status === 429) {
        const after = f.retryAfter !== undefined ? ` after ${f.retryAfter} s` : " shortly";
        return `Rate limited before the send ran, so nothing was sent: retry${after} with the same client_ref.`;
      }
      return undefined;
    default:
      return undefined;
  }
}

export const emailSendTool: ToolDefinition<EmailSendInput> = {
  name: TOOL,
  description:
    "Send an email as your OrcaRouter agent, from the agent's own provisioned " +
    "address — you supply recipients and content, never a sender. OrcaRouter " +
    "applies the workspace's spend policy, suppression list and content " +
    "guardrail before it dispatches. Pass a stable `client_ref` (e.g. " +
    "`task-1234`) whenever you might retry: a repeat with the same key returns " +
    "the original send instead of a second email. Returns the message id and " +
    "status; `simulated: true` means a sandbox agent, which sends nothing. " +
    "Failures come back as isError text carrying the server's `code` and what " +
    "to do next — branch on the code, not on the HTTP status: " +
    "`send_in_progress` means retry with the same client_ref (the `retry_ref` " +
    "it returns), `send_key_burned` means use a new one. Track delivery with " +
    "orcarouter_email_messages. Requires an ORCAROUTER_API_KEY bound to an " +
    "agent (Console → Agents → API access) and an email address provisioned " +
    "for that agent.",
  annotations: {
    title: "Send Email as Agent",
    // Sends real mail and may charge the workspace: not read-only, and not
    // idempotent unless the caller passes a client_ref. Additive, so not
    // destructive.
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
  inputSchema: {
    type: "object",
    properties: {
      to: {
        type: "array",
        items: { type: "string", minLength: 1 },
        description:
          "Recipient email addresses. to and cc together need at least one.",
      },
      cc: {
        type: "array",
        items: { type: "string", minLength: 1 },
        description: "CC recipient email addresses.",
      },
      reply_to: {
        type: "string",
        description: "Reply-To address. Must be a valid email address when set.",
      },
      subject: {
        type: "string",
        description:
          "Subject line. At least one of subject, text or html must be non-blank.",
      },
      text: {
        type: "string",
        description: "Plain-text body.",
      },
      html: {
        type: "string",
        description: "HTML body.",
      },
      client_ref: {
        type: "string",
        description:
          "Idempotency key; must not be blank. Use a stable value tied 1:1 to " +
          "this logical send (e.g. `task-1234`), never a timestamp. Same key " +
          "after a sent send → the original result; while still sending → " +
          "code send_in_progress (retry with this key); after a failed send " +
          "→ code send_key_burned (retry with a new key).",
      },
      run_ref: {
        type: "string",
        minLength: 1,
        maxLength: RUN_REF_MAX,
        description:
          "A run reference your operator declared for this agent's run (a " +
          "spend envelope). The send is charged against that run and refused " +
          "once it is spent. Omit it unless you were given one: a run_ref " +
          "with no envelope declared has nothing to charge, so the send is " +
          "refused (code budget_exceeded). Printable ASCII, no surrounding " +
          `spaces, at most ${RUN_REF_MAX} characters.`,
      },
    },
    additionalProperties: false,
  },
  async handler(input, { client }) {
    if (!client.apiKey) {
      throw new MissingApiKeyError(TOOL);
    }
    // Checked here as well as by the schema, for callers that skip it (the
    // handler is exported), as the chat tool does. The server takes to and cc
    // together: a Cc-only send is a send.
    const lists = [input.to, input.cc].filter((l) => l !== undefined);
    if (
      lists.some(
        (l) => !Array.isArray(l) || l.some((a) => typeof a !== "string" || a.length === 0),
      )
    ) {
      throw new ValidationError("to and cc must be arrays of email addresses");
    }
    if (lists.reduce((n, l) => n + (l as string[]).length, 0) === 0) {
      throw new ValidationError("at least one recipient is required, in to or cc");
    }
    // The server trims before it checks, so a blank subject is no content.
    const hasContent = [input.subject, input.text, input.html].some(
      (v) => typeof v === "string" && v.trim().length > 0,
    );
    if (!hasContent) {
      throw new ValidationError(
        "at least one of subject, text or html must be non-blank",
      );
    }
    // The server trims client_ref and mints a key of its own for a blank one,
    // so a blank key dedupes nothing — and "retry with the same client_ref"
    // would then send twice.
    if (
      input.client_ref !== undefined &&
      (typeof input.client_ref !== "string" ||
        input.client_ref.replace(GO_SPACE, "").length === 0)
    ) {
      throw new ValidationError(
        "client_ref must be a non-blank string: omit it, or pass a stable key such as task-1234",
      );
    }
    if (
      input.run_ref !== undefined &&
      (typeof input.run_ref !== "string" ||
        input.run_ref.length > RUN_REF_MAX ||
        !RUN_REF.test(input.run_ref))
    ) {
      throw new ValidationError(
        `run_ref must be printable ASCII with no surrounding spaces, at most ${RUN_REF_MAX} characters`,
      );
    }

    // Only the fields the caller set: the server treats an absent field and
    // an empty one alike, and the request then shows exactly what was asked.
    const body: Record<string, unknown> = {};
    for (const key of ["to", "cc", "reply_to", "subject", "text", "html", "client_ref"] as const) {
      if (input[key] !== undefined) body[key] = input[key];
    }
    const headers: Record<string, string> = {};
    if (input.run_ref !== undefined) {
      headers[RUN_REF_HEADER] = input.run_ref;
    }

    let envelope: EmailSendEnvelope;
    try {
      envelope = await client.post<EmailSendEnvelope>("/v1/agents/email/send", body, {
        headers,
      });
    } catch (e) {
      if (e instanceof ApiError) {
        return capabilityErrorResult("OrcaRouter email send", e, (f) =>
          sendHint(f, input.client_ref),
        );
      }
      if (e instanceof SyntaxError) {
        // A 2xx that is not JSON: an answer, but not the send handler's.
        return errorResult(
          `OrcaRouter email send: ${notJsonText(e.message)} ${unknownOutcome(input.client_ref)}`,
        );
      }
      // No HTTP answer at all (timeout, connection reset, cancelled): the
      // send may or may not have reached the provider.
      const reason = e instanceof Error ? e.message : String(e);
      return errorResult(
        `OrcaRouter email send: no answer from OrcaRouter (${reason}). ${unknownOutcome(input.client_ref)}`,
      );
    }

    if (!envelope || envelope.success === false || !envelope.data) {
      return errorResult(
        `${missingResultText("OrcaRouter email send", envelope)} ${unknownOutcome(input.client_ref)}`,
      );
    }
    const data = envelope.data;
    const summary = data.simulated
      ? "Simulated send (sandbox agent): nothing was sent and nothing was charged."
      : `Email send status: ${data.status ?? "unknown"}.`;
    return textResult(`${summary}\n\n${JSON.stringify(data, null, 2)}`);
  },
};
