<p align="center">
  <a href="https://www.orcarouter.ai">
    <img src="https://raw.githubusercontent.com/Continuum-AI-Corp/orcarouter-mcp-server/main/assets/logo.gif" alt="OrcaRouter" width="180" />
  </a>
</p>

<h1 align="center">OrcaRouter MCP Server</h1>

<p align="center">
  Official MCP server for the <a href="https://www.orcarouter.ai">OrcaRouter</a> LLM gateway.
</p>

<p align="center">
  <a href="https://discord.com/invite/943Zqp9bs"><img src="https://img.shields.io/discord/1501106943178309662?logo=discord&label=discord&color=5865F2" alt="Discord" /></a>
  <a href="https://x.com/OrcaRouter"><img src="https://img.shields.io/badge/X-Follow-000000?logo=x&logoColor=white" alt="X" /></a>
  <a href="https://www.npmjs.com/package/@orcarouter/mcp"><img src="https://img.shields.io/npm/v/@orcarouter/mcp" alt="npm version" /></a>
  <a href="https://github.com/Continuum-AI-Corp/orcarouter-mcp-server/actions/workflows/test.yml"><img src="https://github.com/Continuum-AI-Corp/orcarouter-mcp-server/actions/workflows/test.yml/badge.svg" alt="CI" /></a>
  <a href="https://smithery.ai/servers/continuum-ai-corp/orcarouter-mcp"><img src="https://smithery.ai/badge/continuum-ai-corp/orcarouter-mcp" alt="Smithery" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh-CN.md">中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.fr.md">Français</a> | <a href="README.es.md">Español</a> | <a href="README.it.md">Italiano</a> | <a href="README.ru.md">Русский</a> | <a href="README.pt.md">Português</a> | <a href="README.vi.md">Tiếng Việt</a> | <a href="README.hi.md">हिन्दी</a>
</p>

<br/>

