import { describe, it, expect, afterEach } from "vitest";
import { request as httpRequest } from "node:http";
import { startHttpServer, type RunningHttpServer } from "../src/http.js";

const INITIALIZE = {
  jsonrpc: "2.0" as const,
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "vitest", version: "1.0.0" },
  },
};

const MCP_ACCEPT = "application/json, text/event-stream";

let running: RunningHttpServer | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

/** Port 0 lets the OS pick a free port, so tests never collide with a real service. */
async function start(options: Parameters<typeof startHttpServer>[0] = {}): Promise<string> {
  running = await startHttpServer({
    port: 0,
    server: { apiKey: "test-key", baseUrl: "https://orcarouter.test" },
    log: () => {},
    ...options,
  });
  return `http://127.0.0.1:${running.port}`;
}

/** The transport answers a single request with one SSE event; pull the JSON back out of it. */
function parseSse(text: string): any {
  const line = text.split("\n").find((l) => l.startsWith("data:"));
  if (!line) throw new Error(`no SSE data frame in: ${text}`);
  return JSON.parse(line.slice(5).trim());
}

/**
 * `fetch` treats `Host` as a forbidden header and silently drops an override, so a Host-based
 * rebinding test written with fetch asserts nothing. Go through node:http to set it for real.
 */
function rawPost(
  port: number,
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: { "content-type": "application/json", accept: MCP_ACCEPT, ...headers },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

async function initialize(base: string, headers: Record<string, string> = {}) {
  return fetch(`${base}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: MCP_ACCEPT, ...headers },
    body: JSON.stringify(INITIALIZE),
  });
}

describe("streamable http transport", () => {
  it("completes an initialize handshake and issues a session id", async () => {
    const base = await start();
    const res = await initialize(base);
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeTruthy();
    const payload = parseSse(await res.text());
    expect(payload.result.serverInfo.name).toBeTruthy();
    expect(payload.result.protocolVersion).toBeTruthy();
  });

  it("lists tools on an established session", async () => {
    const base = await start();
    const init = await initialize(base);
    const sessionId = init.headers.get("mcp-session-id")!;
    await init.text();

    await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: MCP_ACCEPT, "mcp-session-id": sessionId },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });

    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: MCP_ACCEPT, "mcp-session-id": sessionId },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(200);
    const payload = parseSse(await res.text());
    expect(payload.result.tools.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining([
        "orcarouter_chat",
        "orcarouter_models_list",
        "orcarouter_model_card",
        "orcarouter_providers_list",
      ]),
    );
  });

  it("rejects an unknown session with 404 so the client reinitializes", async () => {
    const base = await start();
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: MCP_ACCEPT, "mcp-session-id": "nope" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects a non-initialize first request with 400", async () => {
    const base = await start();
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: MCP_ACCEPT },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("terminates a session on DELETE and forgets it", async () => {
    const base = await start();
    const init = await initialize(base);
    const sessionId = init.headers.get("mcp-session-id")!;
    await init.text();

    const del = await fetch(`${base}/mcp`, {
      method: "DELETE",
      headers: { "mcp-session-id": sessionId, accept: MCP_ACCEPT },
    });
    expect([200, 204]).toContain(del.status);

    const after = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: MCP_ACCEPT, "mcp-session-id": sessionId },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
    });
    expect(after.status).toBe(404);
  });

  it("serves a health endpoint that needs no auth and makes no upstream call", async () => {
    const base = await start({ authToken: "secret" });
    const res = await fetch(`${base}/healthz`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.transport).toBe("streamable-http");
  });

  it("answers a JSON-RPC error for an unknown path", async () => {
    const base = await start();
    const res = await fetch(`${base}/not-mcp`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.error.message).toContain("/mcp");
  });

  it("honours a custom endpoint path", async () => {
    const base = await start({ path: "/rpc" });
    const res = await fetch(`${base}/rpc`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: MCP_ACCEPT },
      body: JSON.stringify(INITIALIZE),
    });
    expect(res.status).toBe(200);
  });
});

describe("dns rebinding protection", () => {
  it("rejects a request carrying an unlisted Host header", async () => {
    await start();
    const res = await rawPost(running!.port, "/mcp", { host: "evil.example.com" }, JSON.stringify(INITIALIZE));
    expect(res.status).toBe(403);
  });

  it("accepts a Host that is explicitly allowed", async () => {
    await start({ allowedHosts: ["evil.example.com"] });
    const res = await rawPost(running!.port, "/mcp", { host: "evil.example.com" }, JSON.stringify(INITIALIZE));
    expect(res.status).toBe(200);
  });

  it("rejects an unlisted Origin, the header the spec requires servers to validate", async () => {
    const base = await start();
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: MCP_ACCEPT, origin: "https://evil.example.com" },
      body: JSON.stringify(INITIALIZE),
    });
    expect(res.status).toBe(403);
  });

  it("accepts an Origin that is explicitly allowed", async () => {
    const base = await start({ allowedOrigins: ["https://app.example.com"] });
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: MCP_ACCEPT, origin: "https://app.example.com" },
      body: JSON.stringify(INITIALIZE),
    });
    expect(res.status).toBe(200);
  });

  it("can be turned off for a deployment behind a validating proxy", async () => {
    await start({ disableDnsRebindingProtection: true });
    const res = await rawPost(running!.port, "/mcp", { host: "anything.example.com" }, JSON.stringify(INITIALIZE));
    expect(res.status).toBe(200);
  });
});

describe("optional bearer auth", () => {
  it("rejects a request with no credentials", async () => {
    const base = await start({ authToken: "s3cret" });
    const res = await initialize(base);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("rejects a wrong token", async () => {
    const base = await start({ authToken: "s3cret" });
    const res = await initialize(base, { authorization: "Bearer wrong!" });
    expect(res.status).toBe(401);
  });

  it("accepts the token as a bearer credential", async () => {
    const base = await start({ authToken: "s3cret" });
    const res = await initialize(base, { authorization: "Bearer s3cret" });
    expect(res.status).toBe(200);
  });

  it("accepts the token as X-API-Key", async () => {
    const base = await start({ authToken: "s3cret" });
    const res = await initialize(base, { "x-api-key": "s3cret" });
    expect(res.status).toBe(200);
  });
});

describe("stateless mode", () => {
  it("answers without issuing a session id", async () => {
    const base = await start({ stateless: true });
    const res = await initialize(base);
    expect(res.status).toBe(200);
    expect(res.headers.get("mcp-session-id")).toBeNull();
    expect(parseSse(await res.text()).result.serverInfo).toBeTruthy();
  });

  it("serves independent requests with no session header", async () => {
    const base = await start({ stateless: true });
    const first = await initialize(base);
    await first.text();
    const second = await initialize(base);
    expect(second.status).toBe(200);
    await second.text();
  });
});

describe("request handling", () => {
  it("rejects a malformed JSON body with a parse error", async () => {
    const base = await start();
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: MCP_ACCEPT },
      body: "{not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
  });

  it("rejects a body over the configured limit", async () => {
    const base = await start({ maxBodyBytes: 64 });
    const res = await fetch(`${base}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: MCP_ACCEPT },
      body: JSON.stringify({ ...INITIALIZE, padding: "x".repeat(500) }),
    });
    expect(res.status).toBe(413);
  });
});
