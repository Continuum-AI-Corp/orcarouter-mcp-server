import {
  DEFAULT_HTTP_HOST,
  DEFAULT_HTTP_PORT,
  DEFAULT_MCP_PATH,
} from "./http.js";

export const USAGE = `orcarouter-mcp — Official MCP server for OrcaRouter

Usage: orcarouter-mcp [options]

Transport:
  --transport <stdio|http>   Transport to serve (default: stdio; env MCP_TRANSPORT)

HTTP options (ignored for stdio):
  --port <number>            Port to listen on (default: ${DEFAULT_HTTP_PORT}; env PORT)
  --host <address>           Interface to bind (default: ${DEFAULT_HTTP_HOST}; env HOST)
  --path <path>              Endpoint path (default: ${DEFAULT_MCP_PATH}; env MCP_HTTP_PATH)
  --stateless                One server per request; no Mcp-Session-Id (env MCP_HTTP_STATELESS=1)
  --allowed-hosts <a,b>      Host header allowlist (env MCP_HTTP_ALLOWED_HOSTS)
  --allowed-origins <a,b>    Origin header allowlist (env MCP_HTTP_ALLOWED_ORIGINS)
  --no-dns-rebinding-protection
                             Skip Host/Origin validation; only when a trusted proxy does it
  -h, --help                 Show this message

Environment:
  ORCAROUTER_API_KEY         OrcaRouter API key (catalog tools work without it)
  ORCAROUTER_BASE_URL        Override the API base URL
  ORCAROUTER_REQUEST_TIMEOUT Request timeout in seconds
  MCP_HTTP_AUTH_TOKEN        If set, HTTP requests must present it as
                             \`Authorization: Bearer <token>\` or \`X-API-Key\`
`;

export interface ParsedArgs {
  transport: "stdio" | "http";
  help: boolean;
  port?: number;
  host?: string;
  path?: string;
  stateless?: boolean;
  allowedHosts?: string[];
  allowedOrigins?: string[];
  disableDnsRebindingProtection?: boolean;
}

function envFlag(name: string): boolean | undefined {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return undefined;
  return raw === "1" || raw === "true" || raw === "yes";
}

function envList(name: string): string[] | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  const items = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function envPort(): number | undefined {
  const raw = process.env.PORT?.trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 && parsed < 65536 ? parsed : undefined;
}

/**
 * Flags win over environment, environment wins over defaults. Anything unrecognised is an error
 * rather than a silent no-op: a typo in a launcher config should fail loudly at start, not turn
 * into a server quietly listening somewhere unintended.
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    transport: (process.env.MCP_TRANSPORT?.trim().toLowerCase() as ParsedArgs["transport"]) || "stdio",
    help: false,
    port: envPort(),
    host: process.env.HOST?.trim() || undefined,
    path: process.env.MCP_HTTP_PATH?.trim() || undefined,
    stateless: envFlag("MCP_HTTP_STATELESS"),
    allowedHosts: envList("MCP_HTTP_ALLOWED_HOSTS"),
    allowedOrigins: envList("MCP_HTTP_ALLOWED_ORIGINS"),
  };

  const next = (i: number, flag: string): string => {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("-")) {
      throw new Error(`${flag} requires a value`);
    }
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        parsed.help = true;
        break;
      case "--transport": {
        const value = next(i, arg).toLowerCase();
        if (value !== "stdio" && value !== "http") {
          throw new Error(`Unknown transport "${value}"; expected "stdio" or "http"`);
        }
        parsed.transport = value;
        i += 1;
        break;
      }
      case "--port": {
        const value = Number(next(i, arg));
        if (!Number.isInteger(value) || value <= 0 || value >= 65536) {
          throw new Error(`--port must be an integer between 1 and 65535`);
        }
        parsed.port = value;
        i += 1;
        break;
      }
      case "--host":
        parsed.host = next(i, arg);
        i += 1;
        break;
      case "--path": {
        const value = next(i, arg);
        if (!value.startsWith("/")) throw new Error(`--path must start with "/"`);
        parsed.path = value;
        i += 1;
        break;
      }
      case "--stateless":
        parsed.stateless = true;
        break;
      case "--allowed-hosts":
        parsed.allowedHosts = next(i, arg).split(",").map((s) => s.trim()).filter(Boolean);
        i += 1;
        break;
      case "--allowed-origins":
        parsed.allowedOrigins = next(i, arg).split(",").map((s) => s.trim()).filter(Boolean);
        i += 1;
        break;
      case "--no-dns-rebinding-protection":
        parsed.disableDnsRebindingProtection = true;
        break;
      default:
        throw new Error(`Unknown argument "${arg}"`);
    }
  }

  if (parsed.transport !== "stdio" && parsed.transport !== "http") {
    throw new Error(`Unknown transport "${parsed.transport}"; expected "stdio" or "http"`);
  }
  return parsed;
}

export function serverOptionsFromEnv(): {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
} {
  const timeoutRaw = process.env.ORCAROUTER_REQUEST_TIMEOUT?.trim();
  let timeoutMs: number | undefined;
  if (timeoutRaw) {
    const parsedSeconds = Number(timeoutRaw);
    if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
      timeoutMs = parsedSeconds * 1000;
    }
  }
  return {
    apiKey: process.env.ORCAROUTER_API_KEY?.trim() || undefined,
    baseUrl: process.env.ORCAROUTER_BASE_URL?.trim() || undefined,
    timeoutMs,
  };
}

