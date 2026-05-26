import type { ApiClient } from "../api_client.js";

export interface McpTextContent {
  type: "text";
  text: string;
}

export interface McpToolResult {
  content: McpTextContent[];
  isError?: boolean;
}

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
  [k: string]: unknown;
}

// Behavior hints declared on every tool (MCP spec 2025-06-18). These let
// clients reason about a tool before they call it — e.g. show a "read-only,
// safe to call without confirmation" badge, or route destructive operations
// through an approval workflow. Strictly additive: the schema is untouched.
export interface ToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDefinition<I = unknown> {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
  annotations?: ToolAnnotations;
  handler: (input: I, ctx: ToolContext) => Promise<McpToolResult>;
}

export interface ToolContext {
  client: ApiClient;
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function textResult(text: string): McpToolResult {
  return { content: [{ type: "text", text }] };
}
