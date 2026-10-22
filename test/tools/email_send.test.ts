import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";
import { ApiClient } from "../../src/api_client.js";
import { emailSendTool } from "../../src/tools/email_send.js";
import { MissingApiKeyError } from "../../src/errors.js";
import { ValidationError } from "../../src/tools/types.js";

const BASE = "https://orcarouter.test";
const SEND = `${BASE}/v1/agents/email/send`;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Mirror the server's Ajv config so schema tests reflect real validation.
function makeValidator(): ValidateFunction {
  const AjvCtor: typeof Ajv =
    ((Ajv as unknown as { default?: typeof Ajv }).default ?? Ajv) as typeof Ajv;
  const addFmt =
    (addFormats as unknown as { default?: typeof addFormats }).default ??
    addFormats;
  const ajv = new AjvCtor({ allErrors: true, strict: false });
  addFmt(ajv);
  return ajv.compile(emailSendTool.inputSchema);
}

const client = () => new ApiClient({ apiKey: "agent-key", baseUrl: BASE });
const keyless = () => new ApiClient({ baseUrl: BASE });

// One-shot handler that records the request and answers with `reply`.
function capture(reply: () => Response): {
  body?: Record<string, unknown>;
  auth?: string | null;
  runRef?: string | null;
  calls: number;
} {
  const seen: {
    body?: Record<string, unknown>;
    auth?: string | null;
    runRef?: string | null;
    calls: number;
  } = { calls: 0 };
  server.use(
    http.post(SEND, async ({ request }) => {
      seen.calls++;
      seen.auth = request.headers.get("authorization");
      seen.runRef = request.headers.get("x-orca-run-ref");
      seen.body = (await request.json()) as Record<string, unknown>;
      return reply();
    }),
  );
  return seen;
}

const sent = () =>
  HttpResponse.json({ success: true, data: { message_id: 42, status: "sent" } });

function text(result: { content: Array<{ text: string }> }): string {
  return result.content.map((c) => c.text).join("\n");
}

