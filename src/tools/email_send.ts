import { ApiError, MissingApiKeyError } from "../errors.js";
import {
  capabilityErrorBody,
  capabilityErrorCode,
  capabilityErrorResult,
  errorResult,
} from "./agent_capability.js";
import { textResult, ValidationError, type ToolDefinition } from "./types.js";

interface EmailSendInput {
  to: string[];
  cc?: string[];
  reply_to?: string;
  subject?: string;
  text?: string;
  html?: string;
  client_ref?: string;
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

// What to do after a 409, which means opposite things by code: the key of a
// send still in flight (or of unknown outcome) must be reused, or the email
// goes out twice; the key of a failed send can never succeed again.
function conflictHint(err: ApiError, clientRef?: string): string | undefined {
  const code = capabilityErrorCode(err);
  const body = capabilityErrorBody(err);
  if (code === "send_in_progress") {
    const retryRef =
      typeof body.retry_ref === "string" && body.retry_ref.length > 0
        ? body.retry_ref
        : clientRef;
    const messageId = typeof body.message_id === "number" ? body.message_id : undefined;
    const retry = retryRef
      ? `retry with client_ref "${retryRef}" — a new client_ref would send the email a second time`
      : "retry with the same client_ref — a new one would send the email a second time";
    const poll =
      messageId !== undefined
        ? `, or poll orcarouter_email_messages until message ${messageId} reads sent or failed`
        : "";
    return `This send may still land: ${retry}${poll}.`;
  }
  if (code === "send_key_burned") {
    return "That client_ref is spent (its send failed): retry with a new client_ref.";
  }
  return undefined;
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
    "Failures come back as isError text carrying the server's `code` — branch " +
    "on it, not on the HTTP status: `send_in_progress` means retry with the " +
    "same client_ref (the `retry_ref` it returns), `send_key_burned` means use " +
    "a new one. Track delivery with orcarouter_email_messages. Requires an " +
    "ORCAROUTER_API_KEY bound to an agent (Console → Agents → API access) and " +
    "an email address provisioned for that agent.",
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
          "Subject line. At least one of subject, text or html must be non-empty.",
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
    },
    required: ["to"],
    additionalProperties: false,
  },
  async handler(input, { client }) {
    if (!client.apiKey) {
      throw new MissingApiKeyError(TOOL);
    }
    if (
      !Array.isArray(input.to) ||
      input.to.length === 0 ||
      input.to.some((a) => typeof a !== "string" || a.length === 0)
    ) {
      throw new ValidationError("to must be a non-empty array of email addresses");
    }
    const hasContent = [input.subject, input.text, input.html].some(
      (v) => typeof v === "string" && v.length > 0,
    );
    if (!hasContent) {
      throw new ValidationError(
        "at least one of subject, text or html must be non-empty",
      );
    }

    // Only the fields the caller set: the server treats an absent field and
    // an empty one alike, and the request then shows exactly what was asked.
    const body: Record<string, unknown> = { to: input.to };
    for (const key of ["cc", "reply_to", "subject", "text", "html", "client_ref"] as const) {
      if (input[key] !== undefined) body[key] = input[key];
    }

    let envelope: EmailSendEnvelope;
    try {
      envelope = await client.post<EmailSendEnvelope>("/v1/agents/email/send", body);
    } catch (e) {
      if (e instanceof ApiError) {
        return capabilityErrorResult(
          "OrcaRouter email send",
          e,
          conflictHint(e, input.client_ref),
        );
      }
      // No HTTP answer at all (timeout, connection reset, cancelled): the
      // send may or may not have reached the provider.
      const reason = e instanceof Error ? e.message : String(e);
      const next = input.client_ref
        ? `Retry with the same client_ref "${input.client_ref}": OrcaRouter returns the send that landed, or answers send_in_progress.`
        : "This call carried no client_ref, so a retry could send it twice: check orcarouter_email_messages for it first, and pass a client_ref next time.";
      return errorResult(
        `OrcaRouter email send: no answer from OrcaRouter (${reason}). ` +
          `The outcome is unknown — the email may or may not have been sent. ${next}`,
      );
    }

    if (!envelope || envelope.success === false || !envelope.data) {
      const code = envelope?.code ? `, code ${envelope.code}` : "";
      return errorResult(
        `OrcaRouter email send failed (HTTP 200${code}): ` +
          `${envelope?.message || "the response carried no send result"}`,
      );
    }
    const data = envelope.data;
    const summary = data.simulated
      ? "Simulated send (sandbox agent): nothing was sent and nothing was charged."
      : `Email send status: ${data.status ?? "unknown"}.`;
    return textResult(`${summary}\n\n${JSON.stringify(data, null, 2)}`);
  },
};
