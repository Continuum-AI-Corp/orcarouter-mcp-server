import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { ApiClient } from "../../src/api_client.js";
import { chatTool, isReasoningModel } from "../../src/tools/chat.js";
import { MissingApiKeyError } from "../../src/errors.js";
import { ValidationError } from "../../src/tools/types.js";

const BASE = "https://orcarouter.test";
const server = setupServer();

// Mirror the server's Ajv config so schema tests reflect real validation.
function makeChatValidator(): ValidateFunction {
  const AjvCtor: typeof Ajv =
    ((Ajv as unknown as { default?: typeof Ajv }).default ?? Ajv) as typeof Ajv;
  const addFmt =
    (addFormats as unknown as { default?: typeof addFormats }).default ??
    addFormats;
  const ajv = new AjvCtor({ allErrors: true, strict: false });
  addFmt(ajv);
  return ajv.compile(chatTool.inputSchema);
}

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Convenience: register a one-shot capture handler that records the request
// body and returns a benign assistant completion.
function captureBody(): { body: Record<string, unknown> } {
  const captured: { body: Record<string, unknown> } = { body: {} };
  server.use(
    http.post(`${BASE}/v1/chat/completions`, async ({ request }) => {
      captured.body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({
        choices: [{ message: { role: "assistant", content: "ok" } }],
      });
    }),
  );
  return captured;
}

