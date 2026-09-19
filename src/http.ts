import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createOrcaRouterMcpServer, type CreateServerOptions } from "./server.js";

/** Defaults chosen to match the transport spec's security guidance; see `HttpServerOptions`. */
export const DEFAULT_HTTP_PORT = 3000;
export const DEFAULT_HTTP_HOST = "127.0.0.1";
export const DEFAULT_MCP_PATH = "/mcp";

export interface HttpServerOptions {
  /** Passed straight through to `createOrcaRouterMcpServer` for each session. */
  server?: CreateServerOptions;
  port?: number;
  /**
   * Interface to bind. Defaults to loopback: the transport spec says servers "SHOULD bind only to
   * localhost (127.0.0.1) rather than all network interfaces" when running locally, and a local
   * launch is the common case. Containers and hosted deployments set `0.0.0.0` explicitly.
   */
  host?: string;
  /** Endpoint path. The spec requires one path serving both POST and GET. */
  path?: string;
  /**
   * Stateless mode creates a fresh server and transport per request and never issues an
   * `Mcp-Session-Id`. Every tool here is a single round trip to OrcaRouter's own stateless API, so
   * nothing is lost, and it lets several replicas sit behind one load balancer with no sticky
   * routing. Stateful is the default because it is the fuller surface: it supports the GET SSE
   * stream for server-initiated messages, which stateless must answer with 405.
   */
  stateless?: boolean;
  /** Host header allowlist for DNS-rebinding protection. Defaults to loopback on the bound port. */
  allowedHosts?: string[];
  /** Origin header allowlist. Defaults to the same loopback origins. */
  allowedOrigins?: string[];
  /**
   * Disables Host/Origin validation. The spec says servers MUST validate `Origin`, so this exists
   * only for deployments where a trusted proxy has already done it, and it is never the default.
   */
  disableDnsRebindingProtection?: boolean;
  /**
   * Optional shared secret required on every MCP request, as `Authorization: Bearer <token>` or
   * `X-API-Key`. The spec's full answer for remote servers is OAuth 2.1; this is the small,
   * honest alternative for a server put behind a reverse proxy on a private network. Unset means
   * no check, which is only safe on loopback.
   */
  authToken?: string;
  /** Health endpoint path, or `null` to disable it. */
  healthPath?: string | null;
  /** Largest acceptable request body. */
  maxBodyBytes?: number;
  /** Diagnostics sink. Defaults to stderr, so stdout stays clean for the stdio transport. */
  log?: (line: string) => void;
}

export interface RunningHttpServer {
  httpServer: HttpServer;
  port: number;
  host: string;
  path: string;
  close: () => Promise<void>;
}

const DEFAULT_MAX_BODY_BYTES = 4 * 1024 * 1024;

