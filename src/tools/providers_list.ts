import { ApiError } from "../errors.js";
import { textResult, type ToolDefinition, type McpToolResult } from "./types.js";

interface ProvidersListInput {}

interface PublicProviderEntry {
  provider_id: string;
  model_count: number;
  display_name?: string;
  icon_url?: string;
}

interface ProvidersListEnvelope {
  success?: boolean;
  message?: string;
  data?: {
    providers?: PublicProviderEntry[];
    unprefixed_model_count?: number;
  };
}

function errorResult(text: string): McpToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

export const providersListTool: ToolDefinition<ProvidersListInput> = {
  name: "orcarouter_providers_list",
  description:
    "List all model providers on OrcaRouter with their model counts and " +
    "display metadata. Works without an API key. Useful for discovering " +
    "provider ids (e.g. 'openai', 'anthropic') to pass to " +
    "orcarouter_models_list as the `provider` filter.",
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  async handler(_input, { client }): Promise<McpToolResult> {
    let body: ProvidersListEnvelope;
    try {
      body = await client.get<ProvidersListEnvelope>("/api/public/providers");
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 404) {
          return errorResult(
            "This OrcaRouter deployment does not expose provider discovery. " +
              "Use orcarouter_models_list to discover available models.",
          );
        }
        return errorResult(
          `Failed to fetch providers: ${e.message || `HTTP ${e.status}`}`,
        );
      }
      throw e instanceof Error
        ? new Error(`Failed to fetch providers: ${e.message}`, { cause: e })
        : e;
    }

    if (body == null || body.success === false || body.data == null) {
      const msg = (body && body.message) || "unknown";
      return errorResult(`Failed to fetch providers: ${msg}`);
    }

    if (!Array.isArray(body.data.providers)) {
      return errorResult(
        `Invalid response from OrcaRouter: 'providers' field is not an array.`,
      );
    }
    const providers = body.data.providers;
    const summary = `Found ${providers.length} providers:`;
    const json = JSON.stringify(body.data, null, 2);
    return textResult(`${summary}\n\n${json}`);
  },
};
