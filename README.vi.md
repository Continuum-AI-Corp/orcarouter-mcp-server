<p align="center">
  <a href="https://www.orcarouter.ai">
    <img src="https://raw.githubusercontent.com/Continuum-AI-Corp/orcarouter-mcp-server/main/assets/logo.gif" alt="OrcaRouter" width="180" />
  </a>
</p>

<h1 align="center">OrcaRouter MCP Server</h1>

<p align="center">
  MCP server chính thức cho cổng LLM <a href="https://www.orcarouter.ai">OrcaRouter</a>.
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

Duyệt danh mục mô hình của [OrcaRouter](https://www.orcarouter.ai) và chạy
chat completion ngay bên trong bất kỳ client [Model Context Protocol](https://modelcontextprotocol.io)
nào — Claude Desktop, Claude Code, Cursor, Windsurf, Zed, hoặc bất cứ
ứng dụng nào nói giao thức này.

Duyệt danh mục hoạt động **không cần API key** — so sánh giá và
khả năng trước khi đăng ký.

## Bạn có thể làm gì

- 🗺️  Khám phá các provider và mô hình mà không cần API key
- 💬 Chạy chat completion qua bất kỳ mô hình nào đang phục vụ
- 🧠 Tự động định tuyến yêu cầu qua router `orcarouter/auto` của workspace của bạn (các chiến lược cost / quality / balanced / LinUCB / gated-adaptive)
- 🔁 Cấu hình chuỗi fallback (chính + tối đa 4 fallback) để đảm bảo độ tin cậy
- 📊 Lọc mô hình ở phía server theo provider, khả năng, hoặc cửa sổ ngữ cảnh tối thiểu
- 🎯 Kiểm tra model card chi tiết: giá, ngữ cảnh, độ trễ, các endpoint được hỗ trợ
- 🔌 Hoạt động với Claude Desktop, Claude Code, Cursor, Windsurf, Zed, và mọi client MCP

## Ví dụ

Hãy thử nói những câu như:

- *"List all providers on OrcaRouter"*
- *"Show me all Anthropic models with their pricing"*
- *"Get details about `minimax/minimax-m2.7`"*
- *"Chat with `orcarouter/auto` and explain quantum computing"*

## Bắt đầu nhanh

### Claude Code (lệnh CLI một dòng)

```bash
claude mcp add orcarouter -s user \
  -e ORCAROUTER_API_KEY=sk-orca-your-key \
  -- npx -y @orcarouter/mcp
```

### Các client khác (đường dẫn file cấu hình)

1. Sao chép cấu hình mẫu cho client MCP của bạn vào file cấu hình của client:

   | Client          | Ví dụ                                               | Hành động |
   | --------------- | --------------------------------------------------- | --------- |
   | Claude Desktop  | [claude-desktop.json](examples/claude-desktop.json) | Thay thế  |
   | Claude Code     | [claude-code.json](examples/claude-code.json)       | Gộp       |
   | Cursor          | [cursor.json](examples/cursor.json)                 | Thay thế  |
   | Windsurf        | [windsurf.json](examples/windsurf.json)             | Thay thế  |

   Xem [`examples/README.md`](examples/README.md) để biết các đường dẫn file cấu hình và lưu ý về Zed cùng các client khác.

2. Thay `sk-or-...` trong file đã sao chép bằng [API key OrcaRouter](https://www.orcarouter.ai/console) của bạn.
3. Khởi động lại client MCP của bạn.

File [`.mcp.json`](.mcp.json) ở thư mục gốc là cùng cấu hình tại vị trí chuẩn của [Open Plugins](https://open-plugins.com), giúp các công cụ registry/khám phá quét nó (ví dụ [cursor.directory](https://cursor.directory)) có thể tự động nhận diện server này.

Yêu cầu Node.js 18 trở lên. Biến môi trường `ORCAROUTER_API_KEY` chỉ
bắt buộc cho `orcarouter_chat`; các công cụ danh mục hoạt động mà không cần nó.

## Công cụ

- `orcarouter_chat` — chạy một chat completion (với chuỗi fallback tùy chọn)
- `orcarouter_models_list` — duyệt danh mục (giá, ngữ cảnh, khả năng)
- `orcarouter_model_card` — thông tin chi tiết cho một mô hình
- `orcarouter_providers_list` — liệt kê các provider kèm số lượng mô hình

Các schema đầu vào đầy đủ được phơi ra trong thời gian chạy thông qua phương thức MCP `tools/list` — client MCP của bạn (Claude Desktop, Cursor, v.v.) đọc chúng tự động.

## Cấu hình

| Tên                         | Bắt buộc  | Mô tả                                                    |
| --------------------------- | --------- | -------------------------------------------------------- |
| `ORCAROUTER_API_KEY`        | tùy chọn  | API key OrcaRouter. Chỉ bắt buộc cho `orcarouter_chat`.  |
| `ORCAROUTER_BASE_URL`       | tùy chọn  | URL gốc của API. Mặc định là `https://api.orcarouter.ai`.|
| `ORCAROUTER_REQUEST_TIMEOUT`| tùy chọn  | Thời gian chờ HTTP cho mỗi yêu cầu tính bằng **giây**. Mặc định là `300`. |

## Bảo mật

API key được đọc từ biến môi trường, không bao giờ được ghi log, và chỉ
được gửi đến API của OrcaRouter. Xem [SECURITY.md](SECURITY.md) để biết
chính sách công bố lỗ hổng.

## Phát triển

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

Quá trình build tạo ra một ESM bundle tại `dist/index.js` với shebang
`#!/usr/bin/env node`, có thể chạy như binary `orcarouter-mcp`.

## Đóng góp

Xem [CONTRIBUTING.md](CONTRIBUTING.md). Đối với các tác vụ thân thiện với người mới, hãy duyệt nhãn [`good first issue`](https://github.com/Continuum-AI-Corp/orcarouter-mcp-server/labels/good%20first%20issue).

## Giấy phép

[MIT](LICENSE)
