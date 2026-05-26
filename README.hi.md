<p align="center">
  <a href="https://www.orcarouter.ai">
    <img src="https://raw.githubusercontent.com/Continuum-AI-Corp/orcarouter-mcp-server/main/assets/logo.gif" alt="OrcaRouter" width="180" />
  </a>
</p>

<h1 align="center">OrcaRouter MCP Server</h1>

<p align="center">
  <a href="https://www.orcarouter.ai">OrcaRouter</a> LLM gateway के लिए आधिकारिक MCP server।
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

[OrcaRouter](https://www.orcarouter.ai) की model catalog ब्राउज़ करें और किसी भी
[Model Context Protocol](https://modelcontextprotocol.io) client के अंदर से
chat completions चलाएँ — Claude Desktop, Claude Code, Cursor, Windsurf, Zed,
या protocol बोलने वाला कोई भी अन्य client।

Catalog ब्राउज़िंग **बिना API key के** काम करती है — साइन अप करने से पहले
pricing और क्षमताओं की तुलना करें।

## आप क्या कर सकते हैं

- 🗺️  बिना API key के providers और models खोजें
- 💬 किसी भी सेवित model के माध्यम से chat completions चलाएँ
- 🧠 अपने workspace के `orcarouter/auto` router के ज़रिये अनुरोधों को auto-route करें (cost / quality / balanced / LinUCB / gated-adaptive रणनीतियाँ)
- 🔁 लचीलापन के लिए fallback chains कॉन्फ़िगर करें (primary + अधिकतम 4 fallbacks)
- 📊 provider, capability, या न्यूनतम context window के अनुसार server-side पर models फ़िल्टर करें
- 🎯 विस्तृत model cards देखें: pricing, context, latency, समर्थित endpoints
- 🔌 Claude Desktop, Claude Code, Cursor, Windsurf, Zed, और किसी भी MCP client के साथ काम करता है

## उदाहरण

ऐसी बातें कहकर आज़माएँ:

- *"List all providers on OrcaRouter"*
- *"Show me all Anthropic models with their pricing"*
- *"Get details about `minimax/minimax-m2.7`"*
- *"Chat with `orcarouter/auto` and explain quantum computing"*

## त्वरित शुरुआत

### Claude Code (CLI one-liner)

```bash
claude mcp add orcarouter -s user \
  -e ORCAROUTER_API_KEY=sk-orca-your-key \
  -- npx -y @orcarouter/mcp
```

### अन्य clients (config-file path)

1. अपने MCP client के लिए उदाहरण config को client की config file में कॉपी करें:

   | Client          | Example                                             | Action  |
   | --------------- | --------------------------------------------------- | ------- |
   | Claude Desktop  | [claude-desktop.json](examples/claude-desktop.json) | Replace |
   | Claude Code     | [claude-code.json](examples/claude-code.json)       | Merge   |
   | Cursor          | [cursor.json](examples/cursor.json)                 | Replace |
   | Windsurf        | [windsurf.json](examples/windsurf.json)             | Replace |

   config-file paths और Zed तथा अन्य clients पर नोट्स के लिए [`examples/README.md`](examples/README.md) देखें।

2. कॉपी की गई file में `sk-or-...` को अपनी [OrcaRouter API key](https://www.orcarouter.ai/console) से बदलें।
3. अपना MCP client पुनः प्रारंभ करें।

रूट में स्थित [`.mcp.json`](.mcp.json) [Open Plugins](https://open-plugins.com) मानक स्थान पर वही कॉन्फ़िगरेशन है, जिससे इसे स्कैन करने वाले registry/discovery tools (जैसे [cursor.directory](https://cursor.directory)) इस server को स्वचालित रूप से पहचान सकें।

Node.js 18 या उसके बाद का संस्करण आवश्यक है। `ORCAROUTER_API_KEY` env var केवल
`orcarouter_chat` के लिए आवश्यक है; catalog tools इसके बिना काम करते हैं।

## Tools

- `orcarouter_chat` — chat completion चलाएँ (वैकल्पिक fallback chain के साथ)
- `orcarouter_models_list` — catalog ब्राउज़ करें (pricing, context, capabilities)
- `orcarouter_model_card` — एक model के लिए विस्तृत जानकारी
- `orcarouter_providers_list` — model counts के साथ providers की सूची

पूरे input schemas runtime पर MCP `tools/list` विधि के माध्यम से उपलब्ध हैं — आपका MCP client (Claude Desktop, Cursor, इत्यादि) उन्हें स्वतः पढ़ लेता है।

## कॉन्फ़िगरेशन

| Name                        | Required | Description                                              |
| --------------------------- | -------- | -------------------------------------------------------- |
| `ORCAROUTER_API_KEY`        | optional | OrcaRouter API key। केवल `orcarouter_chat` के लिए आवश्यक। |
| `ORCAROUTER_BASE_URL`       | optional | API base URL। डिफ़ॉल्ट `https://api.orcarouter.ai`।   |
| `ORCAROUTER_REQUEST_TIMEOUT`| optional | प्रति-अनुरोध HTTP timeout **सेकंड** में। डिफ़ॉल्ट `300`। |

## सुरक्षा

API keys environment variables से पढ़ी जाती हैं, कभी log नहीं की जातीं, और केवल
OrcaRouter API को भेजी जाती हैं। vulnerability disclosure नीति के लिए
[SECURITY.md](SECURITY.md) देखें।

## विकास

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

build `dist/index.js` पर एक ESM bundle उत्पन्न करता है जिसमें
`#!/usr/bin/env node` shebang होता है, जिसे `orcarouter-mcp` binary के रूप में चलाया जा सकता है।

## योगदान

[CONTRIBUTING.md](CONTRIBUTING.md) देखें। नए लोगों के लिए उपयुक्त कार्यों के लिए [`good first issue`](https://github.com/Continuum-AI-Corp/orcarouter-mcp-server/labels/good%20first%20issue) label ब्राउज़ करें।

## लाइसेंस

[MIT](LICENSE)
