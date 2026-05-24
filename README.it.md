<p align="center">
  <a href="https://www.orcarouter.ai">
    <img src="https://raw.githubusercontent.com/Continuum-AI-Corp/orcarouter-mcp-server/main/assets/logo.gif" alt="OrcaRouter" width="180" />
  </a>
</p>

<h1 align="center">OrcaRouter MCP Server</h1>

<p align="center">
  Server MCP ufficiale per il gateway LLM <a href="https://www.orcarouter.ai">OrcaRouter</a>.
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

Esplora il catalogo dei modelli di [OrcaRouter](https://www.orcarouter.ai) ed
esegui chat completion da qualsiasi client [Model Context Protocol](https://modelcontextprotocol.io)
— Claude Desktop, Claude Code, Cursor, Windsurf, Zed o qualunque altro
strumento che parli il protocollo.

La consultazione del catalogo funziona **senza chiave API** — confronta
prezzi e capacità prima di registrarti.

## Cosa puoi fare

- 🗺️  Scopri provider e modelli senza una chiave API
- 💬 Esegui chat completion attraverso qualsiasi modello servito
- 🧠 Instrada automaticamente le richieste tramite il router `orcarouter/auto` del tuo workspace (strategie cost / quality / balanced / LinUCB / gated-adaptive)
- 🔁 Configura catene di fallback (primario + fino a 4 fallback) per maggiore resilienza
- 📊 Filtra i modelli lato server per provider, capacità o context window minimo
- 🎯 Consulta schede modello dettagliate: prezzi, contesto, latenza, endpoint supportati
- 🔌 Funziona con Claude Desktop, Claude Code, Cursor, Windsurf, Zed e qualsiasi client MCP

## Esempi

Prova a dire cose come:

- *"Elenca tutti i provider su OrcaRouter"*
- *"Mostrami tutti i modelli Anthropic con i relativi prezzi"*
- *"Dammi i dettagli su `minimax/minimax-m2.7`"*
- *"Chatta con `orcarouter/auto` e spiegami il quantum computing"*

## Avvio rapido

### Claude Code (one-liner da CLI)

```bash
claude mcp add orcarouter -s user \
  -e ORCAROUTER_API_KEY=sk-orca-your-key \
  -- npx -y @orcarouter/mcp
```

### Altri client (percorso del file di configurazione)

1. Copia la configurazione di esempio per il tuo client MCP nel file di configurazione del client:

   | Client          | Esempio                                             | Azione     |
   | --------------- | --------------------------------------------------- | ---------- |
   | Claude Desktop  | [claude-desktop.json](examples/claude-desktop.json) | Sostituire |
   | Claude Code     | [claude-code.json](examples/claude-code.json)       | Unire      |
   | Cursor          | [cursor.json](examples/cursor.json)                 | Sostituire |
   | Windsurf        | [windsurf.json](examples/windsurf.json)             | Sostituire |

   Consulta [`examples/README.md`](examples/README.md) per i percorsi dei file di configurazione e le note su Zed e altri client.

2. Sostituisci `sk-or-...` nel file copiato con la tua [chiave API OrcaRouter](https://www.orcarouter.ai/console).
3. Riavvia il tuo client MCP.

Richiede Node.js 18 o successivo. La variabile d'ambiente `ORCAROUTER_API_KEY`
è necessaria solo per `orcarouter_chat`; gli strumenti di catalogo funzionano
senza di essa.

## Strumenti

- `orcarouter_chat` — esegui una chat completion (con catena di fallback opzionale)
- `orcarouter_models_list` — esplora il catalogo (prezzi, contesto, capacità)
- `orcarouter_model_card` — informazioni dettagliate su un singolo modello
- `orcarouter_providers_list` — elenca i provider con il numero di modelli

Gli schemi di input completi sono esposti a runtime tramite il metodo MCP `tools/list` — il tuo client MCP (Claude Desktop, Cursor, ecc.) li legge automaticamente.

## Configurazione

| Nome                        | Obbligatorio | Descrizione                                              |
| --------------------------- | ------------ | -------------------------------------------------------- |
| `ORCAROUTER_API_KEY`        | opzionale    | Chiave API OrcaRouter. Necessaria solo per `orcarouter_chat`. |
| `ORCAROUTER_BASE_URL`       | opzionale    | URL base dell'API. Predefinito `https://api.orcarouter.ai`. |
| `ORCAROUTER_REQUEST_TIMEOUT`| opzionale    | Timeout HTTP per richiesta in **secondi**. Predefinito `300`. |

## Sicurezza

Le chiavi API vengono lette da variabili d'ambiente, mai registrate nei log
e inviate solo all'API di OrcaRouter. Consulta [SECURITY.md](SECURITY.md)
per la policy di divulgazione delle vulnerabilità.

## Sviluppo

```sh
# bun (preferito)
bun install
bun run test
bun run typecheck
bun run build

# oppure con npm
npm install
npm test
npm run typecheck
npm run build
```

La build produce un bundle ESM in `dist/index.js` con shebang
`#!/usr/bin/env node`, eseguibile come binario `orcarouter-mcp`.

## Licenza

[MIT](LICENSE)
