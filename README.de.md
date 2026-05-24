<p align="center">
  <a href="https://www.orcarouter.ai">
    <img src="https://raw.githubusercontent.com/Continuum-AI-Corp/orcarouter-mcp-server/main/assets/logo.gif" alt="OrcaRouter" width="180" />
  </a>
</p>

<h1 align="center">OrcaRouter MCP Server</h1>

<p align="center">
  Offizieller MCP-Server für das <a href="https://www.orcarouter.ai">OrcaRouter</a> LLM-Gateway.
</p>

<p align="center">
  <a href="https://discord.com/invite/943Zqp9bs"><img src="https://img.shields.io/discord/1501106943178309662?logo=discord&label=discord&color=5865F2" alt="Discord" /></a>
  <a href="https://x.com/OrcaRouter"><img src="https://img.shields.io/badge/X-Follow-000000?logo=x&logoColor=white" alt="X" /></a>
  <a href="https://www.npmjs.com/package/@orcarouter/mcp"><img src="https://img.shields.io/npm/v/@orcarouter/mcp" alt="npm version" /></a>
  <a href="https://github.com/Continuum-AI-Corp/orcarouter-mcp-server/actions/workflows/test.yml"><img src="https://github.com/Continuum-AI-Corp/orcarouter-mcp-server/actions/workflows/test.yml/badge.svg" alt="CI" /></a>
</p>

<p align="center">
  <a href="README.md">English</a> | <a href="README.ja.md">日本語</a> | <a href="README.zh-CN.md">中文</a> | <a href="README.ko.md">한국어</a> | <a href="README.de.md">Deutsch</a> | <a href="README.fr.md">Français</a> | <a href="README.es.md">Español</a> | <a href="README.it.md">Italiano</a> | <a href="README.ru.md">Русский</a> | <a href="README.pt.md">Português</a> | <a href="README.vi.md">Tiếng Việt</a> | <a href="README.hi.md">हिन्दी</a>
</p>

<br/>

Durchstöbere den Modellkatalog von [OrcaRouter](https://www.orcarouter.ai) und führe Chat-Completions direkt aus jedem [Model Context Protocol](https://modelcontextprotocol.io)-Client aus — Claude Desktop, Claude Code, Cursor, Windsurf, Zed oder allem anderen, das das Protokoll spricht.

Das Durchstöbern des Katalogs funktioniert **ohne API-Schlüssel** — vergleiche Preise und Fähigkeiten, bevor du dich registrierst.

## Was du tun kannst

- 🗺️  Provider und Modelle ohne API-Schlüssel entdecken
- 💬 Chat-Completions über jedes bereitgestellte Modell ausführen
- 🧠 Anfragen automatisch über den `orcarouter/auto`-Router deines Workspaces leiten (Strategien: cost / quality / balanced / LinUCB / gated-adaptive)
- 🔁 Fallback-Ketten konfigurieren (primär + bis zu 4 Fallbacks) für mehr Robustheit
- 📊 Modelle serverseitig nach Provider, Fähigkeit oder Mindest-Kontextfenster filtern
- 🎯 Detaillierte Modellkarten einsehen: Preise, Kontext, Latenz, unterstützte Endpunkte
- 🔌 Funktioniert mit Claude Desktop, Claude Code, Cursor, Windsurf, Zed und jedem MCP-Client

## Beispiele

Versuche zum Beispiel solche Eingaben:

- *"Liste alle Provider auf OrcaRouter"*
- *"Zeig mir alle Anthropic-Modelle mit ihren Preisen"*
- *"Hol Details zu `minimax/minimax-m2.7`"*
- *"Chatte mit `orcarouter/auto` und erkläre Quantencomputing"*

## Schnellstart

### Claude Code (CLI-Einzeiler)

```bash
claude mcp add orcarouter -s user \
  -e ORCAROUTER_API_KEY=sk-orca-your-key \
  -- npx -y @orcarouter/mcp
```

### Andere Clients (Konfigurationsdatei-Pfad)

1. Kopiere die Beispielkonfiguration für deinen MCP-Client in die Konfigurationsdatei des Clients:

   | Client          | Beispiel                                            | Aktion    |
   | --------------- | --------------------------------------------------- | --------- |
   | Claude Desktop  | [claude-desktop.json](examples/claude-desktop.json) | Ersetzen  |
   | Claude Code     | [claude-code.json](examples/claude-code.json)       | Mergen    |
   | Cursor          | [cursor.json](examples/cursor.json)                 | Ersetzen  |
   | Windsurf        | [windsurf.json](examples/windsurf.json)             | Ersetzen  |

   Siehe [`examples/README.md`](examples/README.md) für die Pfade der Konfigurationsdateien sowie Hinweise zu Zed und anderen Clients.

2. Ersetze `sk-or-...` in der kopierten Datei durch deinen [OrcaRouter API-Schlüssel](https://www.orcarouter.ai/console).
3. Starte deinen MCP-Client neu.

Erfordert Node.js 18 oder höher. Die Umgebungsvariable `ORCAROUTER_API_KEY` wird nur für `orcarouter_chat` benötigt; die Katalog-Tools funktionieren auch ohne sie.

## Tools

- `orcarouter_chat` — eine Chat-Completion ausführen (mit optionaler Fallback-Kette)
- `orcarouter_models_list` — den Katalog durchstöbern (Preise, Kontext, Fähigkeiten)
- `orcarouter_model_card` — detaillierte Informationen zu einem Modell
- `orcarouter_providers_list` — Provider mit Modellanzahl auflisten

Die vollständigen Eingabeschemata werden zur Laufzeit über die MCP-Methode `tools/list` bereitgestellt — dein MCP-Client (Claude Desktop, Cursor usw.) liest sie automatisch.

## Konfiguration

| Name                        | Erforderlich | Beschreibung                                              |
| --------------------------- | ------------ | --------------------------------------------------------- |
| `ORCAROUTER_API_KEY`        | optional     | OrcaRouter API-Schlüssel. Nur für `orcarouter_chat` erforderlich. |
| `ORCAROUTER_BASE_URL`       | optional     | API-Basis-URL. Standard ist `https://api.orcarouter.ai`.  |
| `ORCAROUTER_REQUEST_TIMEOUT`| optional     | HTTP-Timeout pro Anfrage in **Sekunden**. Standard ist `300`. |

## Sicherheit

API-Schlüssel werden aus Umgebungsvariablen gelesen, niemals geloggt und ausschließlich an die OrcaRouter-API gesendet. Siehe [SECURITY.md](SECURITY.md) für die Richtlinie zur Offenlegung von Schwachstellen.

## Entwicklung

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

Der Build erzeugt ein ESM-Bundle unter `dist/index.js` mit einem `#!/usr/bin/env node`-Shebang, ausführbar als `orcarouter-mcp`-Binary.

## Lizenz

[MIT](LICENSE)
