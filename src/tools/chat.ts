import { MissingApiKeyError } from "../errors.js";
import { textResult, ValidationError, type ToolDefinition } from "./types.js";

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface ChatInput {
  // Optional — defaults to "orcarouter/auto" when absent or empty.
  model?: string;
  // Required, single-turn user message.
  prompt: string;
  // Optional system prompt prepended to the conversation.
  system_prompt?: string;
  // Optional fallback chain (primary auto-prepended, max 5 entries).
  models?: string[];
  temperature?: number;
  max_tokens?: number;
  // `stream` is intentionally not part of the schema; included here only as
  // defense-in-depth against clients that ignore the schema.
  stream?: boolean;
}

interface ChatCompletionChoice {
  message?: { role?: string; content?: unknown };
}

interface ChatCompletionResponse {
  id?: string;
  choices?: ChatCompletionChoice[];
  [k: string]: unknown;
}

const DEFAULT_MODEL = "orcarouter/auto";
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 10000;

// OpenAI's reasoning-model line (gpt-5 / o-series) rejects `max_tokens` and
// instead requires `max_completion_tokens` on the wire. This SDK-side helper
// translates a single `max_tokens` input field to the correct wire field so
// callers never have to think about it.
//
// Matches (case-insensitive) provider/<bare> or just <bare>:
//   gpt-5, gpt-5-mini, gpt-5-pro, gpt-5.1, gpt-5.5, gpt-5.2-thinking,
//   o1, o1-mini, o1-preview, o3, o3-mini, o3-pro, o4, o4-mini, ...
//
// The next char after `gpt-5` / `o[1-9]` must be `-` (suffix), `.` (dotted
// version like gpt-5.1), or end-of-string (bare).
export function isReasoningModel(modelId: string): boolean {
  const bare = modelId.split("/").pop() ?? modelId;
  return /^(gpt-5|o[1-9])([-.]|$)/i.test(bare);
}

function stringifyContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object") {
          const pp = p as { type?: string; text?: string };
          if (pp.type === "text" && typeof pp.text === "string") return pp.text;
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length > 0) return parts.join("\n");
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

export const chatTool: ToolDefinition<ChatInput> = {
  name: "orcarouter_chat",
  description:
    "Send a single-turn chat request to OrcaRouter. Default model is the " +
    "workspace's auto-router. Use `orcarouter/<name>` for other routers or " +
    "`<provider>/<model>` for direct calls. For OpenAI reasoning models " +
    "(gpt-5/o1/o3/...), max_tokens is automatically routed to " +
    "max_completion_tokens at the wire level.",
  inputSchema: {
    type: "object",
    properties: {
      model: {
        type: "string",
        default: DEFAULT_MODEL,
        description:
          "Model to call. Defaults to `orcarouter/auto` — your workspace's " +
          "seeded auto-router. Use `orcarouter/<name>` for other workspace " +
          "routers, or `<provider>/<model>` for direct upstream selection " +
          "(e.g. `openai/gpt-4o-mini`, `anthropic/claude-haiku-4.5`).",
      },
      prompt: {
        type: "string",
        description: "User message to send (single-turn).",
      },
      system_prompt: {
        type: "string",
        description: "Optional system prompt prepended to the conversation.",
      },
      max_tokens: {
        type: "integer",
        default: DEFAULT_MAX_TOKENS,
        description:
          "Maximum tokens to generate (default 10000). Automatically " +
          "translated to max_completion_tokens for OpenAI reasoning models.",
      },
      temperature: {
        type: "number",
        default: DEFAULT_TEMPERATURE,
        description: "Sampling temperature (default 0.7).",
      },
      models: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 5,
        description:
          "Optional fallback chain. Models are tried in order if the " +
          "primary fails. Max 5 entries including the primary.",
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  async handler(input, { client }) {
    if (!client.apiKey) {
      throw new MissingApiKeyError("orcarouter_chat");
    }

    // ------------------------------------------------------------------
    // model — optional, defaults to orcarouter/auto. Empty / whitespace-
    // only strings are treated as "absent" (Cursor and some clients send
    // an empty string rather than omitting the field).
    // ------------------------------------------------------------------
    const rawModel = typeof input.model === "string" ? input.model.trim() : "";
    const effectiveModel = rawModel.length > 0 ? rawModel : DEFAULT_MODEL;

    // ------------------------------------------------------------------
    // prompt — required, non-empty
    // ------------------------------------------------------------------
    if (typeof input.prompt !== "string" || input.prompt.length === 0) {
      throw new ValidationError("prompt must be a non-empty string");
    }
    if (
      input.system_prompt !== undefined &&
      (typeof input.system_prompt !== "string" ||
        input.system_prompt.length === 0)
    ) {
      throw new ValidationError(
        "system_prompt must be a non-empty string when provided",
      );
    }

    const effectiveMessages: ChatMessage[] =
      typeof input.system_prompt === "string"
        ? [
            { role: "system", content: input.system_prompt },
            { role: "user", content: input.prompt },
          ]
        : [{ role: "user", content: input.prompt }];

    // ------------------------------------------------------------------
    // models — optional fallback chain. Primary auto-prepended, deduped,
    // capped at 5 entries on the resulting effective chain.
    // ------------------------------------------------------------------
    let effectiveModels: string[] | undefined;
    if (input.models !== undefined) {
      if (!Array.isArray(input.models) || input.models.length === 0) {
        throw new ValidationError(
          "models must be a non-empty array of model slug strings",
        );
      }
      if (input.models.some((m) => typeof m !== "string" || m.length === 0)) {
        throw new ValidationError("each entry in models must be a non-empty string");
      }
      const chain = [
        effectiveModel,
        ...input.models.filter((m) => m !== effectiveModel),
      ];
      if (chain.length > 5) {
        throw new ValidationError(
          "the effective fallback chain (primary model + models) must not " +
            "exceed 5 entries; reduce the models array or omit the primary " +
            "from it",
        );
      }
      // Single fallback equal to primary collapses to a plain single-model
      // request — intentional, not an error.
      if (chain.length >= 2) {
        effectiveModels = chain;
      }
    }

    if (input.stream === true) {
      throw new ValidationError(
        "stream:true is not supported via MCP tools — MCP returns a single result. Set stream:false or omit.",
      );
    }

    // ------------------------------------------------------------------
    // Apply defaults: temperature=0.7, max_tokens=10000. max_tokens is
    // routed to max_completion_tokens at the wire for reasoning models.
    // ------------------------------------------------------------------
    const effectiveTemperature =
      typeof input.temperature === "number"
        ? input.temperature
        : DEFAULT_TEMPERATURE;

    const effectiveMaxTokens =
      typeof input.max_tokens === "number"
        ? input.max_tokens
        : DEFAULT_MAX_TOKENS;

    const body: Record<string, unknown> = {
      model: effectiveModel,
      messages: effectiveMessages,
      stream: false,
      temperature: effectiveTemperature,
    };

    if (isReasoningModel(effectiveModel)) {
      body.max_completion_tokens = effectiveMaxTokens;
    } else {
      body.max_tokens = effectiveMaxTokens;
    }

    if (effectiveModels && effectiveModels.length > 0) {
      body.extra_body = { models: effectiveModels, route: "fallback" };
    }

    const data = await client.post<ChatCompletionResponse>("/v1/chat/completions", body);
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    const text = stringifyContent(content ?? "");
    return textResult(text);
  },
};
