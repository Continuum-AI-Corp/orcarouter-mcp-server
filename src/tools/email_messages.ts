import { ApiError, MissingApiKeyError } from "../errors.js";
import { capabilityErrorResult, errorResult } from "./agent_capability.js";
import { textResult, type ToolDefinition } from "./types.js";

interface EmailMessagesInput {
  limit?: number;
}

// One row of GET /v1/agents/messages: metadata only, no body or attachment.
interface AgentMessageView {
  id?: number;
  channel?: string;
  direction?: string;
  status?: string;
  subject?: string;
  from?: string;
  to?: string[];
  cc?: string[];
  created_at?: number;
  [k: string]: unknown;
}

interface EmailMessagesEnvelope {
  success?: boolean;
  data?: AgentMessageView[];
  code?: string;
  message?: string;
}

const TOOL = "orcarouter_email_messages";

// The server reads `limit` as 1..200 and silently answers 100 for anything
// else, so the schema refuses what it would not honour.
const MAX_LIMIT = 200;

export const emailMessagesTool: ToolDefinition<EmailMessagesInput> = {
  name: TOOL,
  description:
    "List your OrcaRouter agent's messages, newest first: every outbound send " +
    "with its current status (accepted → sent / failed) and every inbound " +
    "email that passed the content guardrail (status released). Metadata " +
    "only — id, channel, direction, status, subject, from, to, cc, " +
    "created_at (unix seconds); no bodies or attachments. Use it to confirm a " +
    "send from orcarouter_email_send (match its message_id to `id`) and to " +
    "watch for replies. Requires an ORCAROUTER_API_KEY bound to an agent " +
    "(Console → Agents → API access).",
  annotations: {
    title: "List Agent Email Messages",
    // Reads the agent's own mailbox metadata; changes nothing.
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "integer",
        minimum: 1,
        maximum: MAX_LIMIT,
        description: `How many messages to return, 1–${MAX_LIMIT}. Server default 100.`,
      },
    },
    additionalProperties: false,
  },
  async handler(input, { client }) {
    if (!client.apiKey) {
      throw new MissingApiKeyError(TOOL);
    }
    const query: Record<string, string> = {};
    if (typeof input.limit === "number") {
      query.limit = String(input.limit);
    }

    let envelope: EmailMessagesEnvelope;
    try {
      envelope = await client.get<EmailMessagesEnvelope>("/v1/agents/messages", { query });
    } catch (e) {
      if (e instanceof ApiError) {
        return capabilityErrorResult("OrcaRouter email messages", e);
      }
      throw e;
    }

    if (!envelope || envelope.success === false || !Array.isArray(envelope.data)) {
      const code = envelope?.code ? `, code ${envelope.code}` : "";
      return errorResult(
        `OrcaRouter email messages failed (HTTP 200${code}): ` +
          `${envelope?.message || "the response carried no message list"}`,
      );
    }
    const rows = envelope.data;
    if (rows.length === 0) {
      return textResult("No messages for this agent yet.");
    }
    const summary = `Found ${rows.length} message${rows.length === 1 ? "" : "s"} (newest first):`;
    return textResult(`${summary}\n\n${JSON.stringify(rows, null, 2)}`);
  },
};
