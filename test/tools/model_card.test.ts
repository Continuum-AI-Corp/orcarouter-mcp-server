import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { ApiClient } from "../../src/api_client.js";
import { modelCardTool } from "../../src/tools/model_card.js";
import { ValidationError } from "../../src/tools/types.js";

const BASE = "https://orcarouter.test";
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Real /api/public/models/{provider}/{slug} envelope: { success, data }
// where data is the OrcaRouter backend's PublicModelDTO.
const SAMPLE_DTO = {
  model_name: "openai/gpt-4o-mini",
  slug: "gpt-4o-mini",
  provider_slug: "openai",
  display_name: "GPT-4o mini",
  tagline: "",
  long_description: "OpenAI's small fast multimodal model.",
  context_window: 128000,
  max_output: 16384,
  modalities_in: ["text", "image"],
  modalities_out: ["text"],
  release_date: "2024-07-18",
  supported_endpoints: [
    { type: "chat_completions", method: "POST", path: "/v1/chat/completions" },
    { type: "openai_responses", method: "POST", path: "/v1/responses" },
  ],
  pricing: {
    quota_type: 0,
    currency: "USD",
    input_per_million_usd: 0.15,
    output_per_million_usd: 0.6,
  },
  latency: {
    p50_ms: 850,
    p95_ms: 1700,
    output_tok_per_sec: 92.5,
    error_rate_percent: 0.1,
    window_days: 7,
    evaluated_at: 0,
    source: "probe",
  },
  uptime: { percent_24h: 99.9, window_hours: 24, has_data: true },
  traffic: { tokens_7d: 0, window_days: 7 },
  benchmarks: [],
  sentiment: [],
  provider_peers: [],
  faqs: [],
  updated_at: 0,
};

