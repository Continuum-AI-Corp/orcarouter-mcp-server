<p align="center">
  <a href="https://www.orcarouter.ai">
    <img src="https://raw.githubusercontent.com/Continuum-AI-Corp/orcarouter-mcp-server/main/assets/logo.gif" alt="OrcaRouter" width="180" />
  </a>
</p>

<h1 align="center">OrcaRouter MCP Server</h1>

<p align="center">
  Официальный MCP-сервер для LLM-шлюза <a href="https://www.orcarouter.ai">OrcaRouter</a>.
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

Просматривайте каталог моделей [OrcaRouter](https://www.orcarouter.ai) и запускайте chat
completions из любого клиента [Model Context Protocol](https://modelcontextprotocol.io) —
Claude Desktop, Claude Code, Cursor, Windsurf, Zed или чего угодно ещё,
что говорит на этом протоколе.

Просмотр каталога работает **без API-ключа** — сравнивайте цены и
возможности до регистрации.

## Что можно делать

- 🗺️  Открывайте для себя провайдеров и модели без API-ключа
- 💬 Запускайте chat completions через любую обслуживаемую модель
- 🧠 Автоматически маршрутизируйте запросы через роутер `orcarouter/auto` вашего workspace (стратегии cost / quality / balanced / LinUCB / gated-adaptive)
- 🔁 Настраивайте цепочки fallback (основная модель + до 4 запасных) для отказоустойчивости
- 📊 Фильтруйте модели на стороне сервера по провайдеру, возможностям или минимальному размеру контекстного окна
- 🎯 Изучайте подробные карточки моделей: цены, контекст, задержки, поддерживаемые эндпоинты
- 🔌 Работает с Claude Desktop, Claude Code, Cursor, Windsurf, Zed и любым MCP-клиентом

## Примеры

Попробуйте сказать что-то вроде:

- *"Перечисли всех провайдеров на OrcaRouter"*
- *"Покажи все модели Anthropic с их ценами"*
- *"Получи детали о `minimax/minimax-m2.7`"*
- *"Поговори с `orcarouter/auto` и объясни квантовые вычисления"*

## Быстрый старт

### Claude Code (однострочная CLI-команда)

```bash
claude mcp add orcarouter -s user \
  -e ORCAROUTER_API_KEY=sk-orca-your-key \
  -- npx -y @orcarouter/mcp
```

### Другие клиенты (через файл конфигурации)

1. Скопируйте пример конфигурации для вашего MCP-клиента в файл конфигурации клиента:

   | Клиент          | Пример                                              | Действие   |
   | --------------- | --------------------------------------------------- | ---------- |
   | Claude Desktop  | [claude-desktop.json](examples/claude-desktop.json) | Заменить   |
   | Claude Code     | [claude-code.json](examples/claude-code.json)       | Объединить |
   | Cursor          | [cursor.json](examples/cursor.json)                 | Заменить   |
   | Windsurf        | [windsurf.json](examples/windsurf.json)             | Заменить   |

   Смотрите [`examples/README.md`](examples/README.md), где указаны пути к файлам конфигурации и заметки про Zed и другие клиенты.

2. Замените `sk-or-...` в скопированном файле на ваш [ключ OrcaRouter API](https://www.orcarouter.ai/console).
3. Перезапустите MCP-клиент.

Файл [`.mcp.json`](.mcp.json) в корне репозитория — та же конфигурация в стандартном расположении [Open Plugins](https://open-plugins.com), благодаря чему инструменты реестра/обнаружения, которые его сканируют (например, [cursor.directory](https://cursor.directory)), могут автоматически распознать этот сервер.

Требуется Node.js 18 или новее. Переменная окружения `ORCAROUTER_API_KEY` нужна
только для `orcarouter_chat`; инструменты каталога работают и без неё.

## Инструменты

- `orcarouter_chat` — выполнить chat completion (с опциональной цепочкой fallback)
- `orcarouter_models_list` — просмотреть каталог (цены, контекст, возможности)
- `orcarouter_model_card` — подробная информация по одной модели
- `orcarouter_providers_list` — список провайдеров с количеством моделей

Полные схемы входных данных доступны во время выполнения через MCP-метод `tools/list` — ваш MCP-клиент (Claude Desktop, Cursor и т. д.) читает их автоматически.

## Конфигурация

| Имя                         | Обязательность | Описание                                                       |
| --------------------------- | -------------- | -------------------------------------------------------------- |
| `ORCAROUTER_API_KEY`        | необязательно  | Ключ OrcaRouter API. Требуется только для `orcarouter_chat`.   |
| `ORCAROUTER_BASE_URL`       | необязательно  | Базовый URL API. По умолчанию `https://api.orcarouter.ai`.     |
| `ORCAROUTER_REQUEST_TIMEOUT`| необязательно  | HTTP-таймаут на запрос в **секундах**. По умолчанию `300`.      |

## Безопасность

API-ключи считываются из переменных окружения, никогда не логируются и
отправляются только в OrcaRouter API. См. [SECURITY.md](SECURITY.md) для
ознакомления с политикой раскрытия уязвимостей.

## Разработка

```sh
# bun (предпочтительный)
bun install
bun run test
bun run typecheck
bun run build

# или через npm
npm install
npm test
npm run typecheck
npm run build
```

Сборка создаёт ESM-бандл в `dist/index.js` с shebang
`#!/usr/bin/env node`, который запускается как бинарь `orcarouter-mcp`.

## Участие в разработке

См. [CONTRIBUTING.md](CONTRIBUTING.md). Для задач, дружелюбных к новичкам, см. метку [`good first issue`](https://github.com/Continuum-AI-Corp/orcarouter-mcp-server/labels/good%20first%20issue).

## Лицензия

[MIT](LICENSE)
