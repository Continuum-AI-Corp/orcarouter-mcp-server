# Changelog

All notable changes to `@orcarouter/mcp` follow the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## v1.1.2

### Changed

- **Repository moved.** The canonical source now lives at
  `github.com/Continuum-AI-Corp/orcarouter-mcp-server`. Earlier
  versions (`1.0.0` / `1.1.0`) were unpublished from the registry;
  this is the first release under the new repository anchor.
- **SDK code is identical to 1.1.0** — no functional changes. Only
  the `repository.url` / `bugs.url` / `homepage` fields in
  `package.json` and absolute URLs in the README were updated.

## v1.1.0

### Changed

- **Default request timeout raised from 60 seconds to 300 seconds (5 minutes).**
  Reasoning models (`gpt-5`, `o1`, `o3`, …) and large-context completions
  routinely exceed 60s on the wire — the old default surfaced as confusing
  `OrcaRouter request timed out` errors mid-completion. Override with
  `ORCAROUTER_REQUEST_TIMEOUT` (seconds) as before. This is observable
  behavior: callers who never set the env var will now wait up to 5
  minutes before seeing a timeout. Set `ORCAROUTER_REQUEST_TIMEOUT=60`
  if you preferred the old behavior.

## v1.0.0

First stable release. Package is now feature-complete for the v1 contract:
4 MCP tools (`orcarouter_chat`, `orcarouter_models_list`,
`orcarouter_model_card`, `orcarouter_providers_list`), server-side
filters, auto-router default, OpenAI-reasoning-model wire translation,
and 12-language README. No public-API changes vs v0.2.0 — this is a
semver promotion only.

## v0.2.0

### Breaking changes

- Filtering moved server-side. Requires OrcaRouter backend with
  `/api/public/providers` and `/v1/models?provider=&capability=&min_context=`
  query filter support (deployed late May 2026 or later). v0.1.x SDKs
  continue working with older backends.

### New

- `orcarouter_providers_list` tool. Lists available providers with model counts.
- `orcarouter_models_list` accepts `provider`, `capability`, `min_context`
  filters that forward to backend.
- `orcarouter_model_card` description now requires `provider/slug` form
  (matches admin convention; bare model names not advertised).
- `orcarouter_chat`: simplified to single-turn `prompt` + optional
  `system_prompt`. Removed multi-turn `messages` escape hatch. Defaults:
  model=`orcarouter/auto`, max_tokens=2000, temperature=0.7. max_tokens
  auto-translates to `max_completion_tokens` wire field for OpenAI
  reasoning models (gpt-5/o1/o3/...).

## [0.1.0] - 2026-05-22

Initial release.

### Tools

- **`orcarouter_chat`** — Run chat completions through the OrcaRouter
  gateway, with optional model fallback chain (up to 5 entries). The
  declared `model` always runs first; subsequent entries are tried
  on failure. Streaming is not exposed via the tool.
- **`orcarouter_models_list`** — Anonymous catalog browsing. Returns
  each model's `id`, `name`, `description`, `context_length`,
  `supported_endpoint_types`, `pricing` (per-token and per-1M-token),
  and `owned_by`. Includes `orcarouter/*` router aliases. Filterable
  by `provider`, `capability` (`chat`/`embedding`/`image`/`audio`),
  and `min_context`. No API key required.
- **`orcarouter_model_card`** — Per-model detail (display name,
  long description, context window, max output, modalities, supported
  endpoints, pricing, latency percentiles, release date). Accepts
  both `provider/slug` (e.g. `openai/gpt-4o-mini`) and bare ids
  (e.g. `kimi-k2.5`). No API key required.

### Compatibility

- Node.js 18+.
- MCP protocol revision 2025-06-18 (`@modelcontextprotocol/sdk` v1.29+).
- Validated against Claude Desktop, Claude Code, Cursor, and Windsurf
  MCP clients.

### Configuration

- `ORCAROUTER_API_KEY` — required only for `orcarouter_chat`.
- `ORCAROUTER_BASE_URL` — defaults to `https://api.orcarouter.ai`.
- `ORCAROUTER_WORKSPACE_ID` — optional workspace scope.
- `ORCAROUTER_REQUEST_TIMEOUT_MS` — per-request timeout, defaults to 60s.