describe("orcarouter_model_card", () => {
  it("declares correct metadata", () => {
    expect(modelCardTool.name).toBe("orcarouter_model_card");
    expect(modelCardTool.description).toMatch(/model/i);
    expect(modelCardTool.inputSchema.required).toEqual(["model"]);
  });

  it("happy path: unwraps {success,data} and renders JSON payload", async () => {
    server.use(
      http.get(`${BASE}/api/public/models/openai/gpt-4o-mini`, () =>
        HttpResponse.json({ success: true, data: SAMPLE_DTO }),
      ),
    );
    const client = new ApiClient({ baseUrl: BASE });
    const r = await modelCardTool.handler(
      { model: "openai/gpt-4o-mini" },
      { client },
    );
    const text = r.content[0].text;
    // Must NOT render undefined/undefined (the original envelope bug).
    expect(text).not.toContain("undefined");
    // Summary line is human-readable; payload follows as a JSON object.
    expect(text).toContain("Model card for openai/gpt-4o-mini:");
    // Parse the JSON portion and assert against structured fields rather
    // than substring-matching loose numbers.
    const jsonStart = text.indexOf("{");
    expect(jsonStart).toBeGreaterThan(-1);
    const parsed = JSON.parse(text.slice(jsonStart)) as typeof SAMPLE_DTO;
    expect(parsed.display_name).toBe("GPT-4o mini");
    expect(parsed.context_window).toBe(128000);
    expect(parsed.pricing.input_per_million_usd).toBe(0.15);
    expect(parsed.pricing.output_per_million_usd).toBe(0.6);
    expect(parsed.latency.p50_ms).toBe(850);
    expect(parsed.long_description).toContain("multimodal");
    expect(parsed.supported_endpoints[0].type).toBe("chat_completions");
  });

  it("success:false with not-found message returns friendly tool error", async () => {
    server.use(
      http.get(`${BASE}/api/public/models/zzz/missing`, () =>
        HttpResponse.json(
          { success: false, message: "model not found" },
          { status: 404 },
        ),
      ),
    );
    const client = new ApiClient({ baseUrl: BASE });
    const r = await modelCardTool.handler({ model: "zzz/missing" }, { client });
    expect(r.isError).toBe(true);
    const text = r.content[0].text;
    expect(text).toMatch(/not found/i);
    expect(text).toContain("zzz/missing");
  });

  it("success:false on HTTP 200 still returns the upstream message", async () => {
    server.use(
      http.get(`${BASE}/api/public/models/openai/gpt-4o-mini`, () =>
        HttpResponse.json({ success: false, message: "missing slug" }),
      ),
    );
    const client = new ApiClient({ baseUrl: BASE });
    const r = await modelCardTool.handler(
      { model: "openai/gpt-4o-mini" },
      { client },
    );
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/missing slug/i);
  });

  it("404 with envelope returns helpful 'model not found' message", async () => {
    server.use(
      http.get(`${BASE}/api/public/models/zzz/missing`, () =>
        HttpResponse.json(
          { success: false, message: "model not found" },
          { status: 404 },
        ),
      ),
    );
    const client = new ApiClient({ baseUrl: BASE });
    const r = await modelCardTool.handler({ model: "zzz/missing" }, { client });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/not found/i);
  });

  it("works without API key", async () => {
    let auth: string | null = null;
    server.use(
      http.get(`${BASE}/api/public/models/openai/gpt-4o-mini`, ({ request }) => {
        auth = request.headers.get("authorization");
        return HttpResponse.json({
          success: true,
          data: { ...SAMPLE_DTO },
        });
      }),
    );
    const client = new ApiClient({ baseUrl: BASE });
    await modelCardTool.handler({ model: "openai/gpt-4o-mini" }, { client });
    expect(auth).toBeNull();
  });

  it("empty model throws ValidationError", async () => {
    const client = new ApiClient({ baseUrl: BASE });
    await expect(
      modelCardTool.handler({ model: "" }, { client }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("bare id (no slash) hits the single-segment public route", async () => {
    let receivedUrl = "";
    server.use(
      http.get(`${BASE}/api/public/models/:slug`, ({ request, params }) => {
        receivedUrl = request.url;
        return HttpResponse.json({
          success: true,
          data: { ...SAMPLE_DTO, model_name: String(params.slug), slug: String(params.slug), provider_slug: "" },
        });
      }),
    );
    const client = new ApiClient({ baseUrl: BASE });
    const r = await modelCardTool.handler({ model: "kimi-k2.5" }, { client });
    expect(receivedUrl).toBe(`${BASE}/api/public/models/kimi-k2.5`);
    expect(r.isError).toBeFalsy();
    expect(r.content[0].text).toContain("Model card for kimi-k2.5:");
  });

  it("bare id URL-encodes special characters", async () => {
    let receivedUrl = "";
    server.use(
      http.get(`${BASE}/api/public/models/:slug`, ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({ success: true, data: { ...SAMPLE_DTO } });
      }),
    );
    const client = new ApiClient({ baseUrl: BASE });
    await modelCardTool.handler({ model: "weird name" }, { client });
    expect(receivedUrl).toMatch(/weird%20name|weird\+name/);
  });

  it("model with leading slash throws ValidationError", async () => {
    const client = new ApiClient({ baseUrl: BASE });
    await expect(
      modelCardTool.handler({ model: "/gpt-4o-mini" }, { client }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("model with trailing slash throws ValidationError", async () => {
    const client = new ApiClient({ baseUrl: BASE });
    await expect(
      modelCardTool.handler({ model: "openai/" }, { client }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("encodes provider and slug into URL path safely", async () => {
    let receivedUrl = "";
    server.use(
      http.get(`${BASE}/api/public/models/:provider/:slug`, ({ request }) => {
        receivedUrl = request.url;
        return HttpResponse.json({
          success: true,
          data: { ...SAMPLE_DTO, provider_slug: "x", slug: "weird name" },
        });
      }),
    );
    const client = new ApiClient({ baseUrl: BASE });
    await modelCardTool.handler({ model: "x/weird name" }, { client });
    expect(receivedUrl).toMatch(/weird%20name|weird\+name/);
  });
});
