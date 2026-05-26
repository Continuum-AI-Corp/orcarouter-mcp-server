import { ApiError } from "../errors.js";
import { textResult, ValidationError, type ToolDefinition, type McpToolResult } from "./types.js";

interface ModelCardInput {
  model: string;
}

interface PublicEndpointDTO {
  type?: string;
  method?: string;
  path?: string;
}

interface PublicPricingDTO {
  quota_type?: number;
  currency?: string;
  per_call_usd?: number;
  input_per_million_usd?: number;
  output_per_million_usd?: number;
  cache_read_per_million_usd?: number | null;
  cache_write_per_million_usd?: number | null;
}

interface PublicLatencyDTO {
  p50_ms?: number;
  p95_ms?: number;
  output_tok_per_sec?: number;
  error_rate_percent?: number;
  window_days?: number;
}

// Response data shape from GET /api/public/models/{provider}/{slug}
// (mirrors the OrcaRouter backend's PublicModelDTO).
interface PublicModelDTO {
  model_name?: string;
  slug?: string;
  provider_slug?: string;
  display_name?: string;
  long_description?: string;
  context_window?: number;
  max_output?: number;
  modalities_in?: string[];
  modalities_out?: string[];
  release_date?: string;
  supported_endpoints?: PublicEndpointDTO[];
  pricing?: PublicPricingDTO;
  latency?: PublicLatencyDTO;
  [k: string]: unknown;
}

// The endpoint always wraps the payload: success -> { success, data },
// failure -> { success: false, message } (HTTP 200 or 404).
interface ModelCardEnvelope {
  success?: boolean;
  message?: string;
  data?: PublicModelDTO;
}

function errorResult(text: string): McpToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

export const modelCardTool: ToolDefinition<ModelCardInput> = {
  name: "orcarouter_model_card",
  description:
    "Get detailed information about a single model — display name, long " +
    "description, pricing (per-call and per-million tokens), context window, " +
    "max output, modalities (input/output), supported endpoints, latency " +
    "percentiles (p50/p95), and release date. Use this when you already know " +
    "the model id and want full details; for browsing or filtering across " +
    "many models use orcarouter_models_list instead. Returns isError:true " +
    "with a clear hint when the id is not found. Read-only, no API key " +
    "required.",
  annotations: {
    title: "OrcaRouter Model Card",
    // Single-model lookup against the public catalog. Read-only, deterministic
    // for a given id, contacts the OrcaRouter API (open world), no mutation.
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: "object",
    properties: {
      model: {
        type: "string",
        description:
          "Model ref in `provider/slug` form (e.g. `openai/gpt-4o-mini`, " +
          "`anthropic/claude-haiku-4.5`). Use the exact `id` value " +
          "returned by orcarouter_models_list.",
      },
    },
    required: ["model"],
    additionalProperties: false,
  },
  async handler(input, { client }): Promise<McpToolResult> {
    if (typeof input.model !== "string" || input.model.trim().length === 0) {
      throw new ValidationError("model must be a non-empty string");
    }
    const ref = input.model.trim();
    const slashIdx = ref.indexOf("/");

    // The public detail route has two shapes:
    //   /api/public/models/:provider/:slug — for provider-prefixed ids
    //     (most upstream catalog entries, e.g. openai/gpt-4o-mini)
    //   /api/public/models/:provider       — single-segment fallback for
    //     bare model names the backend still emits (moonshot's kimi-k2.5,
    //     ai360's 360gpt-pro, admin-configured bare ratios). Without this
    //     branch the documented list → card workflow breaks on those ids.
    // Leading or trailing slashes never resolve and are rejected up front.
    let urlPath: string;
    if (slashIdx === -1) {
      urlPath = `/api/public/models/${encodeURIComponent(ref)}`;
    } else if (slashIdx === 0 || slashIdx === ref.length - 1) {
      throw new ValidationError(
        `model must not start or end with '/'; got: ${input.model}`,
      );
    } else {
      const provider = encodeURIComponent(ref.slice(0, slashIdx));
      const slug = encodeURIComponent(ref.slice(slashIdx + 1));
      urlPath = `/api/public/models/${provider}/${slug}`;
    }

    let body: ModelCardEnvelope;
    try {
      body = await client.get<ModelCardEnvelope>(urlPath);
    } catch (e) {
      // Failure responses are returned as { success:false, message } with
      // HTTP 404 (model not found) or 500. ApiError.message is already
      // extracted from the envelope's `message` field by the client.
      if (e instanceof ApiError) {
        const msg = e.message || "";
        if (e.status === 404 || /not found/i.test(msg)) {
          return errorResult(
            `Model not found: ${ref}. ` +
              `Check the model id, or use orcarouter_models_list to discover available models.`,
          );
        }
        return errorResult(
          `Failed to fetch model card for ${ref}: ${msg || `HTTP ${e.status}`}`,
        );
      }
      throw e instanceof Error
        ? new Error(`Failed to fetch model card for ${ref}: ${e.message}`, {
            cause: e,
          })
        : e;
    }

    // Unwrap the { success, data } envelope. A success:false body can also
    // arrive with HTTP 200 (e.g. "missing slug").
    if (body == null || body.success === false || body.data == null) {
      const msg = (body && body.message) || "";
      if (/not found/i.test(msg) || msg === "") {
        return errorResult(
          `Model not found: ${ref}. ` +
            `Check the model id, or use orcarouter_models_list to discover available models.`,
        );
      }
      return errorResult(`Failed to fetch model card for ${ref}: ${msg}`);
    }

    // Emit the full PublicModelDTO as JSON inside the text payload,
    // preceded by a one-line `Model card for X:` summary. Same JSON-in-
    // text convention used by orcarouter_models_list so callers can pluck
    // precise fields (pricing.input_per_million_usd, latency.p50_ms, ...)
    // without parsing prose.
    const summary = `Model card for ${ref}:`;
    const json = JSON.stringify(body.data, null, 2);
    return textResult(`${summary}\n\n${json}`);
  },
};
