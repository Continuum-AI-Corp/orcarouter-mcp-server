<p align="center">
  <a href="https://www.orcarouter.ai">
    <img src="https://raw.githubusercontent.com/Continuum-AI-Corp/orcarouter-mcp-server/main/assets/logo.gif" alt="OrcaRouter" width="180" />
  </a>
</p>

<h1 align="center">OrcaRouter MCP Server</h1>

<p align="center">
  <a href="https://www.orcarouter.ai">OrcaRouter</a> LLM 网关的官方 MCP server。
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

在任意 [Model Context Protocol](https://modelcontextprotocol.io) 客户端中浏览
[OrcaRouter](https://www.orcarouter.ai) 的模型目录并运行对话补全 ——
Claude Desktop、Claude Code、Cursor、Windsurf、Zed，或任何支持该协议的客户端皆可。

目录浏览**无需 API key** —— 注册前即可比较定价与能力。

## 功能一览

- 🗺️  无需 API key 即可发现 providers 与模型
- 💬 通过任意已上线的模型运行对话补全
- 🧠 通过工作区的 `orcarouter/auto` 路由器自动选模（成本 / 质量 / 均衡 / LinUCB / gated-adaptive 等策略）
- 🔁 配置回退链（主模型 + 最多 4 个 fallback）以提升可靠性
- 📊 在服务端按 provider、能力或最小上下文窗口过滤模型
- 🎯 查看详细的模型卡片：定价、上下文、延迟、支持的端点
- 🔌 适配 Claude Desktop、Claude Code、Cursor、Windsurf、Zed,以及任意 MCP 客户端

## 使用示例

可以这样对你的 agent 说:

- *"列出 OrcaRouter 上的所有 providers"*
- *"展示所有 Anthropic 模型及其定价"*
- *"获取 `minimax/minimax-m2.7` 的详细信息"*
- *"用 `orcarouter/auto` 跟我聊聊量子计算"*

## 快速开始

### Claude Code（CLI 一行命令）

```bash
claude mcp add orcarouter -s user \
  -e ORCAROUTER_API_KEY=sk-orca-your-key \
  -- npx -y @orcarouter/mcp
```

### 其他客户端（配置文件方式）

1. 将对应 MCP 客户端的示例配置复制到客户端的配置文件中:

   | 客户端          | 示例                                                | 操作    |
   | --------------- | --------------------------------------------------- | ------- |
   | Claude Desktop  | [claude-desktop.json](examples/claude-desktop.json) | 替换    |
   | Claude Code     | [claude-code.json](examples/claude-code.json)       | 合并    |
   | Cursor          | [cursor.json](examples/cursor.json)                 | 替换    |
   | Windsurf        | [windsurf.json](examples/windsurf.json)             | 替换    |

   配置文件路径以及 Zed 等其他客户端的说明详见 [`examples/README.md`](examples/README.md)。

2. 将复制文件中的 `sk-or-...` 替换为你的 [OrcaRouter API key](https://www.orcarouter.ai/console)。
3. 重启你的 MCP 客户端。

根目录的 [`.mcp.json`](.mcp.json) 是符合 [Open Plugins](https://open-plugins.com) 标准位置的同一份配置，让扫描该文件的注册/发现工具（如 [cursor.directory](https://cursor.directory)）能自动识别本 server。

需要 Node.js 18 或更高版本。`ORCAROUTER_API_KEY` 环境变量仅在使用
`orcarouter_chat` 时必填；目录类工具无需 API key 即可使用。

## 工具

- `orcarouter_chat` — 运行对话补全（可选配置回退链）
- `orcarouter_models_list` — 浏览目录（定价、上下文、能力）
- `orcarouter_model_card` — 单个模型的详细信息
- `orcarouter_providers_list` — 列出 providers 及对应模型数量

完整的输入 schema 会在运行时通过 MCP 的 `tools/list` 方法暴露 —— 你的 MCP 客户端（Claude Desktop、Cursor 等）会自动读取。

## 配置

| 名称                        | 是否必填 | 说明                                                         |
| --------------------------- | -------- | ------------------------------------------------------------ |
| `ORCAROUTER_API_KEY`        | 可选     | OrcaRouter API key。仅 `orcarouter_chat` 需要。              |
| `ORCAROUTER_BASE_URL`       | 可选     | API base URL。默认值为 `https://api.orcarouter.ai`。         |
| `ORCAROUTER_REQUEST_TIMEOUT`| 可选     | 单次请求的 HTTP 超时时间，单位为**秒**。默认值为 `300`。       |

## 安全

API key 仅从环境变量读取,不会被记录到日志,且只会发送给 OrcaRouter API。漏洞披露策略详见 [SECURITY.md](SECURITY.md)。

## 开发

```sh
# bun（推荐）
bun install
bun run test
bun run typecheck
bun run build

# 或使用 npm
npm install
npm test
npm run typecheck
npm run build
```

构建会在 `dist/index.js` 产出一个带 `#!/usr/bin/env node` shebang 的 ESM bundle,
可作为 `orcarouter-mcp` 二进制运行。

## 许可证

[MIT](LICENSE)