Browse [OrcaRouter](https://www.orcarouter.ai)'s model catalog and run chat
completions from inside any [Model Context Protocol](https://modelcontextprotocol.io)
client — Claude Desktop, Claude Code, Cursor, Windsurf, Zed, or anything
else that speaks the protocol.

Catalog browsing works **without an API key** — compare pricing and
capabilities before signing up.

## What you can do

- 🗺️  Discover providers and models without an API key
- 💬 Run chat completions through any served model
- 🧠 Auto-route requests through your workspace's `orcarouter/auto` router (cost / quality / balanced / LinUCB / gated-adaptive strategies)
- 🔁 Configure fallback chains (primary + up to 4 fallbacks) for resilience
- 📊 Filter models server-side by provider, capability, or minimum context window
- 🎯 Inspect detailed model cards: pricing, context, latency, supported endpoints
- 🔌 Works with Claude Desktop, Claude Code, Cursor, Windsurf, Zed, and any MCP client

## Examples

Try saying things like:

- *"List all providers on OrcaRouter"*
- *"Show me all Anthropic models with their pricing"*
- *"Get details about `minimax/minimax-m2.7`"*
- *"Chat with `orcarouter/auto` and explain quantum computing"*

## Quick Start

### Claude Code (CLI one-liner)

```bash
claude mcp add orcarouter -s user \
  -e ORCAROUTER_API_KEY=sk-orca-your-key \
  -- npx -y @orcarouter/mcp
```

### Other clients (config-file path)

1. Copy the example config for your MCP client into the client's config file:

   | Client          | Example                                             | Action  |
   | --------------- | --------------------------------------------------- | ------- |
   | Claude Desktop  | [claude-desktop.json](examples/claude-desktop.json) | Replace |
   | Claude Code     | [claude-code.json](examples/claude-code.json)       | Merge   |
   | Cursor          | [cursor.json](examples/cursor.json)                 | Replace |
   | Windsurf        | [windsurf.json](examples/windsurf.json)             | Replace |

   See [`examples/README.md`](examples/README.md) for the config-file paths and notes on Zed and other clients.

2. Replace `sk-or-...` in the copied file with your [OrcaRouter API key](https://www.orcarouter.ai/console).
3. Restart your MCP client.

The root [`.mcp.json`](.mcp.json) is the same config in the [Open Plugins](https://open-plugins.com) standard location, so registry/discovery tools that scan for it (e.g. [cursor.directory](https://cursor.directory)) can pick this server up automatically.

Requires Node.js 18 or later. The `ORCAROUTER_API_KEY` env var is only
required for `orcarouter_chat`; catalog tools work without it.

## Tools

- `orcarouter_chat` — run a chat completion (with optional fallback chain)
- `orcarouter_models_list` — browse the catalog (pricing, context, capabilities)
- `orcarouter_model_card` — detailed info for one model
- `orcarouter_providers_list` — list providers with model counts

Full input schemas are exposed at runtime via the MCP `tools/list` method — your MCP client (Claude Desktop, Cursor, etc.) reads them automatically.

## Remote / HTTP transport

By default the server speaks MCP over **stdio**, which is what a client that
launches it as a subprocess expects. Pass `--transport http` to serve the
[Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
transport instead, for when you want to host one instance and point several
clients at it.

```sh
# defaults: 127.0.0.1:3000, endpoint /mcp, sessions on
npx -y @orcarouter/mcp --transport http

# a hosted deployment behind a reverse proxy
MCP_TRANSPORT=http \
MCP_HTTP_AUTH_TOKEN=$(openssl rand -hex 32) \
npx -y @orcarouter/mcp --host 0.0.0.0 --port 3000 \
  --allowed-hosts mcp.example.com
```

Point a client at it with the `http` server type:

```json
{
  "mcpServers": {
    "orcarouter": {
      "type": "http",
      "url": "http://127.0.0.1:3000/mcp"
    }
  }
}
```

| Flag | Environment | Default | Description |
| --- | --- | --- | --- |
| `--transport <stdio\|http>` | `MCP_TRANSPORT` | `stdio` | Transport to serve. |
| `--port <n>` | `PORT` | `3000` | Port to listen on. |
| `--host <addr>` | `HOST` | `127.0.0.1` | Interface to bind. |
| `--path <path>` | `MCP_HTTP_PATH` | `/mcp` | Endpoint path. |
| `--stateless` | `MCP_HTTP_STATELESS` | off | One server per request; no `Mcp-Session-Id`. |
| `--allowed-hosts <a,b>` | `MCP_HTTP_ALLOWED_HOSTS` | bound host | `Host` header allowlist. |
| `--allowed-origins <a,b>` | `MCP_HTTP_ALLOWED_ORIGINS` | bound host | `Origin` header allowlist. |
| `--no-dns-rebinding-protection` | — | off | Skip `Host`/`Origin` validation. |
| — | `MCP_HTTP_AUTH_TOKEN` | unset | Require this secret as `Authorization: Bearer` or `X-API-Key`. |

`GET /healthz` answers without authentication and makes no call to the
OrcaRouter API, so a liveness probe never spends your quota.

**Stateful vs stateless.** The default issues an `Mcp-Session-Id` and keeps a
session per client, which supports the `GET` SSE stream for server-initiated
messages. `--stateless` builds a fresh server per request and returns no
session id — every tool here is one round trip to a stateless API, so nothing
is lost, and it lets several replicas sit behind a load balancer with no
sticky routing.

### Security for HTTP deployments

The transport spec is explicit about what an HTTP MCP server owes its users,
and the defaults here follow it:

- **Binds to `127.0.0.1`**, not `0.0.0.0`. Exposing it is a deliberate act.
- **Validates `Host` and `Origin`** on every request, rejecting anything not
  on the allowlist with `403`. This is what stops a page in someone's browser
  from driving a local MCP server through DNS rebinding. Name your public
  hostname with `--allowed-hosts` when you put it behind a proxy.
- **`MCP_HTTP_AUTH_TOKEN`** adds a shared-secret check. It is the small answer
  for a server on a private network behind a proxy; the spec's full answer for
  a public endpoint is OAuth 2.1, which this server does not implement — put
  it behind something that does.

## Configuration

| Name                        | Required | Description                                              |
| --------------------------- | -------- | -------------------------------------------------------- |
| `ORCAROUTER_API_KEY`        | optional | OrcaRouter API key. Required only for `orcarouter_chat`. |
| `ORCAROUTER_BASE_URL`       | optional | API base URL. Defaults to `https://api.orcarouter.ai`.   |
| `ORCAROUTER_REQUEST_TIMEOUT`| optional | Per-request HTTP timeout in **seconds**. Defaults to `300`. |
| `MCP_TRANSPORT`             | optional | `stdio` (default) or `http`. See [Remote / HTTP transport](#remote--http-transport). |

## Security

API keys are read from environment variables, never logged, and only
sent to the OrcaRouter API. See [SECURITY.md](SECURITY.md) for the
vulnerability disclosure policy.

Running over HTTP adds a network surface; see
[Security for HTTP deployments](#security-for-http-deployments).

## Development

```sh
# bun (preferred)
bun install
bun run test
bun run typecheck
bun run build

# or with npm
npm install
npm test
npm run typecheck
npm run build
```

The build produces an ESM bundle at `dist/index.js` with a
`#!/usr/bin/env node` shebang, runnable as the `orcarouter-mcp` binary.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). For newcomer-friendly tasks, browse the [`good first issue`](https://github.com/Continuum-AI-Corp/orcarouter-mcp-server/labels/good%20first%20issue) label.

## License

[MIT](LICENSE)
