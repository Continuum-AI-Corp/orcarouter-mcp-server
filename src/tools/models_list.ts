import { textResult, type ToolDefinition } from "./types.js";

type Capability = "chat" | "embedding" | "image" | "audio";

interface ModelsListInput {
  provider?: string;
  capability?: Capability;
  min_context?: number;
}

// Real /v1/models item shape. The list is anonymous (no API key
// required) and surfaces pricing, name, description, and other
// enriched metadata when the admin has curated it. orcarouter/*
// router aliases also appear alongside concrete models, declaring
// the legacy wire values for supported_endpoint_types.
interface ModelPricing {
  prompt?: string;
  completion?: string;
  prompt_per_million?: string;
  completion_per_million?: string;
  request?: string;
  image?: string;
}

interface ModelEntry {
  id?: string;
  object?: string;
  created?: number;
  owned_by?: string;
  supported_endpoint_types?: string[];
  context_length?: number;
  name?: string;
  description?: string;
  pricing?: ModelPricing;
  [k: string]: unknown;
}

interface ModelsListResponse {
  data: ModelEntry[];
}

export const modelsListTool: ToolDefinition<ModelsListInput> = {
  name: "orcarouter_models_list",
  description:
    "List LLM models in the OrcaRouter catalog. Each entry includes id, name, " +
    "description, owned_by, context_length, supported_endpoint_types, and " +
    "pricing (both per-token and per-million tokens). Filter by `provider`, " +
    "`capability`, or `min_context` — filters compose (all conditions must " +
    "match) and are applied server-side. Discover valid provider ids first " +
    "with orcarouter_providers_list. Returns the full catalog when called " +
    "without filters. Read-only, no API key required.",
  annotations: {
    title: "Browse OrcaRouter Models",
    // Read-only browse against the public catalog endpoint; same filters
    // yield the same set on every call (idempotent). External call → open
    // world, not destructive.
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  inputSchema: {
    type: "object",
    properties: {
      provider: {
        type: "string",
        description:
          "Provider id (lowercase, e.g. 'openai', 'anthropic'). Get the full list via orcarouter_providers_list.",
      },
      capability: {
        type: "string",
        enum: ["chat", "embedding", "image", "audio"],
        description: "Filter to models supporting this capability.",
      },
      min_context: {
        type: "integer",
        minimum: 1,
        description:
          "Filter to models with context window at least this large (tokens).",
      },
    },
    additionalProperties: false,
  },
  async handler(input, { client }) {
    // Filters are forwarded to the backend's /v1/models query string;
    // the SDK no longer applies a client-side predicate. Older backends
    // that ignore unknown query params will just return the unfiltered
    // list — callers should rely on a v0.2.0-compatible OrcaRouter
    // deployment for accurate filtering.
    const query: Record<string, string> = {};
    if (typeof input.provider === "string" && input.provider.trim()) {
      query.provider = input.provider.trim().toLowerCase();
    }
    if (typeof input.capability === "string" && input.capability.trim()) {
      query.capability = input.capability.trim().toLowerCase();
    }
    if (typeof input.min_context === "number" && input.min_context > 0) {
      query.min_context = String(input.min_context);
    }

    const data = await client.get<ModelsListResponse>("/v1/models", { query });
    const all = Array.isArray(data.data) ? data.data : [];

    if (all.length === 0) {
      const activeFilters: string[] = [];
      if (query.provider) activeFilters.push(`provider=${query.provider}`);
      if (query.capability) activeFilters.push(`capability=${query.capability}`);
      if (query.min_context) activeFilters.push(`min_context=${query.min_context}`);
      const hint =
        activeFilters.length > 0
          ? `No models match: ${activeFilters.join(", ")}`
          : `No models currently available.`;
      return textResult(hint);
    }

    // Emit the entries as a JSON array inside the text payload, preceded
    // by a one-line `Found N models:` summary. Shape mirrors the upstream
    // /v1/models response (id, name, description, context_length,
    // pricing, supported_endpoint_types, owned_by, ...) so LLM callers
    // can pluck precise fields (e.g. pricing.prompt_per_million for sort
    // / compare operations) instead of regex-ing values out of prose.
    // Pretty-printed (indent 2) for readability when surfaced to a
    // human-in-the-loop chat client.
    const summary = `Found ${all.length} model${all.length === 1 ? "" : "s"}:`;
    const json = JSON.stringify(all, null, 2);
    return textResult(`${summary}\n\n${json}`);
  },
};