/** Carries the HTTP status a failure should map to, so the handler need not guess. */
class HttpError extends Error {
  constructor(readonly status: number, readonly rpcCode: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

function defaultAllowList(host: string, port: number): string[] {
  const names = host === "127.0.0.1" || host === "::1" || host === "localhost"
    ? ["127.0.0.1", "localhost", "[::1]"]
    : [host];
  return names.map((n) => `${n}:${port}`);
}

function logLine(log: ((line: string) => void) | undefined, level: string, message: string, extra: Record<string, unknown> = {}): void {
  const sink = log ?? ((line: string) => process.stderr.write(`${line}\n`));
  sink(JSON.stringify({ level, message, ...extra }));
}

/** Constant-time comparison so a wrong token cannot be recovered by timing the rejection. */
function tokenMatches(expected: string, presented: string | undefined): boolean {
  if (!presented) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function presentedToken(req: IncomingMessage): string | undefined {
  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice(7).trim();
  }
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string" && apiKey) return apiKey;
  return undefined;
}

function readBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        // Stop reading but leave the socket alive: destroying it here races the response and the
        // client sees a dropped connection instead of the reason it was refused.
        req.pause();
        reject(new HttpError(413, -32600, `Request body exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (err) {
        reject(new HttpError(400, -32700, `Invalid JSON body: ${err instanceof Error ? err.message : String(err)}`));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

/**
 * JSON-RPC shaped errors, so a client surfaces something it can parse instead of bare HTML.
 * `id: null` is what the spec prescribes for an error that cannot be tied to a request.
 */
function sendRpcError(res: ServerResponse, status: number, code: number, message: string): void {
  sendJson(res, status, { jsonrpc: "2.0", error: { code, message }, id: null });
}

/**
 * Start the MCP server on a Streamable HTTP endpoint.
 *
 * The SDK's `StreamableHTTPServerTransport` implements the wire protocol — POST, the GET SSE
 * stream, DELETE session termination, `Mcp-Session-Id`, `MCP-Protocol-Version` and
 * Host/Origin validation. What lives here is the Node HTTP plumbing around it: routing, body
 * reading, optional auth, and the session registry that stateful mode needs.
 */
export async function startHttpServer(options: HttpServerOptions = {}): Promise<RunningHttpServer> {
  const port = options.port ?? DEFAULT_HTTP_PORT;
  const host = options.host ?? DEFAULT_HTTP_HOST;
  const path = options.path ?? DEFAULT_MCP_PATH;
  const healthPath = options.healthPath === undefined ? "/healthz" : options.healthPath;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const stateless = options.stateless ?? false;
  const log = options.log;

  const enableDnsRebindingProtection = !options.disableDnsRebindingProtection;

  // Resolved on first use rather than up front, because `port: 0` asks the OS to pick a free port
  // and the default allowlist has to name the port the server actually bound. Computing it from
  // the requested port left the allowlist saying `127.0.0.1:0` and rejected every request.
  let cachedTransportOptions: {
    enableDnsRebindingProtection: boolean;
    allowedHosts?: string[];
    allowedOrigins?: string[];
  } | undefined;

  const transportOptionsFor = () => {
    if (cachedTransportOptions) return cachedTransportOptions;
    if (!enableDnsRebindingProtection) {
      cachedTransportOptions = { enableDnsRebindingProtection: false };
      return cachedTransportOptions;
    }
    const address = httpServer.address();
    const boundPort = typeof address === "object" && address ? address.port : port;
    const allowedHosts = options.allowedHosts ?? defaultAllowList(host, boundPort);
    const allowedOrigins = options.allowedOrigins ??
      allowedHosts.flatMap((h) => [`http://${h}`, `https://${h}`]);
    cachedTransportOptions = { enableDnsRebindingProtection: true, allowedHosts, allowedOrigins };
    return cachedTransportOptions;
  };

  // Stateful sessions only. Keyed by the id the transport generates at initialization and
  // removed on close, so a client that disconnects does not leave an entry behind.
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  async function handleStateless(req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
    const { server } = createOrcaRouterMcpServer(options.server);
    const transport = new StreamableHTTPServerTransport({
      ...transportOptionsFor(),
      sessionIdGenerator: undefined,
    });
    // Nothing may outlive the response in stateless mode; closing both here is what guarantees it.
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  async function handleStateful(req: IncomingMessage, res: ServerResponse, body: unknown): Promise<void> {
    const headerSessionId = req.headers["mcp-session-id"];
    const sessionId = typeof headerSessionId === "string" ? headerSessionId : undefined;

    if (sessionId) {
      const existing = sessions.get(sessionId);
      if (!existing) {
        // The spec: a server that has terminated a session MUST answer 404 for that id, and a
        // client receiving 404 starts a new session with a fresh InitializeRequest.
        sendRpcError(res, 404, -32001, "Unknown or expired session; reinitialize to continue.");
        return;
      }
      await existing.handleRequest(req, res, body);
      return;
    }

    if (!isInitializeRequest(body)) {
      sendRpcError(res, 400, -32000, "Missing Mcp-Session-Id header; the first request must be an initialize request.");
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      ...transportOptionsFor(),
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id: string) => {
        sessions.set(id, transport);
        logLine(log, "debug", "session initialized", { sessionId: id, sessions: sessions.size });
      },
      onsessionclosed: (id: string) => {
        sessions.delete(id);
        logLine(log, "debug", "session closed", { sessionId: id, sessions: sessions.size });
      },
    });
    // Belt and braces: `onsessionclosed` covers an explicit DELETE, this covers a transport that
    // closes for any other reason. Without it the map grows for the life of the process.
    transport.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    const { server } = createOrcaRouterMcpServer(options.server);
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }

  const httpServer = createHttpServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (healthPath && url.pathname === healthPath && req.method === "GET") {
      // Deliberately unauthenticated and free of upstream calls: a liveness probe must be able to
      // say "the process is up" without spending a request against the caller's OrcaRouter quota.
      sendJson(res, 200, {
        status: "ok",
        transport: "streamable-http",
        mode: stateless ? "stateless" : "stateful",
        ...(stateless ? {} : { sessions: sessions.size }),
      });
      return;
    }

    if (url.pathname !== path) {
      sendRpcError(res, 404, -32601, `No MCP endpoint at ${url.pathname}; use ${path}`);
      return;
    }

    if (options.authToken && !tokenMatches(options.authToken, presentedToken(req))) {
      res.setHeader("WWW-Authenticate", 'Bearer realm="orcarouter-mcp"');
      sendRpcError(res, 401, -32001, "Unauthorized: supply the bearer token or X-API-Key.");
      return;
    }

    void (async () => {
      try {
        // GET opens the SSE stream and DELETE terminates a session; neither carries a JSON body.
        const body = req.method === "POST" ? await readBody(req, maxBodyBytes) : undefined;
        if (stateless) await handleStateless(req, res, body);
        else await handleStateful(req, res, body);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const status = err instanceof HttpError ? err.status : 400;
        const rpcCode = err instanceof HttpError ? err.rpcCode : -32603;
        logLine(log, "error", "request failed", { message, status });
        if (!res.headersSent) sendRpcError(res, status, rpcCode, message);
        else res.end();
      }
    })();
  });

  // A tool call can legitimately take minutes while a model thinks, so the server must not apply
  // its own idle deadline to a request or its streamed response.
  httpServer.requestTimeout = 0;
  httpServer.headersTimeout = 0;

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener("error", reject);
      resolve();
    });
  });

  const address = httpServer.address();
  const boundPort = typeof address === "object" && address ? address.port : port;

  logLine(log, "info", "listening", {
    url: `http://${host}:${boundPort}${path}`,
    mode: stateless ? "stateless" : "stateful",
    dnsRebindingProtection: enableDnsRebindingProtection,
    auth: options.authToken ? "bearer" : "none",
  });
  if (!options.authToken && host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
    logLine(log, "warn", "bound to a non-loopback interface with no auth token; put it behind a proxy that authenticates, or set one");
  }

  return {
    httpServer,
    port: boundPort,
    host,
    path,
    close: async () => {
      for (const transport of sessions.values()) await transport.close();
      sessions.clear();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
