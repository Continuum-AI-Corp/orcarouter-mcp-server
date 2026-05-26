# Contributing to OrcaRouter MCP

Thanks for your interest. We welcome:

- Bug fixes
- New MCP client config examples in `examples/`
- README improvements and translations
- Tests for edge cases

## Development setup

Prerequisites: Node.js 18+. Bun is preferred for local dev (matches CI), npm works too.

```sh
# bun (preferred)
bun install
bun test
bun run typecheck
bun run build

# or npm
npm install
npm test
npm run typecheck
npm run build
```

## Running the server locally

```sh
# Catalog tools work without an API key; set ORCAROUTER_API_KEY only
# if you want to exercise the chat tool.
ORCAROUTER_API_KEY=sk-or-... node dist/index.js

# Or pipe MCP Inspector at it:
npx @modelcontextprotocol/inspector node dist/index.js
```

## Pull request flow

1. Fork → branch → make changes
2. `npm test` must pass; new tests welcome for new behavior
3. Open a PR with a description and link to any related issue
4. CI runs typecheck + tests on every PR
5. Maintainer reviews and merges

## Finding something to work on

Browse the [`good first issue`](https://github.com/Continuum-AI-Corp/orcarouter-mcp-server/labels/good%20first%20issue) label for newcomer-friendly tasks.

## Security

Do not file security issues publicly. See [SECURITY.md](SECURITY.md).
