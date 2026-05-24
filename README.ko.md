<p align="center">
  <a href="https://www.orcarouter.ai">
    <img src="https://raw.githubusercontent.com/Continuum-AI-Corp/orcarouter-mcp-server/main/assets/logo.gif" alt="OrcaRouter" width="180" />
  </a>
</p>

<h1 align="center">OrcaRouter MCP Server</h1>

<p align="center">
  <a href="https://www.orcarouter.ai">OrcaRouter</a> LLM 게이트웨이를 위한 공식 MCP 서버입니다.
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

[OrcaRouter](https://www.orcarouter.ai)의 모델 카탈로그를 둘러보고, 모든 [Model Context Protocol](https://modelcontextprotocol.io) 클라이언트 — Claude Desktop, Claude Code, Cursor, Windsurf, Zed 또는 해당 프로토콜을 지원하는 모든 도구 — 내부에서 채팅 완성을 실행할 수 있습니다.

카탈로그 탐색은 **API 키 없이도** 작동합니다 — 가입 전에 가격과 기능을 비교해 보세요.

## 할 수 있는 일

- 🗺️  API 키 없이 프로바이더와 모델을 탐색
- 💬 제공되는 모든 모델을 통해 채팅 완성을 실행
- 🧠 워크스페이스의 `orcarouter/auto` 라우터를 통해 요청을 자동 라우팅 (cost / quality / balanced / LinUCB / gated-adaptive 전략)
- 🔁 복원력을 위한 폴백 체인 구성 (기본 + 최대 4개의 폴백)
- 📊 프로바이더, 기능 또는 최소 컨텍스트 윈도우로 서버 측에서 모델 필터링
- 🎯 상세한 모델 카드 확인: 가격, 컨텍스트, 레이턴시, 지원되는 엔드포인트
- 🔌 Claude Desktop, Claude Code, Cursor, Windsurf, Zed 및 모든 MCP 클라이언트와 호환

## 예시

다음과 같이 말해 보세요:

- *"List all providers on OrcaRouter"*
- *"Show me all Anthropic models with their pricing"*
- *"Get details about `minimax/minimax-m2.7`"*
- *"Chat with `orcarouter/auto` and explain quantum computing"*

## 빠른 시작

### Claude Code (CLI 한 줄 명령)

```bash
claude mcp add orcarouter -s user \
  -e ORCAROUTER_API_KEY=sk-orca-your-key \
  -- npx -y @orcarouter/mcp
```

### 다른 클라이언트 (설정 파일 경로)

1. 사용하는 MCP 클라이언트의 예제 설정을 해당 클라이언트의 설정 파일에 복사합니다:

   | Client          | Example                                             | Action  |
   | --------------- | --------------------------------------------------- | ------- |
   | Claude Desktop  | [claude-desktop.json](examples/claude-desktop.json) | 교체 |
   | Claude Code     | [claude-code.json](examples/claude-code.json)       | 병합   |
   | Cursor          | [cursor.json](examples/cursor.json)                 | 교체 |
   | Windsurf        | [windsurf.json](examples/windsurf.json)             | 교체 |

   설정 파일 경로와 Zed 및 기타 클라이언트에 대한 참고 사항은 [`examples/README.md`](examples/README.md)를 참조하세요.

2. 복사한 파일에서 `sk-or-...`를 본인의 [OrcaRouter API key](https://www.orcarouter.ai/console)로 교체합니다.
3. MCP 클라이언트를 재시작합니다.

Node.js 18 이상이 필요합니다. `ORCAROUTER_API_KEY` 환경 변수는 `orcarouter_chat`에만 필요하며, 카탈로그 도구는 키 없이도 작동합니다.

## 도구

- `orcarouter_chat` — 채팅 완성을 실행 (선택적 폴백 체인 포함)
- `orcarouter_models_list` — 카탈로그 탐색 (가격, 컨텍스트, 기능)
- `orcarouter_model_card` — 특정 모델에 대한 상세 정보
- `orcarouter_providers_list` — 모델 수와 함께 프로바이더 목록 표시

전체 입력 스키마는 MCP `tools/list` 메서드를 통해 런타임에 노출됩니다 — MCP 클라이언트(Claude Desktop, Cursor 등)가 이를 자동으로 읽어들입니다.

## 설정

| Name                        | Required | Description                                              |
| --------------------------- | -------- | -------------------------------------------------------- |
| `ORCAROUTER_API_KEY`        | 선택 | OrcaRouter API 키. `orcarouter_chat`에만 필요합니다. |
| `ORCAROUTER_BASE_URL`       | 선택 | API 기본 URL. 기본값은 `https://api.orcarouter.ai`입니다.   |
| `ORCAROUTER_REQUEST_TIMEOUT`| 선택 | 요청당 HTTP 타임아웃(**초** 단위). 기본값은 `300`입니다. |

## 보안

API 키는 환경 변수에서 읽어들이며, 로그에 기록되지 않고, OrcaRouter API로만 전송됩니다. 취약점 공개 정책은 [SECURITY.md](SECURITY.md)를 참조하세요.

## 개발

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

빌드는 `#!/usr/bin/env node` 셔뱅이 포함된 ESM 번들을 `dist/index.js`에 생성하며, `orcarouter-mcp` 바이너리로 실행할 수 있습니다.

## 라이선스

[MIT](LICENSE)
