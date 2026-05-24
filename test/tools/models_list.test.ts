import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { ApiClient } from "../../src/api_client.js";
import { modelsListTool } from "../../src/tools/models_list.js";

const BASE = "https://orcarouter.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Real /v1/models item shape. The list is anonymous and includes
// pricing + name + description when admin has curated metadata. The
// backend (v0.2.0+) applies provider / capability / min_context
// filters server-side; the SDK only forwards them.
const SAMPLE_MODELS = [
  {
    id: "openai/gpt-4o-mini",
    object: "model",
    created: 1715367049,
    owned_by: "openai",
    supported_endpoint_types: ["openai", "openai-response"],
    context_length: 128000,
    pricing: {
      prompt: "0.00000015",
      completion: "0.0000006",
      prompt_per_million: "0.150000",
      completion_per_million: "0.600000",
    },
  },
  {
    id: "anthropic/claude-3-haiku",
    object: "model",
    created: 1715367049,
    owned_by: "anthropic",
    supported_endpoint_types: ["anthropic", "openai"],
    context_length: 200000,
    pricing: {
      prompt: "0.00000025",
      completion: "0.00000125",
      prompt_per_million: "0.250000",
      completion_per_million: "1.250000",
    },
  },
];

describe("orcarouter_models_list", () => {
  it("declares correct metadata", () => {
    expect(modelsListTool.name).toBe("orcarouter_models_list");
    expect(modelsListTool.description).toMatch(/models/i);
  });

  it("works without an API key — /v1/models is anonymous", async () => {
    let auth: string | null | undefined = undefined;
    server.use(
      http.get(`${BASE}/v1/models`, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({ data: SAMPLE_MODELS });
      }),
    );
    const client = new ApiClient({ baseUrl: BASE });
    const r = await modelsListTool.handler({}, { client });
    expect(r.content[0].text).toContain("openai/gpt-4o-mini");
    // ApiClient must not send a bare Authorization header when no key
    // is configured — that would make backend reject with 401.
    expect(auth).toBeNull();
  });

  it("includes per-1M-token pricing for chat models", async () => {
    server.use(
      http.get(`${BASE}/v1/models`, () =>
        HttpResponse.json({ data: SAMPLE_MODELS }),
      ),
    );
    const client = new ApiClient({ baseUrl: BASE });
    const r = await modelsListTool.handler({}, { client });
    const text = r.content[0].text;
    expect(text).toContain('"prompt_per_million": "0.150000"');
    expect(text).toContain('"completion_per_million": "0.600000"');
  });

  it("returns full list when no filter", async () => {
    server.use(
      http.get(`${BASE}/v1/models`, () =>
        HttpResponse.json({ data: SAMPLE_MODELS }),
      ),
    );
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    const r = await modelsListTool.handler({}, { client });
    const text = r.content[0].text;
    expect(text).toContain("openai/gpt-4o-mini");
    expect(text).toContain("anthropic/claude-3-haiku");
  });

  it("forwards provider filter to backend as query param", async () => {
    let receivedQuery: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE}/v1/models`, ({ request }) => {
        receivedQuery = new URL(request.url).searchParams;
        return HttpResponse.json({ data: SAMPLE_MODELS });
      }),
    );
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await modelsListTool.handler({ provider: "openai" }, { client });
    expect(receivedQuery).not.toBeNull();
    expect(receivedQuery!.get("provider")).toBe("openai");
  });

  it("lowercases provider before forwarding", async () => {
    let receivedQuery: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE}/v1/models`, ({ request }) => {
        receivedQuery = new URL(request.url).searchParams;
        return HttpResponse.json({ data: SAMPLE_MODELS });
      }),
    );
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await modelsListTool.handler({ provider: " OpenAI " }, { client });
    expect(receivedQuery!.get("provider")).toBe("openai");
  });

  it("forwards capability filter to backend as query param", async () => {
    let receivedQuery: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE}/v1/models`, ({ request }) => {
        receivedQuery = new URL(request.url).searchParams;
        return HttpResponse.json({ data: SAMPLE_MODELS });
      }),
    );
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await modelsListTool.handler({ capability: "chat" }, { client });
    expect(receivedQuery!.get("capability")).toBe("chat");
  });

  it("forwards min_context filter to backend as query param", async () => {
    let receivedQuery: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE}/v1/models`, ({ request }) => {
        receivedQuery = new URL(request.url).searchParams;
        return HttpResponse.json({ data: SAMPLE_MODELS });
      }),
    );
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await modelsListTool.handler({ min_context: 128000 }, { client });
    expect(receivedQuery!.get("min_context")).toBe("128000");
  });

  it("forwards all three filters together", async () => {
    let receivedQuery: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE}/v1/models`, ({ request }) => {
        receivedQuery = new URL(request.url).searchParams;
        return HttpResponse.json({ data: SAMPLE_MODELS });
      }),
    );
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await modelsListTool.handler(
      { provider: "openai", capability: "chat", min_context: 100000 },
      { client },
    );
    expect(receivedQuery!.get("provider")).toBe("openai");
    expect(receivedQuery!.get("capability")).toBe("chat");
    expect(receivedQuery!.get("min_context")).toBe("100000");
  });

  it("does not forward absent or empty filter params", async () => {
    let receivedQuery: URLSearchParams | null = null;
    server.use(
      http.get(`${BASE}/v1/models`, ({ request }) => {
        receivedQuery = new URL(request.url).searchParams;
        return HttpResponse.json({ data: SAMPLE_MODELS });
      }),
    );
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await modelsListTool.handler(
      { provider: "   ", min_context: 0 },
      { client },
    );
    expect(receivedQuery!.has("provider")).toBe(false);
    expect(receivedQuery!.has("capability")).toBe(false);
    expect(receivedQuery!.has("min_context")).toBe(false);
  });

  it("handles empty result with a friendly message", async () => {
    server.use(
      http.get(`${BASE}/v1/models`, () =>
        HttpResponse.json({ data: [] }),
      ),
    );
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    const r = await modelsListTool.handler(
      { provider: "nonexistent" },
      { client },
    );
    expect(r.content[0].text).toMatch(/no models/i);
  });

  it("sends Authorization header to upstream", async () => {
    let auth: string | null = null;
    server.use(
      http.get(`${BASE}/v1/models`, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({ data: [] });
      }),
    );
    const client = new ApiClient({ apiKey: "sk-yes", baseUrl: BASE });
    await modelsListTool.handler({}, { client });
    expect(auth).toBe("Bearer sk-yes");
  });
});
