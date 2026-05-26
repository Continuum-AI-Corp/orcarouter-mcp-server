<p align="center">
  <a href="https://www.orcarouter.ai">
    <img src="https://raw.githubusercontent.com/Continuum-AI-Corp/orcarouter-mcp-server/main/assets/logo.gif" alt="OrcaRouter" width="180" />
  </a>
</p>

<h1 align="center">OrcaRouter MCP Server</h1>

<p align="center">
  Servidor MCP oficial para el gateway LLM de <a href="https://www.orcarouter.ai">OrcaRouter</a>.
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

Explora el catálogo de modelos de [OrcaRouter](https://www.orcarouter.ai) y ejecuta
chat completions desde cualquier cliente del [Model Context Protocol](https://modelcontextprotocol.io)
— Claude Desktop, Claude Code, Cursor, Windsurf, Zed, o cualquier otro
que hable el protocolo.

La exploración del catálogo funciona **sin clave de API** — compara precios y
capacidades antes de registrarte.

## Qué puedes hacer

- 🗺️  Descubre proveedores y modelos sin clave de API
- 💬 Ejecuta chat completions con cualquier modelo disponible
- 🧠 Enruta automáticamente las solicitudes a través del router `orcarouter/auto` de tu workspace (estrategias cost / quality / balanced / LinUCB / gated-adaptive)
- 🔁 Configura cadenas de fallback (primario + hasta 4 fallbacks) para mayor resiliencia
- 📊 Filtra modelos en el servidor por proveedor, capacidad o ventana de contexto mínima
- 🎯 Inspecciona fichas detalladas de modelos: precios, contexto, latencia, endpoints soportados
- 🔌 Funciona con Claude Desktop, Claude Code, Cursor, Windsurf, Zed y cualquier cliente MCP

## Ejemplos

Prueba a decir cosas como:

- *"Lista todos los proveedores en OrcaRouter"*
- *"Muéstrame todos los modelos de Anthropic con sus precios"*
- *"Dame los detalles de `minimax/minimax-m2.7`"*
- *"Chatea con `orcarouter/auto` y explícame la computación cuántica"*

## Inicio rápido

### Claude Code (una línea en CLI)

```bash
claude mcp add orcarouter -s user \
  -e ORCAROUTER_API_KEY=sk-orca-your-key \
  -- npx -y @orcarouter/mcp
```

### Otros clientes (ruta del archivo de configuración)

1. Copia la configuración de ejemplo para tu cliente MCP en el archivo de configuración del cliente:

   | Cliente         | Ejemplo                                             | Acción     |
   | --------------- | --------------------------------------------------- | ---------- |
   | Claude Desktop  | [claude-desktop.json](examples/claude-desktop.json) | Reemplazar |
   | Claude Code     | [claude-code.json](examples/claude-code.json)       | Fusionar   |
   | Cursor          | [cursor.json](examples/cursor.json)                 | Reemplazar |
   | Windsurf        | [windsurf.json](examples/windsurf.json)             | Reemplazar |

   Consulta [`examples/README.md`](examples/README.md) para las rutas de los archivos de configuración y notas sobre Zed y otros clientes.

2. Reemplaza `sk-or-...` en el archivo copiado con tu [clave de API de OrcaRouter](https://www.orcarouter.ai/console).
3. Reinicia tu cliente MCP.

El [`.mcp.json`](.mcp.json) en la raíz es la misma configuración en la ubicación estándar de [Open Plugins](https://open-plugins.com), de modo que las herramientas de registro/descubrimiento que lo escanean (por ejemplo, [cursor.directory](https://cursor.directory)) pueden detectar este servidor automáticamente.

Requiere Node.js 18 o superior. La variable de entorno `ORCAROUTER_API_KEY` solo
es necesaria para `orcarouter_chat`; las herramientas del catálogo funcionan sin ella.

## Herramientas

- `orcarouter_chat` — ejecuta una chat completion (con cadena de fallback opcional)
- `orcarouter_models_list` — explora el catálogo (precios, contexto, capacidades)
- `orcarouter_model_card` — información detallada de un modelo
- `orcarouter_providers_list` — lista los proveedores con conteos de modelos

Los esquemas completos de entrada se exponen en tiempo de ejecución a través del método MCP `tools/list` — tu cliente MCP (Claude Desktop, Cursor, etc.) los lee automáticamente.

## Configuración

| Nombre                       | Requerido | Descripción                                              |
| ---------------------------- | --------- | -------------------------------------------------------- |
| `ORCAROUTER_API_KEY`         | opcional  | Clave de API de OrcaRouter. Solo necesaria para `orcarouter_chat`. |
| `ORCAROUTER_BASE_URL`        | opcional  | URL base de la API. Por defecto `https://api.orcarouter.ai`. |
| `ORCAROUTER_REQUEST_TIMEOUT` | opcional  | Tiempo de espera HTTP por solicitud en **segundos**. Por defecto `300`. |

## Seguridad

Las claves de API se leen desde variables de entorno, nunca se registran en logs y
solo se envían a la API de OrcaRouter. Consulta [SECURITY.md](SECURITY.md) para la
política de divulgación de vulnerabilidades.

## Desarrollo

```sh
# bun (preferido)
bun install
bun run test
bun run typecheck
bun run build

# o con npm
npm install
npm test
npm run typecheck
npm run build
```

La compilación produce un bundle ESM en `dist/index.js` con un
shebang `#!/usr/bin/env node`, ejecutable como el binario `orcarouter-mcp`.

## Contribuir

Consulta [CONTRIBUTING.md](CONTRIBUTING.md). Para tareas amigables para principiantes, explora la etiqueta [`good first issue`](https://github.com/Continuum-AI-Corp/orcarouter-mcp-server/labels/good%20first%20issue).

## Licencia

[MIT](LICENSE)