describe("orcarouter_chat", () => {
  it("declares correct metadata", () => {
    expect(chatTool.name).toBe("orcarouter_chat");
    expect(chatTool.description).toMatch(/chat/i);
    // Only `prompt` is required now; model defaults SDK-side.
    expect(chatTool.inputSchema.required).toEqual(["prompt"]);
  });

  // ---------------------------------------------------------------------
  // model default + override
  // ---------------------------------------------------------------------

  it("default model: input without `model` -> body has orcarouter/auto", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler({ prompt: "hi" }, { client });
    expect(c.body.model).toBe("orcarouter/auto");
  });

  it("empty model: input with `model: '  '` -> body has orcarouter/auto", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler({ model: "  ", prompt: "hi" }, { client });
    expect(c.body.model).toBe("orcarouter/auto");
  });

  it("explicit model forwarded as-is", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "openai/gpt-4o-mini", prompt: "hi" },
      { client },
    );
    expect(c.body.model).toBe("openai/gpt-4o-mini");
  });

  // ---------------------------------------------------------------------
  // prompt validation
  // ---------------------------------------------------------------------

  it("missing prompt rejected with ValidationError", async () => {
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await expect(
      // @ts-expect-error - testing runtime guard
      chatTool.handler({ model: "x" }, { client }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("empty prompt rejected with ValidationError", async () => {
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await expect(
      chatTool.handler({ model: "x", prompt: "" }, { client }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  // ---------------------------------------------------------------------
  // messages array construction
  // ---------------------------------------------------------------------

  it("prompt only -> 1-element user message", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "openai/gpt-4o-mini", prompt: "hi" },
      { client },
    );
    expect(c.body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("prompt + system_prompt -> 2-element messages (system first)", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      {
        model: "openai/gpt-4o-mini",
        prompt: "hi",
        system_prompt: "Be concise.",
      },
      { client },
    );
    expect(c.body.messages).toEqual([
      { role: "system", content: "Be concise." },
      { role: "user", content: "hi" },
    ]);
  });

  // ---------------------------------------------------------------------
  // defaults: temperature 0.7, max_tokens 10000
  // ---------------------------------------------------------------------

  it("default temperature 0.7 when omitted", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler({ model: "x", prompt: "hi" }, { client });
    expect(c.body.temperature).toBe(0.7);
  });

  it("default max_tokens 10000 when omitted", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler({ model: "x", prompt: "hi" }, { client });
    expect(c.body.max_tokens).toBe(10000);
  });

  it("explicit max_tokens forwarded", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "x", prompt: "hi", max_tokens: 500 },
      { client },
    );
    expect(c.body.max_tokens).toBe(500);
  });

  it("explicit temperature forwarded", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "x", prompt: "hi", temperature: 0.3 },
      { client },
    );
    expect(c.body.temperature).toBe(0.3);
  });

  // ---------------------------------------------------------------------
  // reasoning-model heuristic: max_tokens -> max_completion_tokens
  // ---------------------------------------------------------------------

  it("isReasoningModel heuristic table", () => {
    // reasoning models (gpt-5 / o-series)
    expect(isReasoningModel("openai/gpt-5")).toBe(true);
    expect(isReasoningModel("openai/gpt-5-mini")).toBe(true);
    expect(isReasoningModel("openai/gpt-5-pro")).toBe(true);
    expect(isReasoningModel("openai/o1")).toBe(true);
    expect(isReasoningModel("openai/o1-mini")).toBe(true);
    expect(isReasoningModel("openai/o1-preview")).toBe(true);
    expect(isReasoningModel("openai/o3")).toBe(true);
    expect(isReasoningModel("openai/o3-mini")).toBe(true);
    expect(isReasoningModel("openai/o3-pro")).toBe(true);
    expect(isReasoningModel("openai/o4")).toBe(true);
    expect(isReasoningModel("openai/o4-mini")).toBe(true);
    // Dotted-version variants (gpt-5.1 / gpt-5.5 / gpt-5.2-thinking).
    // Codex P1 regression: regex used to allow only `-` or end after
    // gpt-5, so `gpt-5.5` was treated as non-reasoning.
    expect(isReasoningModel("openai/gpt-5.1")).toBe(true);
    expect(isReasoningModel("openai/gpt-5.5")).toBe(true);
    expect(isReasoningModel("openai/gpt-5.2-thinking")).toBe(true);
    expect(isReasoningModel("gpt-5.1-codex")).toBe(true);
    // bare ids (no provider prefix)
    expect(isReasoningModel("gpt-5")).toBe(true);
    expect(isReasoningModel("o1")).toBe(true);
    // non-reasoning
    expect(isReasoningModel("openai/gpt-4o-mini")).toBe(false);
    expect(isReasoningModel("openai/gpt-4")).toBe(false);
    expect(isReasoningModel("anthropic/claude-haiku-4.5")).toBe(false);
    expect(isReasoningModel("orcarouter/auto")).toBe(false);
    // false positives we don't want: "o" alone, "o0", "open*"
    expect(isReasoningModel("openai/oracle")).toBe(false);
    expect(isReasoningModel("openai/o0")).toBe(false);
  });

  it("reasoning model openai/gpt-5 -> max_completion_tokens, no max_tokens", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "openai/gpt-5", prompt: "hi" },
      { client },
    );
    expect(c.body.max_completion_tokens).toBe(10000);
    expect("max_tokens" in c.body).toBe(false);
  });

  it("reasoning model openai/o1-mini -> max_completion_tokens", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "openai/o1-mini", prompt: "hi", max_tokens: 1234 },
      { client },
    );
    expect(c.body.max_completion_tokens).toBe(1234);
    expect("max_tokens" in c.body).toBe(false);
  });

  it("reasoning model openai/o3-pro -> max_completion_tokens", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "openai/o3-pro", prompt: "hi" },
      { client },
    );
    expect(c.body.max_completion_tokens).toBe(10000);
    expect("max_tokens" in c.body).toBe(false);
  });

  it("reasoning model openai/o4 -> max_completion_tokens", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "openai/o4", prompt: "hi" },
      { client },
    );
    expect(c.body.max_completion_tokens).toBe(10000);
    expect("max_tokens" in c.body).toBe(false);
  });

  it("non-reasoning openai/gpt-4o-mini -> max_tokens, no max_completion_tokens", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "openai/gpt-4o-mini", prompt: "hi" },
      { client },
    );
    expect(c.body.max_tokens).toBe(10000);
    expect("max_completion_tokens" in c.body).toBe(false);
  });

  it("non-reasoning anthropic/claude-haiku-4.5 -> max_tokens", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "anthropic/claude-haiku-4.5", prompt: "hi" },
      { client },
    );
    expect(c.body.max_tokens).toBe(10000);
    expect("max_completion_tokens" in c.body).toBe(false);
  });

  it("default orcarouter/auto -> max_tokens (not reasoning)", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler({ prompt: "hi" }, { client });
    expect(c.body.model).toBe("orcarouter/auto");
    expect(c.body.max_tokens).toBe(10000);
    expect("max_completion_tokens" in c.body).toBe(false);
  });

  it("bare model name without provider prefix: `gpt-5` -> max_completion_tokens", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler({ model: "gpt-5", prompt: "hi" }, { client });
    expect(c.body.model).toBe("gpt-5");
    expect(c.body.max_completion_tokens).toBe(10000);
    expect("max_tokens" in c.body).toBe(false);
  });

  // ---------------------------------------------------------------------
  // fallback chain — unchanged from PR-C
  // ---------------------------------------------------------------------

  it("with models list sends extra_body.models and route fallback", async () => {
    server.use(
      http.post(`${BASE}/v1/chat/completions`, async ({ request }) => {
        const body = (await request.json()) as {
          extra_body?: { models?: string[]; route?: string };
        };
        expect(body.extra_body?.models).toEqual([
          "openai/gpt-4o-mini",
          "anthropic/claude-3-haiku",
        ]);
        expect(body.extra_body?.route).toBe("fallback");
        return HttpResponse.json({
          choices: [{ message: { role: "assistant", content: "ok" } }],
        });
      }),
    );
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      {
        model: "openai/gpt-4o-mini",
        models: ["openai/gpt-4o-mini", "anthropic/claude-3-haiku"],
        prompt: "hi",
      },
      { client },
    );
  });

  it("prepends declared primary to the fallback chain so gateway resolved[0] == primary", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      {
        model: "openai/gpt-4o-mini",
        models: ["anthropic/claude-3-haiku", "google/gemini-pro"],
        prompt: "hi",
      },
      { client },
    );
    const extra = c.body.extra_body as { models?: string[] } | undefined;
    expect(extra?.models).toEqual([
      "openai/gpt-4o-mini",
      "anthropic/claude-3-haiku",
      "google/gemini-pro",
    ]);
    expect(extra?.models?.[0]).toBe("openai/gpt-4o-mini");
    expect(c.body.model).toBe("openai/gpt-4o-mini");
  });

  it("does not duplicate the primary when it already appears in models", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "X", models: ["X", "A"], prompt: "hi" },
      { client },
    );
    const extra = c.body.extra_body as { models?: string[] } | undefined;
    expect(extra?.models).toEqual(["X", "A"]);
  });

  it("rejects with ValidationError when prepending the primary exceeds the cap of 5", async () => {
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await expect(
      chatTool.handler(
        { model: "X", models: ["A", "B", "C", "D", "E"], prompt: "hi" },
        { client },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not exceed the cap when the primary is already inside a 5-entry models list", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "C", models: ["A", "B", "C", "D", "E"], prompt: "hi" },
      { client },
    );
    const extra = c.body.extra_body as { models?: string[] } | undefined;
    expect(extra?.models).toEqual(["C", "A", "B", "D", "E"]);
  });

  it("no models -> single-model request with no extra_body", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler({ model: "solo", prompt: "hi" }, { client });
    expect(c.body.model).toBe("solo");
    expect(c.body.extra_body).toBeUndefined();
  });

  it("models:['X'] equal to primary collapses to single-model request (no extra_body)", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "X", models: ["X"], prompt: "hi" },
      { client },
    );
    expect(c.body.model).toBe("X");
    expect(c.body.extra_body).toBeUndefined();
  });

  it("over-long effective chain rejected (raw models > 5 with distinct primary)", async () => {
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await expect(
      chatTool.handler(
        { model: "x", models: ["a", "b", "c", "d", "e", "f"], prompt: "hi" },
        { client },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("single fallback model:'X' + models:['Y'] -> effective chain ['X','Y'] forwarded", async () => {
    const c = captureBody();
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await chatTool.handler(
      { model: "X", models: ["Y"], prompt: "hi" },
      { client },
    );
    const extra = c.body.extra_body as { models?: string[]; route?: string } | undefined;
    expect(extra?.models).toEqual(["X", "Y"]);
    expect(extra?.route).toBe("fallback");
    expect(c.body.model).toBe("X");
  });

  it("empty models array rejected with ValidationError", async () => {
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await expect(
      chatTool.handler(
        { model: "x", models: [], prompt: "hi" },
        { client },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("models with an empty-string entry rejected with ValidationError", async () => {
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await expect(
      chatTool.handler(
        { model: "x", models: ["good", ""], prompt: "hi" },
        { client },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  // ---------------------------------------------------------------------
  // schema-level (Ajv) checks
  // ---------------------------------------------------------------------

  it("schema declares minItems: 1 and maxItems: 5 on models", () => {
    const props = chatTool.inputSchema.properties as Record<
      string,
      { minItems?: number; maxItems?: number }
    >;
    expect(props.models.minItems).toBe(1);
    expect(props.models.maxItems).toBe(5);
  });

  it("schema declares prompt, system_prompt, model, max_tokens, temperature, models", () => {
    const props = chatTool.inputSchema.properties as Record<string, unknown>;
    expect(props.prompt).toBeDefined();
    expect(props.system_prompt).toBeDefined();
    expect(props.model).toBeDefined();
    expect(props.max_tokens).toBeDefined();
    expect(props.temperature).toBeDefined();
    expect(props.models).toBeDefined();
  });

  it("schema does NOT declare removed fields (messages, max_completion_tokens, stream)", () => {
    const props = chatTool.inputSchema.properties as Record<string, unknown>;
    expect(props.messages).toBeUndefined();
    expect(props.max_completion_tokens).toBeUndefined();
    expect(props.stream).toBeUndefined();
  });

  it("schema declares defaults for model, max_tokens, temperature", () => {
    const props = chatTool.inputSchema.properties as Record<
      string,
      { default?: unknown }
    >;
    expect(props.model.default).toBe("orcarouter/auto");
    expect(props.max_tokens.default).toBe(10000);
    expect(props.temperature.default).toBe(0.7);
  });

  it("Ajv schema accepts prompt-only input", () => {
    const validate = makeChatValidator();
    const ok = validate({ prompt: "hi" });
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("Ajv schema accepts model + prompt + system_prompt", () => {
    const validate = makeChatValidator();
    const ok = validate({
      model: "openai/gpt-4o-mini",
      prompt: "hi",
      system_prompt: "be brief",
    });
    expect(ok, JSON.stringify(validate.errors)).toBe(true);
  });

  it("Ajv schema rejects missing prompt", () => {
    const validate = makeChatValidator();
    const ok = validate({ model: "x" });
    expect(ok).toBe(false);
  });

  it("Ajv schema rejects unexpected extra properties", () => {
    const validate = makeChatValidator();
    const ok = validate({ prompt: "hi", bogus: 1 });
    expect(ok).toBe(false);
  });

  // ---------------------------------------------------------------------
  // operational guards (api key, streaming, response stringify)
  // ---------------------------------------------------------------------

  it("happy path returns completion text", async () => {
    server.use(
      http.post(`${BASE}/v1/chat/completions`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        expect(body.model).toBe("openai/gpt-4o-mini");
        expect(body.stream).toBe(false);
        return HttpResponse.json({
          id: "cmpl-1",
          choices: [{ message: { role: "assistant", content: "hello there" } }],
        });
      }),
    );
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    const r = await chatTool.handler(
      { model: "openai/gpt-4o-mini", prompt: "hi" },
      { client },
    );
    expect(r.content[0].text).toBe("hello there");
  });

  it("missing API key throws MissingApiKeyError", async () => {
    const client = new ApiClient({ baseUrl: BASE });
    await expect(
      chatTool.handler({ model: "x", prompt: "hi" }, { client }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it("stream:true rejected with ValidationError", async () => {
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    await expect(
      chatTool.handler(
        {
          model: "x",
          prompt: "hi",
          // @ts-expect-error - testing runtime guard
          stream: true,
        },
        { client },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("stringifies non-string assistant content (array of parts) from upstream", async () => {
    server.use(
      http.post(`${BASE}/v1/chat/completions`, () =>
        HttpResponse.json({
          choices: [
            {
              message: {
                role: "assistant",
                content: [{ type: "text", text: "hi from parts" }],
              },
            },
          ],
        }),
      ),
    );
    const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
    const r = await chatTool.handler(
      { model: "x", prompt: "hi" },
      { client },
    );
    expect(r.content[0].text).toContain("hi from parts");
  });
});
