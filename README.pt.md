<p align="center">
  <a href="https://www.orcarouter.ai">
    <img src="https://raw.githubusercontent.com/Continuum-AI-Corp/orcarouter-mcp-server/main/assets/logo.gif" alt="OrcaRouter" width="180" />
  </a>
</p>

<h1 align="center">OrcaRouter MCP Server</h1>

<p align="center">
  Servidor MCP oficial para o gateway de LLM <a href="https://www.orcarouter.ai">OrcaRouter</a>.
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

Explore o catálogo de modelos do [OrcaRouter](https://www.orcarouter.ai) e execute
chat completions de dentro de qualquer cliente [Model Context Protocol](https://modelcontextprotocol.io)
— Claude Desktop, Claude Code, Cursor, Windsurf, Zed ou qualquer outro
que fale o protocolo.

A navegação pelo catálogo funciona **sem chave de API** — compare preços e
capacidades antes de se cadastrar.

## O que você pode fazer

- 🗺️  Descobrir provedores e modelos sem chave de API
- 💬 Executar chat completions através de qualquer modelo disponível
- 🧠 Roteamento automático de requisições pelo roteador `orcarouter/auto` do seu workspace (estratégias cost / quality / balanced / LinUCB / gated-adaptive)
- 🔁 Configurar cadeias de fallback (primário + até 4 fallbacks) para maior resiliência
- 📊 Filtrar modelos no lado do servidor por provedor, capacidade ou janela de contexto mínima
- 🎯 Inspecionar fichas detalhadas dos modelos: preços, contexto, latência, endpoints suportados
- 🔌 Funciona com Claude Desktop, Claude Code, Cursor, Windsurf, Zed e qualquer cliente MCP

## Exemplos

Experimente dizer coisas como:

- *"List all providers on OrcaRouter"*
- *"Show me all Anthropic models with their pricing"*
- *"Get details about `minimax/minimax-m2.7`"*
- *"Chat with `orcarouter/auto` and explain quantum computing"*

## Início rápido

### Claude Code (one-liner via CLI)

```bash
claude mcp add orcarouter -s user \
  -e ORCAROUTER_API_KEY=sk-orca-your-key \
  -- npx -y @orcarouter/mcp
```

### Outros clientes (caminho do arquivo de configuração)

1. Copie a configuração de exemplo do seu cliente MCP para o arquivo de configuração do cliente:

   | Cliente         | Exemplo                                             | Ação        |
   | --------------- | --------------------------------------------------- | ----------- |
   | Claude Desktop  | [claude-desktop.json](examples/claude-desktop.json) | Substituir  |
   | Claude Code     | [claude-code.json](examples/claude-code.json)       | Mesclar     |
   | Cursor          | [cursor.json](examples/cursor.json)                 | Substituir  |
   | Windsurf        | [windsurf.json](examples/windsurf.json)             | Substituir  |

   Consulte [`examples/README.md`](examples/README.md) para os caminhos dos arquivos de configuração e observações sobre o Zed e outros clientes.

2. Substitua `sk-or-...` no arquivo copiado pela sua [chave de API do OrcaRouter](https://www.orcarouter.ai/console).
3. Reinicie o seu cliente MCP.

O [`.mcp.json`](.mcp.json) na raiz é a mesma configuração no local padrão do [Open Plugins](https://open-plugins.com), de modo que ferramentas de registro/descoberta que o escaneiem (por exemplo, [cursor.directory](https://cursor.directory)) podem detectar este servidor automaticamente.

Requer Node.js 18 ou superior. A variável de ambiente `ORCAROUTER_API_KEY` é
necessária apenas para `orcarouter_chat`; as ferramentas de catálogo funcionam sem ela.

## Ferramentas

- `orcarouter_chat` — executa um chat completion (com cadeia de fallback opcional)
- `orcarouter_models_list` — navega pelo catálogo (preços, contexto, capacidades)
- `orcarouter_model_card` — informações detalhadas de um modelo
- `orcarouter_providers_list` — lista provedores com a contagem de modelos

Os schemas de entrada completos são expostos em tempo de execução pelo método `tools/list` do MCP — seu cliente MCP (Claude Desktop, Cursor, etc.) os lê automaticamente.

## Configuração

| Nome                        | Obrigatório | Descrição                                                          |
| --------------------------- | ----------- | ------------------------------------------------------------------ |
| `ORCAROUTER_API_KEY`        | opcional    | Chave de API do OrcaRouter. Necessária apenas para `orcarouter_chat`. |
| `ORCAROUTER_BASE_URL`       | opcional    | URL base da API. Padrão `https://api.orcarouter.ai`.               |
| `ORCAROUTER_REQUEST_TIMEOUT`| opcional    | Timeout HTTP por requisição em **segundos**. Padrão `300`.          |

## Segurança

As chaves de API são lidas de variáveis de ambiente, nunca são registradas em log e são
enviadas apenas para a API do OrcaRouter. Consulte [SECURITY.md](SECURITY.md) para a
política de divulgação de vulnerabilidades.

## Desenvolvimento

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

O build gera um bundle ESM em `dist/index.js` com um
shebang `#!/usr/bin/env node`, executável como o binário `orcarouter-mcp`.

## Contribuir

Consulte [CONTRIBUTING.md](CONTRIBUTING.md). Para tarefas amigáveis a iniciantes, explore o rótulo [`good first issue`](https://github.com/Continuum-AI-Corp/orcarouter-mcp-server/labels/good%20first%20issue).

## Licença

[MIT](LICENSE)
