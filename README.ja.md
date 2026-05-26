<p align="center">
  <a href="https://www.orcarouter.ai">
    <img src="https://raw.githubusercontent.com/Continuum-AI-Corp/orcarouter-mcp-server/main/assets/logo.gif" alt="OrcaRouter" width="180" />
  </a>
</p>

<h1 align="center">OrcaRouter MCP Server</h1>

<p align="center">
  <a href="https://www.orcarouter.ai">OrcaRouter</a> LLM ゲートウェイ公式の MCP サーバーです。
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

[OrcaRouter](https://www.orcarouter.ai) のモデルカタログを閲覧し、
[Model Context Protocol](https://modelcontextprotocol.io) に対応する任意のクライアント
（Claude Desktop、Claude Code、Cursor、Windsurf、Zed など）からチャット補完を実行できます。

カタログの閲覧は **API キー不要** — サインアップ前に料金や機能を比較できます。

## できること

- 🗺️  API キーなしでプロバイダーとモデルを発見
- 💬 配信中の任意のモデルでチャット補完を実行
- 🧠 ワークスペースの `orcarouter/auto` ルーター経由でリクエストを自動ルーティング（cost / quality / balanced / LinUCB / gated-adaptive 戦略）
- 🔁 回復性のためのフォールバックチェーン設定（プライマリ + 最大 4 つのフォールバック）
- 📊 プロバイダー、機能、最小コンテキストウィンドウでモデルをサーバー側フィルタリング
- 🎯 詳細なモデルカードを確認: 料金、コンテキスト、レイテンシ、対応エンドポイント
- 🔌 Claude Desktop、Claude Code、Cursor、Windsurf、Zed、その他すべての MCP クライアントで動作

## 使用例

次のように話しかけてみてください:

- *「OrcaRouter 上のすべてのプロバイダーを一覧表示して」*
- *「Anthropic のすべてのモデルを料金付きで見せて」*
- *「`minimax/minimax-m2.7` の詳細を教えて」*
- *「`orcarouter/auto` とチャットして、量子コンピューティングについて説明して」*

## クイックスタート

### Claude Code (CLI ワンライナー)

```bash
claude mcp add orcarouter -s user \
  -e ORCAROUTER_API_KEY=sk-orca-your-key \
  -- npx -y @orcarouter/mcp
```

### その他のクライアント (設定ファイル方式)

1. お使いの MCP クライアント用のサンプル設定をクライアントの設定ファイルにコピーします:

   | Client          | Example                                             | Action  |
   | --------------- | --------------------------------------------------- | ------- |
   | Claude Desktop  | [claude-desktop.json](examples/claude-desktop.json) | 置き換え |
   | Claude Code     | [claude-code.json](examples/claude-code.json)       | マージ   |
   | Cursor          | [cursor.json](examples/cursor.json)                 | 置き換え |
   | Windsurf        | [windsurf.json](examples/windsurf.json)             | 置き換え |

   設定ファイルのパスや Zed などその他のクライアントに関する注意点は [`examples/README.md`](examples/README.md) を参照してください。

2. コピーしたファイル内の `sk-or-...` をあなたの [OrcaRouter API key](https://www.orcarouter.ai/console) に置き換えます。
3. MCP クライアントを再起動します。

ルートの [`.mcp.json`](.mcp.json) は [Open Plugins](https://open-plugins.com) 標準の場所に置かれた同じ設定です。これにより、このファイルをスキャンするレジストリ/ディスカバリーツール（例: [cursor.directory](https://cursor.directory)）が本サーバーを自動的に検出できます。

Node.js 18 以降が必要です。`ORCAROUTER_API_KEY` 環境変数は
`orcarouter_chat` でのみ必要で、カタログ系ツールはこれなしで動作します。

## ツール

- `orcarouter_chat` — チャット補完を実行（オプションでフォールバックチェーン対応）
- `orcarouter_models_list` — カタログを閲覧（料金、コンテキスト、機能）
- `orcarouter_model_card` — 1 つのモデルの詳細情報
- `orcarouter_providers_list` — プロバイダー一覧とモデル数

入力スキーマの全文は MCP の `tools/list` メソッドを通じて実行時に公開されます — お使いの MCP クライアント（Claude Desktop、Cursor など）が自動で読み込みます。

## 設定

| Name                        | Required | 説明                                                       |
| --------------------------- | -------- | ---------------------------------------------------------- |
| `ORCAROUTER_API_KEY`        | optional | OrcaRouter API キー。`orcarouter_chat` でのみ必要です。      |
| `ORCAROUTER_BASE_URL`       | optional | API ベース URL。デフォルトは `https://api.orcarouter.ai`。   |
| `ORCAROUTER_REQUEST_TIMEOUT`| optional | リクエストごとの HTTP タイムアウト（**秒**単位）。デフォルトは `300`。 |

## セキュリティ

API キーは環境変数から読み込まれ、ログには記録されず、OrcaRouter API にのみ送信されます。
脆弱性開示ポリシーについては [SECURITY.md](SECURITY.md) を参照してください。

## 開発

```sh
# bun (推奨)
bun install
bun run test
bun run typecheck
bun run build

# または npm を使用
npm install
npm test
npm run typecheck
npm run build
```

ビルドにより `dist/index.js` に `#!/usr/bin/env node` shebang 付きの
ESM バンドルが生成され、`orcarouter-mcp` バイナリとして実行できます。

## コントリビューション

[CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。初心者向けタスクは [`good first issue`](https://github.com/Continuum-AI-Corp/orcarouter-mcp-server/labels/good%20first%20issue) ラベルをご覧ください。

## ライセンス

[MIT](LICENSE)
