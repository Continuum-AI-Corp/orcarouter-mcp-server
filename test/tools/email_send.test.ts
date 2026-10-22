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
  calls: number;
} {
  const seen: { body?: Record<string, unknown>; auth?: string | null; calls: number } = {
    calls: 0,
  };
  server.use(
    http.post(SEND, async ({ request }) => {
      seen.calls++;
      seen.auth = request.headers.get("authorization");
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
      ["cc", "client_ref", "html", "reply_to", "subject", "text", "to"],
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
