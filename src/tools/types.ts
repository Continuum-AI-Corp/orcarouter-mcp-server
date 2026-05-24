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

export interface ToolDefinition<I = unknown> {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
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
