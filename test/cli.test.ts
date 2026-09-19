import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseArgs, serverOptionsFromEnv } from "../src/cli.js";

const ENV_KEYS = [
  "MCP_TRANSPORT",
  "PORT",
  "HOST",
  "MCP_HTTP_PATH",
  "MCP_HTTP_STATELESS",
  "MCP_HTTP_ALLOWED_HOSTS",
  "MCP_HTTP_ALLOWED_ORIGINS",
  "ORCAROUTER_API_KEY",
  "ORCAROUTER_BASE_URL",
  "ORCAROUTER_REQUEST_TIMEOUT",
];

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe("parseArgs", () => {
  it("defaults to stdio so existing launchers are unaffected", () => {
    expect(parseArgs([]).transport).toBe("stdio");
  });

  it("selects the http transport by flag", () => {
    expect(parseArgs(["--transport", "http"]).transport).toBe("http");
  });

  it("selects the http transport by environment", () => {
    process.env.MCP_TRANSPORT = "http";
    expect(parseArgs([]).transport).toBe("http");
  });

  it("lets a flag override the environment", () => {
    process.env.MCP_TRANSPORT = "http";
    expect(parseArgs(["--transport", "stdio"]).transport).toBe("stdio");
  });

  it("rejects an unknown transport", () => {
    expect(() => parseArgs(["--transport", "carrier-pigeon"])).toThrow(/expected "stdio" or "http"/);
    process.env.MCP_TRANSPORT = "websocket";
    expect(() => parseArgs([])).toThrow(/expected "stdio" or "http"/);
  });

  it("rejects an unknown argument rather than ignoring it", () => {
    expect(() => parseArgs(["--porrt", "3000"])).toThrow(/Unknown argument/);
  });

  it("rejects a flag with a missing value", () => {
    expect(() => parseArgs(["--port"])).toThrow(/requires a value/);
    expect(() => parseArgs(["--port", "--stateless"])).toThrow(/requires a value/);
  });

  it("validates the port range", () => {
    expect(parseArgs(["--port", "8080"]).port).toBe(8080);
    expect(() => parseArgs(["--port", "0"])).toThrow(/between 1 and 65535/);
    expect(() => parseArgs(["--port", "70000"])).toThrow(/between 1 and 65535/);
    expect(() => parseArgs(["--port", "http"])).toThrow(/between 1 and 65535/);
  });

  it("ignores an unusable PORT from the environment instead of crashing", () => {
    process.env.PORT = "not-a-port";
    expect(parseArgs([]).port).toBeUndefined();
  });

  it("requires a leading slash on the endpoint path", () => {
    expect(parseArgs(["--path", "/rpc"]).path).toBe("/rpc");
    expect(() => parseArgs(["--path", "rpc"])).toThrow(/must start with/);
  });

  it("parses comma-separated allow lists from flags and environment", () => {
    expect(parseArgs(["--allowed-hosts", "a.example, b.example"]).allowedHosts)
      .toEqual(["a.example", "b.example"]);
    process.env.MCP_HTTP_ALLOWED_ORIGINS = "https://a.example,https://b.example";
    expect(parseArgs([]).allowedOrigins).toEqual(["https://a.example", "https://b.example"]);
  });

  it("keeps DNS rebinding protection on unless explicitly disabled", () => {
    expect(parseArgs([]).disableDnsRebindingProtection).toBeUndefined();
    expect(parseArgs(["--no-dns-rebinding-protection"]).disableDnsRebindingProtection).toBe(true);
  });

  it("reads --stateless and its environment equivalent", () => {
    expect(parseArgs(["--stateless"]).stateless).toBe(true);
    process.env.MCP_HTTP_STATELESS = "1";
    expect(parseArgs([]).stateless).toBe(true);
    process.env.MCP_HTTP_STATELESS = "false";
    expect(parseArgs([]).stateless).toBe(false);
  });

  it("recognises --help", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
    expect(parseArgs(["-h"]).help).toBe(true);
  });
});

describe("serverOptionsFromEnv", () => {
  it("returns undefined for unset values rather than empty strings", () => {
    expect(serverOptionsFromEnv()).toEqual({
      apiKey: undefined,
      baseUrl: undefined,
      timeoutMs: undefined,
    });
  });

  it("converts the timeout from seconds to milliseconds", () => {
    process.env.ORCAROUTER_REQUEST_TIMEOUT = "30";
    expect(serverOptionsFromEnv().timeoutMs).toBe(30_000);
  });

  it("ignores a non-positive or unparseable timeout", () => {
    process.env.ORCAROUTER_REQUEST_TIMEOUT = "-5";
    expect(serverOptionsFromEnv().timeoutMs).toBeUndefined();
    process.env.ORCAROUTER_REQUEST_TIMEOUT = "soon";
    expect(serverOptionsFromEnv().timeoutMs).toBeUndefined();
  });

  it("trims surrounding whitespace from the API key", () => {
    process.env.ORCAROUTER_API_KEY = "  sk-or-test  ";
    expect(serverOptionsFromEnv().apiKey).toBe("sk-or-test");
  });
});
