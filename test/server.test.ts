import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { createOrcaRouterMcpServer, listToolNames } from "../src/server.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE = "https://orcarouter.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const EXPECTED_TOOLS = [
  "orcarouter_chat",
  "orcarouter_models_list",
  "orcarouter_model_card",
  "orcarouter_providers_list",
];

describe("createOrcaRouterMcpServer", () => {
  it("registers exactly the four expected tools", () => {
    const names = listToolNames();
    expect(new Set(names)).toEqual(new Set(EXPECTED_TOOLS));
    expect(names.length).toBe(4);
  });

  it("returns an MCP Server instance", () => {
    const built = createOrcaRouterMcpServer({ apiKey: "k", baseUrl: BASE });
    expect(built.server).toBeDefined();
    expect(typeof built.server.connect).toBe("function");
  });

  it("each tool has a non-empty description and an object input schema", async () => {
    const { server: srv } = createOrcaRouterMcpServer({ apiKey: "k", baseUrl: BASE });
    // call internal _requestHandlers via setRequestHandler — instead exercise via mock transport
    const transport = new MockTransport();
    await srv.connect(transport);
    const resp = await transport.send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    expect(resp.result?.tools).toBeDefined();
    const tools = resp.result.tools as Array<{
      name: string;
      description?: string;
      inputSchema: { type: string };
    }>;
    expect(tools.length).toBe(4);
    for (const t of tools) {
      expect(typeof t.description).toBe("string");
      expect((t.description as string).length).toBeGreaterThan(0);
      expect(t.inputSchema.type).toBe("object");
    }
    await transport.close();
  });

  it("tools/list response includes MCP annotations on every tool", async () => {
    const { server: srv } = createOrcaRouterMcpServer({ apiKey: "k", baseUrl: BASE });
    const transport = new MockTransport();
    await srv.connect(transport);
    const resp = await transport.send({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
      params: {},
    });
    interface AnnotatedTool {
      name: string;
      annotations?: {
        title?: string;
        readOnlyHint?: boolean;
        destructiveHint?: boolean;
        idempotentHint?: boolean;
        openWorldHint?: boolean;
      };
    }
    const tools = resp.result.tools as AnnotatedTool[];
    // Every catalog tool is read-only + idempotent; chat alone is not.
    const expected: Record<string, { readOnly: boolean; idempotent: boolean }> = {
      orcarouter_chat: { readOnly: false, idempotent: false },
      orcarouter_models_list: { readOnly: true, idempotent: true },
      orcarouter_model_card: { readOnly: true, idempotent: true },
      orcarouter_providers_list: { readOnly: true, idempotent: true },
    };
    for (const t of tools) {
      const exp = expected[t.name];
      expect(exp, `missing expected annotations for ${t.name}`).toBeDefined();
      expect(t.annotations, `missing annotations on ${t.name}`).toBeDefined();
      expect(t.annotations!.title, `missing title on ${t.name}`).toBeTruthy();
      expect(t.annotations!.readOnlyHint).toBe(exp.readOnly);
      expect(t.annotations!.destructiveHint).toBe(false);
      expect(t.annotations!.idempotentHint).toBe(exp.idempotent);
      // Every tool reaches an external service (OrcaRouter API or upstream LLM).
      expect(t.annotations!.openWorldHint).toBe(true);
    }
    await transport.close();
  });

  it("dispatches tools/call to the correct handler (model_card)", async () => {
    server.use(
      http.get(`${BASE}/api/public/models/openai/gpt-4o-mini`, () =>
        HttpResponse.json({
          success: true,
          data: {
            model_name: "openai/gpt-4o-mini",
            provider_slug: "openai",
            slug: "gpt-4o-mini",
            display_name: "GPT-4o mini",
            context_window: 128000,
            supported_endpoints: [
              { type: "chat_completions", method: "POST", path: "/v1/chat/completions" },
            ],
            pricing: { quota_type: 0, currency: "USD" },
          },
        }),
      ),
    );
    const built = createOrcaRouterMcpServer({ apiKey: "k", baseUrl: BASE });
    const transport = new MockTransport();
    await built.server.connect(transport);

    const resp = await transport.send({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "orcarouter_model_card",
        arguments: { model: "openai/gpt-4o-mini" },
      },
    });
    expect(resp.result?.content?.[0]?.text).toContain("openai/gpt-4o-mini");
    expect(resp.result?.content?.[0]?.text).toContain("128000");
    await transport.close();
  });

  it("unknown tool name returns an error result", async () => {
    const built = createOrcaRouterMcpServer({ apiKey: "k", baseUrl: BASE });
    const transport = new MockTransport();
    await built.server.connect(transport);

    const resp = await transport.send({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "does_not_exist", arguments: {} },
    });
    expect(resp.result?.isError || resp.error).toBeTruthy();
    await transport.close();
  });

  it("tool that hits API error returns error result (not unhandled rejection)", async () => {
    server.use(
      http.get(`${BASE}/v1/models`, () =>
        HttpResponse.json({ error: { message: "no" } }, { status: 401 }),
      ),
    );
    const built = createOrcaRouterMcpServer({ apiKey: "bad", baseUrl: BASE });
    const transport = new MockTransport();
    await built.server.connect(transport);

    const resp = await transport.send({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: "orcarouter_models_list", arguments: {} },
    });
    expect(resp.result?.isError).toBe(true);
    expect(resp.result?.content?.[0]?.text).toMatch(/no|401|auth/i);
    await transport.close();
  });

  it("validates tools/list request via MCP schemas (sanity)", () => {
    expect(ListToolsRequestSchema).toBeDefined();
    expect(CallToolRequestSchema).toBeDefined();
  });

  it("rejects tools/call with additionalProperties via inputSchema validation", async () => {
    const built = createOrcaRouterMcpServer({ apiKey: "k", baseUrl: BASE });
    const transport = new MockTransport();
    await built.server.connect(transport);

    const resp = await transport.send({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "orcarouter_model_card",
        arguments: {
          model: "openai/gpt-4o-mini",
          unexpected_field: 1,
        },
      },
    });
    expect(resp.result?.isError).toBe(true);
    const text = resp.result?.content?.[0]?.text ?? "";
    expect(text).toMatch(/invalid input|additional|unexpected_field/i);
    await transport.close();
  });

  it("rejects tools/call with wrong type via inputSchema validation", async () => {
    const built = createOrcaRouterMcpServer({ apiKey: "k", baseUrl: BASE });
    const transport = new MockTransport();
    await built.server.connect(transport);

    const resp = await transport.send({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "orcarouter_model_card",
        arguments: { model: 42 },
      },
    });
    expect(resp.result?.isError).toBe(true);
    const text = resp.result?.content?.[0]?.text ?? "";
    expect(text).toMatch(/invalid input/i);
    await transport.close();
  });

  it("formats RateLimitError with retryAfter seconds", async () => {
    server.use(
      http.get(`${BASE}/v1/models`, () =>
        HttpResponse.json(
          { error: { message: "slow down" } },
          { status: 429, headers: { "Retry-After": "30" } },
        ),
      ),
    );
    const built = createOrcaRouterMcpServer({ apiKey: "k", baseUrl: BASE });
    const transport = new MockTransport();
    await built.server.connect(transport);

    const resp = await transport.send({
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "orcarouter_models_list", arguments: {} },
    });
    expect(resp.result?.isError).toBe(true);
    const text = resp.result?.content?.[0]?.text ?? "";
    expect(text).toMatch(/rate limit/i);
    expect(text).toMatch(/30 second/i);
    await transport.close();
  });

  it("formats 402 insufficient_quota with billing link", async () => {
    server.use(
      http.get(`${BASE}/v1/models`, () =>
        HttpResponse.json(
          { error: { message: "no quota", code: "insufficient_quota" } },
          { status: 402 },
        ),
      ),
    );
    const built = createOrcaRouterMcpServer({ apiKey: "k", baseUrl: BASE });
    const transport = new MockTransport();
    await built.server.connect(transport);

    const resp = await transport.send({
      jsonrpc: "2.0",
      id: 8,
      method: "tools/call",
      params: { name: "orcarouter_models_list", arguments: {} },
    });
    expect(resp.result?.isError).toBe(true);
    const text = resp.result?.content?.[0]?.text ?? "";
    expect(text).toMatch(/quota/i);
    expect(text).toMatch(/orcarouter\.ai\/console\/billing/i);
    await transport.close();
  });
});

class MockTransport {
  private onMessageCb: ((msg: unknown) => void) | undefined;
  private pending = new Map<number | string, (resp: any) => void>();
  sessionId?: string;
  setProtocolVersion?: (v: string) => void;

  async start(): Promise<void> {
    return;
  }
  async close(): Promise<void> {
    if (this.onclose) this.onclose();
  }
  async send(message: any): Promise<any> {
    // If it's a request from the client (has id + method), forward to handlers and await reply
    if (typeof message === "object" && message && "id" in message && "method" in message) {
      return new Promise<any>((resolve) => {
        this.pending.set(message.id, resolve);
        // Deliver to server side
        this.onmessage?.(message);
      });
    }
    // If it's a response back to a client request, match against pending
    if (typeof message === "object" && message && "id" in message && !("method" in message)) {
      const cb = this.pending.get(message.id);
      if (cb) {
        this.pending.delete(message.id);
        cb(message);
      }
      return;
    }
    // Notifications: drop
    return;
  }
  onclose?: () => void;
  onerror?: (e: Error) => void;
  onmessage?: (message: unknown) => void;
}
