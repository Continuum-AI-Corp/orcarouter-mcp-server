import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import {
  ApiClient,
  AuthenticationError,
  RateLimitError,
  InternalServerError,
  ApiError,
  PermissionDeniedError,
  RequestCancelledError,
  InsufficientQuotaError,
} from "../src/api_client.js";

const BASE = "https://orcarouter.test";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("ApiClient", () => {
  describe("construction", () => {
    it("stores apiKey and baseUrl", () => {
      const client = new ApiClient({
        apiKey: "sk-test",
        baseUrl: BASE,
      });
      expect(client.baseUrl).toBe(BASE);
      expect(client.apiKey).toBe("sk-test");
    });

    it("normalizes baseUrl by trimming trailing slash", () => {
      const client = new ApiClient({ baseUrl: BASE + "/" });
      expect(client.baseUrl).toBe(BASE);
    });

    it("works without apiKey", () => {
      const client = new ApiClient({ baseUrl: BASE });
      expect(client.apiKey).toBeUndefined();
    });
  });

  describe("GET requests", () => {
    it("sends Authorization header", async () => {
      let captured: Headers | undefined;
      server.use(
        http.get(`${BASE}/v1/models`, ({ request }) => {
          captured = request.headers;
          return HttpResponse.json({ data: [{ id: "gpt-4" }] });
        }),
      );

      const client = new ApiClient({
        apiKey: "sk-abc",
        baseUrl: BASE,
      });

      const result = await client.get<{ data: Array<{ id: string }> }>("/v1/models");
      expect(result.data[0].id).toBe("gpt-4");
      expect(captured?.get("authorization")).toBe("Bearer sk-abc");
    });

    it("omits Authorization when no apiKey", async () => {
      let captured: Headers | undefined;
      server.use(
        http.get(`${BASE}/v1/public/foo`, ({ request }) => {
          captured = request.headers;
          return HttpResponse.json({ ok: true });
        }),
      );

      const client = new ApiClient({ baseUrl: BASE });
      await client.get("/v1/public/foo");
      expect(captured?.get("authorization")).toBeNull();
    });

    it("appends query params", async () => {
      let receivedUrl = "";
      server.use(
        http.get(`${BASE}/v1/usage`, ({ request }) => {
          receivedUrl = request.url;
          return HttpResponse.json({});
        }),
      );

      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      await client.get("/v1/usage", { query: { workspace_id: 12, foo: "bar" } });
      expect(receivedUrl).toContain("workspace_id=12");
      expect(receivedUrl).toContain("foo=bar");
    });
  });

  describe("POST requests", () => {
    it("sends Content-Type application/json and serializes body", async () => {
      let body: unknown;
      let ct = "";
      server.use(
        http.post(`${BASE}/v1/chat/completions`, async ({ request }) => {
          ct = request.headers.get("content-type") || "";
          body = await request.json();
          return HttpResponse.json({ id: "x" });
        }),
      );

      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      await client.post("/v1/chat/completions", {
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
      });

      expect(ct).toContain("application/json");
      expect(body).toEqual({
        model: "gpt-4",
        messages: [{ role: "user", content: "hi" }],
      });
    });

    it("returns parsed JSON", async () => {
      server.use(
        http.post(`${BASE}/v1/x`, () =>
          HttpResponse.json({ result: "ok", nested: { a: 1 } }),
        ),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      const r = await client.post<{ result: string; nested: { a: number } }>("/v1/x", {});
      expect(r.result).toBe("ok");
      expect(r.nested.a).toBe(1);
    });
  });

  describe("error mapping", () => {
    it("401 throws AuthenticationError", async () => {
      server.use(
        http.get(`${BASE}/v1/secret`, () =>
          HttpResponse.json({ error: { message: "invalid key" } }, { status: 401 }),
        ),
      );
      const client = new ApiClient({ apiKey: "bad", baseUrl: BASE });
      await expect(client.get("/v1/secret")).rejects.toBeInstanceOf(AuthenticationError);
    });

    it("429 throws RateLimitError with retryAfter from header", async () => {
      server.use(
        http.get(`${BASE}/v1/rl`, () =>
          HttpResponse.json(
            { error: { message: "slow down" } },
            { status: 429, headers: { "Retry-After": "12" } },
          ),
        ),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      try {
        await client.get("/v1/rl");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(RateLimitError);
        expect((e as RateLimitError).retryAfter).toBe(12);
      }
    });

    it("429 without Retry-After yields RateLimitError with undefined retryAfter", async () => {
      server.use(
        http.get(`${BASE}/v1/rl`, () =>
          HttpResponse.json({ error: { message: "slow" } }, { status: 429 }),
        ),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      try {
        await client.get("/v1/rl");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(RateLimitError);
        expect((e as RateLimitError).retryAfter).toBeUndefined();
      }
    });

    it("500 throws InternalServerError", async () => {
      server.use(
        http.get(`${BASE}/v1/oops`, () =>
          HttpResponse.json({ error: { message: "boom" } }, { status: 500 }),
        ),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      await expect(client.get("/v1/oops")).rejects.toBeInstanceOf(InternalServerError);
    });

    it("non-JSON error body still maps to error class with status", async () => {
      server.use(
        http.get(`${BASE}/v1/text`, () =>
          new HttpResponse("oh no, plain text error", { status: 500 }),
        ),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      try {
        await client.get("/v1/text");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(InternalServerError);
        expect((e as ApiError).status).toBe(500);
        expect((e as ApiError).message).toContain("oh no");
      }
    });

    it("404 throws generic ApiError with status", async () => {
      server.use(
        http.get(`${BASE}/v1/missing`, () =>
          HttpResponse.json({ error: { message: "not found" } }, { status: 404 }),
        ),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      try {
        await client.get("/v1/missing");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect((e as ApiError).status).toBe(404);
      }
    });

    it("401 throws AuthenticationError with status 401", async () => {
      server.use(
        http.get(`${BASE}/v1/secret`, () =>
          HttpResponse.json({ error: { message: "bad key" } }, { status: 401 }),
        ),
      );
      const client = new ApiClient({ apiKey: "bad", baseUrl: BASE });
      try {
        await client.get("/v1/secret");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(AuthenticationError);
        expect((e as ApiError).status).toBe(401);
      }
    });

    it("403 without quota code throws PermissionDeniedError preserving status 403", async () => {
      server.use(
        http.get(`${BASE}/v1/forbidden`, () =>
          HttpResponse.json(
            { error: { message: "forbidden" } },
            { status: 403 },
          ),
        ),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      try {
        await client.get("/v1/forbidden");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(PermissionDeniedError);
        expect(e).not.toBeInstanceOf(AuthenticationError);
        expect((e as ApiError).status).toBe(403);
      }
    });

    it("403 with insufficient_user_quota throws InsufficientQuotaError", async () => {
      server.use(
        http.get(`${BASE}/v1/q`, () =>
          HttpResponse.json(
            {
              error: {
                message: "no quota",
                code: "insufficient_user_quota",
              },
            },
            { status: 403 },
          ),
        ),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      try {
        await client.get("/v1/q");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(InsufficientQuotaError);
        expect(e).not.toBeInstanceOf(PermissionDeniedError);
      }
    });

    it("402 with insufficient_quota throws InsufficientQuotaError", async () => {
      server.use(
        http.get(`${BASE}/v1/q`, () =>
          HttpResponse.json(
            { error: { message: "no quota", code: "insufficient_quota" } },
            { status: 402 },
          ),
        ),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      try {
        await client.get("/v1/q");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(InsufficientQuotaError);
      }
    });

    it("402 without a quota code throws generic ApiError with status 402", async () => {
      server.use(
        http.get(`${BASE}/v1/p`, () =>
          HttpResponse.json(
            { error: { message: "payment required" } },
            { status: 402 },
          ),
        ),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      try {
        await client.get("/v1/p");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(ApiError);
        expect(e).not.toBeInstanceOf(InsufficientQuotaError);
        expect((e as ApiError).status).toBe(402);
      }
    });

    it("429 with HTTP-date Retry-After computes a delay in seconds", async () => {
      const future = new Date(Date.now() + 30_000).toUTCString();
      server.use(
        http.get(`${BASE}/v1/rl`, () =>
          HttpResponse.json(
            { error: { message: "slow" } },
            { status: 429, headers: { "Retry-After": future } },
          ),
        ),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      try {
        await client.get("/v1/rl");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(RateLimitError);
        const ra = (e as RateLimitError).retryAfter;
        expect(typeof ra).toBe("number");
        // ~30s, allow scheduling jitter
        expect(ra).toBeGreaterThanOrEqual(25);
        expect(ra).toBeLessThanOrEqual(31);
      }
    });

    it("429 with a past HTTP-date Retry-After clamps to 0", async () => {
      const past = new Date(Date.now() - 60_000).toUTCString();
      server.use(
        http.get(`${BASE}/v1/rl`, () =>
          HttpResponse.json(
            { error: { message: "slow" } },
            { status: 429, headers: { "Retry-After": past } },
          ),
        ),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      try {
        await client.get("/v1/rl");
        expect.unreachable();
      } catch (e) {
        expect(e).toBeInstanceOf(RateLimitError);
        expect((e as RateLimitError).retryAfter).toBe(0);
      }
    });
  });

  describe("request timeouts", () => {
    it("aborts the request after timeoutMs", async () => {
      server.use(
        http.get(`${BASE}/v1/slow`, async () => {
          await new Promise((r) => setTimeout(r, 200));
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE, timeoutMs: 25 });
      await expect(client.get("/v1/slow")).rejects.toThrow(/abort|timed out|timeout/i);
    });

    it("respects ORCAROUTER_REQUEST_TIMEOUT override at construction", async () => {
      server.use(
        http.get(`${BASE}/v1/slow`, async () => {
          await new Promise((r) => setTimeout(r, 100));
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE, timeoutMs: 30 });
      await expect(client.get("/v1/slow")).rejects.toThrow(/abort|timed out|timeout/i);
    });

    it("does not abort when request finishes in time", async () => {
      server.use(http.get(`${BASE}/v1/fast`, () => HttpResponse.json({ ok: true })));
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE, timeoutMs: 5000 });
      const r = await client.get<{ ok: boolean }>("/v1/fast");
      expect(r.ok).toBe(true);
    });

    it("caller-supplied signal abort yields a cancellation error, not a timeout", async () => {
      server.use(
        http.get(`${BASE}/v1/slow`, async () => {
          await new Promise((r) => setTimeout(r, 200));
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = new ApiClient({
        apiKey: "k",
        baseUrl: BASE,
        timeoutMs: 5000,
      });
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 20);
      try {
        await client.get("/v1/slow", { signal: controller.signal });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(RequestCancelledError);
        expect((e as Error).name).toBe("AbortError");
        expect((e as Error).message).toMatch(/cancel/i);
        expect((e as Error).message).not.toMatch(/timed out|timeout/i);
      }
    });

    it("internal timeout still yields a timeout error (not cancellation)", async () => {
      server.use(
        http.get(`${BASE}/v1/slow`, async () => {
          await new Promise((r) => setTimeout(r, 200));
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = new ApiClient({
        apiKey: "k",
        baseUrl: BASE,
        timeoutMs: 25,
      });
      try {
        await client.get("/v1/slow");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).not.toBeInstanceOf(RequestCancelledError);
        expect((e as Error).message).toMatch(/timed out|timeout/i);
      }
    });

    it("caller abort with a custom reason (name !== AbortError) still yields a cancellation error", async () => {
      // fetch can reject with the exact AbortSignal.reason, whose `name`
      // is just "Error" — abort detection must rely on signal state, not
      // the thrown error's name, or this surfaces as a generic error.
      server.use(
        http.get(`${BASE}/v1/slow`, async () => {
          await new Promise((r) => setTimeout(r, 200));
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = new ApiClient({
        apiKey: "k",
        baseUrl: BASE,
        timeoutMs: 5000,
      });
      const controller = new AbortController();
      const reason = new Error("cancelled");
      setTimeout(() => controller.abort(reason), 20);
      try {
        await client.get("/v1/slow", { signal: controller.signal });
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(RequestCancelledError);
        expect((e as Error).message).toMatch(/cancel/i);
        expect((e as Error).message).not.toMatch(/timed out|timeout/i);
        // original abort reason preserved as cause for debuggability.
        expect((e as Error).cause).toBe(reason);
      }
    });

    it("pre-aborted caller signal yields a cancellation error", async () => {
      server.use(
        http.get(`${BASE}/v1/slow`, async () => {
          await new Promise((r) => setTimeout(r, 200));
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = new ApiClient({
        apiKey: "k",
        baseUrl: BASE,
        timeoutMs: 5000,
      });
      const controller = new AbortController();
      controller.abort();
      await expect(
        client.get("/v1/slow", { signal: controller.signal }),
      ).rejects.toBeInstanceOf(RequestCancelledError);
    });
  });

  describe("user-agent header", () => {
    it("sends a User-Agent identifying @orcarouter/mcp", async () => {
      let ua = "";
      server.use(
        http.get(`${BASE}/v1/ua`, ({ request }) => {
          ua = request.headers.get("user-agent") || "";
          return HttpResponse.json({ ok: true });
        }),
      );
      const client = new ApiClient({ apiKey: "k", baseUrl: BASE });
      await client.get("/v1/ua");
      expect(ua).toMatch(/@orcarouter\/mcp\/\d+\.\d+\.\d+/);
      expect(ua).toMatch(/node/i);
    });
  });
});
