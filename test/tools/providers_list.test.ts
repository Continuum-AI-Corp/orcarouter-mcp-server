import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { ApiClient } from "../../src/api_client.js";
import { providersListTool } from "../../src/tools/providers_list.js";

const BASE = "https://orcarouter.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const SAMPLE_PAYLOAD = {
  success: true,
  data: {
    providers: [
      {
        provider_id: "openai",
        model_count: 24,
        display_name: "OpenAI",
        icon_url: "https://cdn.example/openai.svg",
      },
      {
        provider_id: "anthropic",
        model_count: 8,
        display_name: "Anthropic",
      },
    ],
    unprefixed_model_count: 3,
  },
};

describe("orcarouter_providers_list", () => {
  it("declares correct metadata", () => {
    expect(providersListTool.name).toBe("orcarouter_providers_list");
    expect(providersListTool.description).toMatch(/provider/i);
    expect(providersListTool.inputSchema.type).toBe("object");
  });

  it("happy path: unwraps envelope and renders JSON", async () => {
    server.use(
      http.get(`${BASE}/api/public/providers`, () =>
        HttpResponse.json(SAMPLE_PAYLOAD),
      ),
    );
    const client = new ApiClient({ baseUrl: BASE });
    const r = await providersListTool.handler({}, { client });
    const text = r.content[0].text;
    expect(text).toContain("Found 2 providers:");
    const jsonStart = text.indexOf("{");
    expect(jsonStart).toBeGreaterThan(-1);
    const parsed = JSON.parse(text.slice(jsonStart)) as typeof SAMPLE_PAYLOAD.data;
    expect(parsed.providers).toHaveLength(2);
    expect(parsed.providers?.[0].provider_id).toBe("openai");
    expect(parsed.providers?.[0].model_count).toBe(24);
    expect(parsed.unprefixed_model_count).toBe(3);
  });

  it("works without an API key", async () => {
    let auth: string | null = null;
    server.use(
      http.get(`${BASE}/api/public/providers`, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json(SAMPLE_PAYLOAD);
      }),
    );
    const client = new ApiClient({ baseUrl: BASE });
    await providersListTool.handler({}, { client });
    expect(auth).toBeNull();
  });

  it("returns friendly error on 404 (endpoint not deployed)", async () => {
    server.use(
      http.get(`${BASE}/api/public/providers`, () =>
        HttpResponse.json({ message: "not found" }, { status: 404 }),
      ),
    );
    const client = new ApiClient({ baseUrl: BASE });
    const r = await providersListTool.handler({}, { client });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/does not expose provider discovery/i);
  });

  it("returns error on success:false envelope", async () => {
    server.use(
      http.get(`${BASE}/api/public/providers`, () =>
        HttpResponse.json({ success: false, message: "internal" }),
      ),
    );
    const client = new ApiClient({ baseUrl: BASE });
    const r = await providersListTool.handler({}, { client });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/failed to fetch providers/i);
    expect(r.content[0].text).toMatch(/internal/);
  });

  it("returns error on 5xx", async () => {
    server.use(
      http.get(`${BASE}/api/public/providers`, () =>
        HttpResponse.json({ message: "boom" }, { status: 500 }),
      ),
    );
    const client = new ApiClient({ baseUrl: BASE });
    const r = await providersListTool.handler({}, { client });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/failed to fetch providers/i);
  });

  it("handles empty providers array gracefully", async () => {
    server.use(
      http.get(`${BASE}/api/public/providers`, () =>
        HttpResponse.json({ success: true, data: { providers: [] } }),
      ),
    );
    const client = new ApiClient({ baseUrl: BASE });
    const r = await providersListTool.handler({}, { client });
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toContain("Found 0 providers:");
  });
});
