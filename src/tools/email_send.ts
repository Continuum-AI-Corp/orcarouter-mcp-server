import { ApiError, MissingApiKeyError } from "../errors.js";
import {
  capabilityErrorResult,
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
  to: string[];
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
// controller/agent_capability.go agentRunRefHeader).
const RUN_REF_HEADER = "X-Orca-Run-Ref";

// When the send's fate is unknown — no answer, or an answer that did not come
// from the send handler — the only safe retry reuses the key.
function unknownOutcome(clientRef?: string): string {
  const next = clientRef
    ? `Retry with the same client_ref "${clientRef}": OrcaRouter returns the send that landed, or answers send_in_progress.`
    : "This call carried no client_ref, so a retry could send it twice: check orcarouter_email_messages for it first, and pass a client_ref next time.";
  return `The outcome is unknown — the email may or may not have been sent. ${next}`;
}

// What to do next, by the server's code. The two 409s ask for opposite
// things: the key of a send still in flight (or of unknown outcome) must be
// reused, or the email goes out twice; the key of a failed send can never
// succeed again.
function sendHint(f: CapabilityFailure, clientRef?: string): string | undefined {
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
      const poll =
        messageId !== undefined
          ? `, or poll orcarouter_email_messages until message ${messageId} reads sent or failed`
          : "";
      return `This send may still land: ${retry}${poll}.`;
    }
    case "send_key_burned":
      return "That client_ref is spent (its send failed): retry with a new client_ref.";
    case "provider_send_failed":
      return "The provider refused this message, so it was not sent, and this client_ref is now spent: a retry needs a new client_ref.";
    case "internal_error":
      return "Nothing reached the provider: retry with the same client_ref (back off first).";
    case "guardrail_unavailable":
      return "The content policy could not be evaluated, so nothing was sent: retry later with the same client_ref.";
    case undefined:
      if (f.status === 429) {
        const after = f.retryAfter !== undefined ? ` after ${f.retryAfter} s` : " shortly";
        return `Rate limited before the send ran, so nothing was sent: retry${after} with the same client_ref.`;
      }
      // A 5xx with no OrcaRouter code came from something in front of the
      // send handler (an edge or proxy timeout), possibly after the handler
      // had already called the provider.
      if (f.status >= 500) {
        return `No OrcaRouter error code came back, so this answer may be from a proxy in front of it. ${unknownOutcome(clientRef)}`;
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
        minItems: 1,
        description: "Recipient email addresses (at least one).",
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
          "Idempotency key, stored verbatim. Use a stable value tied 1:1 to " +
          "this logical send (e.g. `task-1234`), never a timestamp. Same key " +
          "after a sent send → the original result; while still sending → " +
          "code send_in_progress (retry with this key); after a failed send " +
          "→ code send_key_burned (retry with a new key).",
      },
      run_ref: {
        type: "string",
        minLength: 1,
        description:
          "A run reference your operator declared for this agent's run (a " +
          "spend envelope). The send is charged against that run and refused " +
          "once it is spent. Omit it unless you were given one: a run_ref " +
          "with no envelope declared has nothing to charge, so the send is " +
          "refused (code budget_exceeded).",
      },
    },
    required: ["to"],
    additionalProperties: false,
  },
  async handler(input, { client }) {
    if (!client.apiKey) {
      throw new MissingApiKeyError(TOOL);
    }
    // The schema says the same; kept for callers that skip it (the handler
    // is exported), as the chat tool does.
    if (
      !Array.isArray(input.to) ||
      input.to.length === 0 ||
      input.to.some((a) => typeof a !== "string" || a.length === 0)
    ) {
      throw new ValidationError("to must be a non-empty array of email addresses");
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

    // Only the fields the caller set: the server treats an absent field and
    // an empty one alike, and the request then shows exactly what was asked.
    const body: Record<string, unknown> = { to: input.to };
    for (const key of ["cc", "reply_to", "subject", "text", "html", "client_ref"] as const) {
      if (input[key] !== undefined) body[key] = input[key];
    }
    const headers: Record<string, string> = {};
    if (typeof input.run_ref === "string" && input.run_ref.length > 0) {
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
      const code = envelope?.code ? `, code ${envelope.code}` : "";
      return errorResult(
        `OrcaRouter email send failed (HTTP 200${code}): ` +
          `${envelope?.message || "the response carried no send result"}. ` +
          unknownOutcome(input.client_ref),
      );
    }
    const data = envelope.data;
    const summary = data.simulated
      ? "Simulated send (sandbox agent): nothing was sent and nothing was charged."
      : `Email send status: ${data.status ?? "unknown"}.`;
    return textResult(`${summary}\n\n${JSON.stringify(data, null, 2)}`);
  },
};