describe("orcarouter_email_send", () => {
  it("declares its name, a required `to` and no unknown fields", () => {
    expect(emailSendTool.name).toBe("orcarouter_email_send");
    expect(emailSendTool.inputSchema.required).toEqual(["to"]);
    expect(emailSendTool.inputSchema.additionalProperties).toBe(false);
    expect(Object.keys(emailSendTool.inputSchema.properties).sort()).toEqual(
      ["cc", "client_ref", "html", "reply_to", "run_ref", "subject", "text", "to"],
    );
  });

  it("schema refuses an empty `to`, an empty address and an unknown field", () => {
    const validate = makeValidator();
    expect(validate({ to: ["a@example.com"], subject: "s" })).toBe(true);
    expect(validate({ to: [], subject: "s" })).toBe(false);
    expect(validate({ to: [""], subject: "s" })).toBe(false);
    expect(validate({ to: ["a@example.com"], from: "x@example.com" })).toBe(false);
  });

  it("requires an API key", async () => {
    await expect(
      emailSendTool.handler({ to: ["a@example.com"], subject: "s" }, { client: keyless() }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });

  it("refuses a send with no subject, text or html before calling OrcaRouter", async () => {
    await expect(
      emailSendTool.handler({ to: ["a@example.com"], subject: "", text: "" }, { client: client() }),
    ).rejects.toBeInstanceOf(ValidationError);
    // The server trims before it checks, so blank is empty.
    await expect(
      emailSendTool.handler(
        { to: ["a@example.com"], subject: "  ", text: "\n\t", html: " " },
        { client: client() },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("sends run_ref as the X-Orca-Run-Ref header, never in the body", async () => {
    const seen = capture(sent);
    await emailSendTool.handler(
      { to: ["a@example.com"], subject: "s", run_ref: "run-77" },
      { client: client() },
    );
    expect(seen.runRef).toBe("run-77");
    expect(seen.body).toEqual({ to: ["a@example.com"], subject: "s" });

    const without = capture(sent);
    await emailSendTool.handler({ to: ["a@example.com"], subject: "s" }, { client: client() });
    expect(without.runRef).toBeNull();
  });

  it("posts exactly the fields given, with the agent key, and returns the send result", async () => {
    const seen = capture(sent);
    const result = await emailSendTool.handler(
      {
        to: ["a@example.com"],
        cc: ["b@example.com"],
        reply_to: "r@example.com",
        subject: "Hello",
        text: "Plain",
        html: "<p>Hi</p>",
        client_ref: "task-1",
      },
      { client: client() },
    );
    expect(seen.auth).toBe("Bearer agent-key");
    expect(seen.body).toEqual({
      to: ["a@example.com"],
      cc: ["b@example.com"],
      reply_to: "r@example.com",
      subject: "Hello",
      text: "Plain",
      html: "<p>Hi</p>",
      client_ref: "task-1",
    });
    expect(result.isError).toBeUndefined();
    expect(text(result)).toContain("Email send status: sent.");
    expect(JSON.parse(text(result).split("\n\n")[1])).toEqual({
      message_id: 42,
      status: "sent",
    });
  });

  it("omits fields the caller did not set", async () => {
    const seen = capture(sent);
    await emailSendTool.handler({ to: ["a@example.com"], text: "only a body" }, { client: client() });
    expect(seen.body).toEqual({ to: ["a@example.com"], text: "only a body" });
  });

  it("says plainly when a sandbox agent only simulated the send", async () => {
    capture(() =>
      HttpResponse.json({
        success: true,
        data: { message_id: 0, status: "sent", simulated: true },
      }),
    );
    const result = await emailSendTool.handler(
      { to: ["a@example.com"], subject: "s" },
      { client: client() },
    );
    expect(text(result)).toMatch(/^Simulated send \(sandbox agent\): nothing was sent/);
  });

  it("send_in_progress: keeps code, retry_ref and message_id, and says to reuse the key", async () => {
    capture(() =>
      HttpResponse.json(
        {
          success: false,
          code: "send_in_progress",
          message: "the send is in progress and its outcome is not yet known",
          retry_ref: "srv:9f1c",
          message_id: 7,
        },
        { status: 409 },
      ),
    );
    const result = await emailSendTool.handler(
      { to: ["a@example.com"], subject: "s" },
      { client: client() },
    );
    expect(result.isError).toBe(true);
    const out = text(result);
    expect(out).toContain("HTTP 409, code send_in_progress");
    expect(out).toContain('retry with client_ref "srv:9f1c"');
    expect(out).toContain("a new client_ref would send the email a second time");
    expect(out).toContain("message 7");
    const json = JSON.parse(out.slice(out.indexOf("{")));
    expect(json).toEqual({
      status: 409,
      code: "send_in_progress",
      message: "the send is in progress and its outcome is not yet known",
      retry_ref: "srv:9f1c",
      message_id: 7,
    });
  });

  it("send_key_burned: says to use a new key, the opposite of send_in_progress", async () => {
    capture(() =>
      HttpResponse.json(
        { success: false, code: "send_key_burned", message: "this client_ref already failed" },
        { status: 409 },
      ),
    );
    const result = await emailSendTool.handler(
      { to: ["a@example.com"], subject: "s", client_ref: "task-1" },
      { client: client() },
    );
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("code send_key_burned");
    expect(text(result)).toContain("retry with a new client_ref");
    expect(text(result)).not.toContain("same client_ref");
  });

  it("policy_declined: hands back the deny payload the agent self-heals from", async () => {
    const deny = { rule: "domain_blocklist", detail: "example.org is blocked" };
    capture(() =>
      HttpResponse.json(
        { success: false, code: "policy_declined", message: "declined by policy", deny },
        { status: 403 },
      ),
    );
    const result = await emailSendTool.handler(
      { to: ["a@example.org"], subject: "s" },
      { client: client() },
    );
    const out = text(result);
    expect(result.isError).toBe(true);
    expect(out).toContain("HTTP 403, code policy_declined");
    expect(JSON.parse(out.slice(out.indexOf("{"))).deny).toEqual(deny);
  });

  it("budget_exceeded (402) and bad_input (400) keep their codes", async () => {
    for (const [status, code] of [
      [402, "budget_exceeded"],
      [400, "bad_input"],
    ] as const) {
      capture(() => HttpResponse.json({ success: false, code, message: code }, { status }));
      const result = await emailSendTool.handler(
        { to: ["a@example.com"], subject: "s" },
        { client: client() },
      );
      expect(result.isError).toBe(true);
      expect(text(result)).toContain(`HTTP ${status}, code ${code}`);
    }
  });

  it("says what to do next for each code that has a next step", async () => {
    const cases: Array<[number, string, RegExp, Record<string, unknown>?]> = [
      [502, "provider_send_failed", /not sent, and this client_ref is now spent: a retry needs a new client_ref/],
      // A 500 never reached the provider; a key stuck after it is safe to replace.
      [500, "internal_error", /retry with the same client_ref .*re-send under a new client_ref/],
      [503, "internal_error", /spend policy could not be evaluated, so nothing was sent/],
      [503, "guardrail_unavailable", /nothing was sent: retry later with the same client_ref/],
      [503, "provider_unavailable", /No email provider is configured/],
      [422, "blocked_by_guardrail", /rewrite the subject or body/],
      [402, "budget_exceeded", /retrying will not help until it is topped up/],
      [403, "agent_not_active", /Nothing was sent\. Once the agent is active/],
      [409, "no_capability_address", /Nothing was sent\. Once the agent is active with an email address/],
      [403, "policy_declined", /needs a human's approval \(approval 31\): retry with the same client_ref/, { deny: { reason: "approval required", approval_id: 31 } }],
      [403, "policy_declined", /spend policy declined this send \(see deny\)/, { deny: { reason: "domain blocked" } }],
    ];
    for (const [status, code, hint, extra] of cases) {
      capture(() =>
        HttpResponse.json({ success: false, code, message: code, ...(extra ?? {}) }, { status }),
      );
      const result = await emailSendTool.handler(
        { to: ["a@example.com"], subject: "s" },
        { client: client() },
      );
      expect(result.isError, code).toBe(true);
      expect(text(result), code).toMatch(hint);
    }
  });

  it("rate limited (no code): nothing was sent, retry after the server's wait", async () => {
    capture(
      () =>
        new HttpResponse("too many requests", {
          status: 429,
          headers: { "retry-after": "12" },
        }),
    );
    const result = await emailSendTool.handler(
      { to: ["a@example.com"], subject: "s", client_ref: "task-3" },
      { client: client() },
    );
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("nothing was sent: retry after 12 s with the same client_ref");
    expect(JSON.parse(text(result).slice(text(result).indexOf("{"))).retry_after).toBe(12);
  });

  // An edge or proxy timeout in front of the send handler: no OrcaRouter
  // code, possibly after the handler had already called the provider.
  it("a 5xx with no OrcaRouter code: the outcome is unknown, and the page is not dumped", async () => {
    const page = `<html><body>${"<p>Gateway Timeout</p>".repeat(3000)}</body></html>`;
    capture(
      () =>
        new HttpResponse(page, { status: 504, headers: { "content-type": "text/html" } }),
    );
    const result = await emailSendTool.handler(
      { to: ["a@example.com"], subject: "s", client_ref: "task-4" },
      { client: client() },
    );
    const out = text(result);
    expect(result.isError).toBe(true);
    expect(out).toContain("HTTP 504)");
    expect(out).toContain("The outcome is unknown");
    expect(out).toContain('Retry with the same client_ref "task-4"');
    // The page is bounded and quoted once.
    expect(out.length).toBeLessThan(1000);
    expect(out.split("Gateway Timeout").length - 1).toBeLessThanOrEqual(20);
    expect(out).not.toContain('"message"');
    expect(page.length).toBeGreaterThan(50_000);
  });

  it("a proxy's prose `error` is not taken for an OrcaRouter code: the outcome is unknown", async () => {
    capture(() => HttpResponse.json({ error: "upstream request timeout" }, { status: 504 }));
    const result = await emailSendTool.handler(
      { to: ["a@example.com"], subject: "s", client_ref: "task-6" },
      { client: client() },
    );
    const out = text(result);
    expect(out).toContain("failed (HTTP 504)");
    expect(out).not.toContain("code upstream");
    expect(out).toContain("The outcome is unknown");
    expect(out).toContain('Retry with the same client_ref "task-6"');
  });

  // SystemPerformanceCheck refuses in the OpenAI shape before any handler.
  it("an overload refusal reads error.code and says nothing was sent", async () => {
    capture(() =>
      HttpResponse.json(
        {
          error: {
            message: "The service is temporarily overloaded. Please try again later.",
            type: "new_api_error",
            code: "system_cpu_overloaded",
          },
        },
        { status: 503 },
      ),
    );
    const result = await emailSendTool.handler(
      { to: ["a@example.com"], subject: "s" },
      { client: client() },
    );
    const out = text(result);
    expect(out).toContain("HTTP 503, code system_cpu_overloaded");
    expect(out).toContain("overloaded), so nothing was sent");
    expect(out).not.toContain("The outcome is unknown");
  });

  it("refuses a blank client_ref, which the server would trim to none", async () => {
    await expect(
      emailSendTool.handler(
        { to: ["a@example.com"], subject: "s", client_ref: "   " },
        { client: client() },
      ),
    ).rejects.toThrow(/client_ref must not be blank/);
  });

  it("refuses a run_ref that would not reach the server as written", async () => {
    const validate = makeValidator();
    expect(validate({ to: ["a@example.com"], subject: "s", run_ref: "x".repeat(192) })).toBe(false);
    for (const runRef of ["  ", " run-1", "run-1 ", "运行-1", "run\n1"]) {
      await expect(
        emailSendTool.handler(
          { to: ["a@example.com"], subject: "s", run_ref: runRef },
          { client: client() },
        ),
        JSON.stringify(runRef),
      ).rejects.toThrow(/run_ref must be printable ASCII/);
    }
  });

  it("an answer with no result claims no HTTP status it did not see", async () => {
    capture(() => new HttpResponse(null, { status: 204 }));
    const result = await emailSendTool.handler(
      { to: ["a@example.com"], subject: "s", client_ref: "task-7" },
      { client: client() },
    );
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("OrcaRouter's answer carried no result");
    expect(text(result)).not.toContain("HTTP 200");
  });

  it("a 2xx that is not JSON: not reported as no answer, and the base URL is named", async () => {
    capture(
      () =>
        new HttpResponse("<!doctype html><title>Sign in</title>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    const result = await emailSendTool.handler(
      { to: ["a@example.com"], subject: "s", client_ref: "task-5" },
      { client: client() },
    );
    const out = text(result);
    expect(result.isError).toBe(true);
    expect(out).toContain("the answer was not JSON");
    expect(out).toContain("ORCAROUTER_BASE_URL");
    expect(out).not.toContain("no answer from OrcaRouter");
    expect(out).toContain('Retry with the same client_ref "task-5"');
  });

  it("no answer at all: the outcome is unknown, so retry with the same client_ref", async () => {
    server.use(http.post(SEND, () => HttpResponse.error()));
    const result = await emailSendTool.handler(
      { to: ["a@example.com"], subject: "s", client_ref: "task-9" },
      { client: client() },
    );
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("The outcome is unknown");
    expect(text(result)).toContain('Retry with the same client_ref "task-9"');
  });

  it("no answer and no client_ref: warns that a retry could send twice", async () => {
    server.use(http.post(SEND, () => HttpResponse.error()));
    const result = await emailSendTool.handler(
      { to: ["a@example.com"], subject: "s" },
      { client: client() },
    );
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("a retry could send it twice");
    expect(text(result)).toContain("orcarouter_email_messages");
  });

  it("a 200 that is not a success is not reported as sent", async () => {
    capture(() => HttpResponse.json({ success: false, message: "odd" }));
    const result = await emailSendTool.handler(
      { to: ["a@example.com"], subject: "s" },
      { client: client() },
    );
    expect(result.isError).toBe(true);
    expect(text(result)).toContain("odd");
  });
});
