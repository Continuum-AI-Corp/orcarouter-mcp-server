# Configuration Examples

Pick the file matching your MCP client and copy it (or merge it) into the
client's config file. Then replace `sk-or-...` with your real
[OrcaRouter API key](https://www.orcarouter.ai/console) and restart the
client.

| Client          | Example                                    | Client config file                                                                                                                | How to apply |
| --------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Claude Desktop  | [claude-desktop.json](claude-desktop.json) | `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) / `%APPDATA%\Claude\claude_desktop_config.json` (Windows) | Replace contents |
| Claude Code     | [claude-code.json](claude-code.json)       | `~/.claude.json`                                                                                                                  | Merge under top-level `mcpServers` key (Claude Code stores other settings here too) |
| Cursor          | [cursor.json](cursor.json)                 | `~/.cursor/mcp.json`                                                                                                              | Replace contents |
| Windsurf        | [windsurf.json](windsurf.json)             | `~/.codeium/windsurf/mcp_config.json`                                                                                             | Replace contents |
| Any HTTP client | [http.json](http.json)                     | your client's MCP config                                                                                                          | Use when the server is already running with `--transport http` |

The `http.json` example assumes a server started separately with
`npx -y @orcarouter/mcp --transport http`. Unlike the stdio examples the
client does not launch the server, so `ORCAROUTER_API_KEY` belongs in the
server's environment rather than the client config. If that server is
reachable over a network, give it `MCP_HTTP_AUTH_TOKEN` and send the same
value from the client as an `Authorization: Bearer` header.

For Zed and other MCP clients, consult your client's documentation for
the exact config schema and merge the `orcarouter` entry under whatever
key the client uses (`mcpServers`, `context_servers`, etc.).

`ORCAROUTER_API_KEY` is only required for `orcarouter_chat`. The
catalog tools (`orcarouter_models_list`, `orcarouter_model_card`) work
without an API key — you can omit the `env` block if you only need
catalog access.
