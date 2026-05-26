import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { ApiClient } from "./api_client.js";
import {
  ApiError,
  InsufficientQuotaError,
  MissingApiKeyError,
  PermissionDeniedError,
  RateLimitError,
} from "./errors.js";
import type { ToolDefinition, ToolContext } from "./tools/types.js";
import { ValidationError } from "./tools/types.js";
import { chatTool } from "./tools/chat.js";
import { modelCardTool } from "./tools/model_card.js";
import { modelsListTool } from "./tools/models_list.js";
import { providersListTool } from "./tools/providers_list.js";

const TOOLS: ToolDefinition<any>[] = [
  chatTool,
  modelsListTool,
  modelCardTool,
  providersListTool,
];

export function listToolNames(): string[] {
  return TOOLS.map((t) => t.name);
}

export interface CreateServerOptions {
  apiKey?: string;
  baseUrl?: string;
  serverName?: string;
  serverVersion?: string;
  timeoutMs?: number;
}

export interface BuiltServer {
  server: Server;
  client: ApiClient;
}

function buildValidators(): Map<string, ValidateFunction> {
  // Ajv's CommonJS default export interop differs across bundlers; tolerate both.
  const AjvCtor: typeof Ajv = ((Ajv as unknown as { default?: typeof Ajv }).default ??
    Ajv) as typeof Ajv;
  const addFmt = (addFormats as unknown as { default?: typeof addFormats }).default ??
    addFormats;
  const ajv = new AjvCtor({ allErrors: true, strict: false });
  addFmt(ajv);
  const map = new Map<string, ValidateFunction>();
  for (const t of TOOLS) {
    map.set(t.name, ajv.compile(t.inputSchema));
  }
  return map;
}

export function createOrcaRouterMcpServer(opts: CreateServerOptions = {}): BuiltServer {
  const client = new ApiClient({
    apiKey: opts.apiKey,
    baseUrl: opts.baseUrl,
    timeoutMs: opts.timeoutMs,
  });

  const ctx: ToolContext = {
    client,
  };

  const validators = buildValidators();

  const server = new Server(
    {
      name: opts.serverName ?? "@orcarouter/mcp",
      version: opts.serverVersion ?? "1.1.2",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
        ...(t.annotations ? { annotations: t.annotations } : {}),
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (req): Promise<any> => {
    const name = req.params.name;
    const args = req.params.arguments ?? {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Unknown tool: ${name}` },
        ],
      };
    }
    const validate = validators.get(name);
    if (validate && !validate(args)) {
      return {
        isError: true,
        content: [
          { type: "text", text: `Invalid input: ${formatAjvErrors(validate)}` },
        ],
      };
    }
    try {
      const result = await tool.handler(args, ctx);
      return result;
    } catch (e) {
      const msg = formatToolError(e);
      return {
        isError: true,
        content: [{ type: "text", text: msg }],
      };
    }
  });

  return { server, client };
}

function formatAjvErrors(validate: ValidateFunction): string {
  const errs = validate.errors ?? [];
  if (errs.length === 0) return "schema validation failed";
  return errs
    .map((e) => {
      const path = e.instancePath || "(root)";
      const detail =
        e.keyword === "additionalProperties" && e.params && "additionalProperty" in e.params
          ? `unexpected property '${(e.params as { additionalProperty: string }).additionalProperty}'`
          : e.message ?? "invalid";
      return `${path} ${detail}`;
    })
    .join("; ");
}

function formatToolError(err: unknown): string {
  if (err instanceof MissingApiKeyError) return err.message;
  if (err instanceof ValidationError) return `Invalid input: ${err.message}`;
  if (err instanceof RateLimitError) {
    const seconds = err.retryAfter;
    if (typeof seconds === "number" && Number.isFinite(seconds)) {
      return `OrcaRouter rate limited (429). Retry after ${seconds} seconds.`;
    }
    return `OrcaRouter rate limited (429). Retry shortly.`;
  }
  if (err instanceof InsufficientQuotaError) {
    return "OrcaRouter quota exhausted. Top up at https://orcarouter.ai/console/billing.";
  }
  if (err instanceof PermissionDeniedError) {
    return `OrcaRouter permission denied (403): ${err.message}`;
  }
  if (err instanceof ApiError) {
    return `OrcaRouter API error (${err.status}): ${err.message}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}
