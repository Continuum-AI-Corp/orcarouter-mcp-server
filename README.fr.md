<p align="center">
  <a href="https://www.orcarouter.ai">
    <img src="https://raw.githubusercontent.com/Continuum-AI-Corp/orcarouter-mcp-server/main/assets/logo.gif" alt="OrcaRouter" width="180" />
  </a>
</p>

<h1 align="center">OrcaRouter MCP Server</h1>

<p align="center">
  Serveur MCP officiel pour la passerelle LLM <a href="https://www.orcarouter.ai">OrcaRouter</a>.
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

Parcourez le catalogue de modèles d'[OrcaRouter](https://www.orcarouter.ai) et exécutez
des complétions de chat depuis n'importe quel client [Model Context Protocol](https://modelcontextprotocol.io)
— Claude Desktop, Claude Code, Cursor, Windsurf, Zed, ou tout autre client
qui parle le protocole.

La navigation du catalogue fonctionne **sans clé API** — comparez les tarifs et
les capacités avant de vous inscrire.

## Ce que vous pouvez faire

- 🗺️  Découvrir les fournisseurs et les modèles sans clé API
- 💬 Exécuter des complétions de chat via n'importe quel modèle disponible
- 🧠 Router automatiquement les requêtes via le routeur `orcarouter/auto` de votre espace de travail (stratégies cost / quality / balanced / LinUCB / gated-adaptive)
- 🔁 Configurer des chaînes de repli (principal + jusqu'à 4 replis) pour la résilience
- 📊 Filtrer les modèles côté serveur par fournisseur, capacité ou fenêtre de contexte minimale
- 🎯 Inspecter des fiches détaillées : tarifs, contexte, latence, endpoints pris en charge
- 🔌 Compatible avec Claude Desktop, Claude Code, Cursor, Windsurf, Zed et tout client MCP

## Exemples

Essayez de dire des choses comme :

- *"List all providers on OrcaRouter"*
- *"Show me all Anthropic models with their pricing"*
- *"Get details about `minimax/minimax-m2.7`"*
- *"Chat with `orcarouter/auto` and explain quantum computing"*

## Démarrage rapide

### Claude Code (commande CLI en une ligne)

```bash
claude mcp add orcarouter -s user \
  -e ORCAROUTER_API_KEY=sk-orca-your-key \
  -- npx -y @orcarouter/mcp
```

### Autres clients (via fichier de configuration)

1. Copiez l'exemple de configuration de votre client MCP dans le fichier de configuration du client :

   | Client          | Exemple                                             | Action      |
   | --------------- | --------------------------------------------------- | ----------- |
   | Claude Desktop  | [claude-desktop.json](examples/claude-desktop.json) | Remplacer   |
   | Claude Code     | [claude-code.json](examples/claude-code.json)       | Fusionner   |
   | Cursor          | [cursor.json](examples/cursor.json)                 | Remplacer   |
   | Windsurf        | [windsurf.json](examples/windsurf.json)             | Remplacer   |

   Consultez [`examples/README.md`](examples/README.md) pour les chemins des fichiers de configuration et les notes concernant Zed et les autres clients.

2. Remplacez `sk-or-...` dans le fichier copié par votre [clé API OrcaRouter](https://www.orcarouter.ai/console).
3. Redémarrez votre client MCP.

Le [`.mcp.json`](.mcp.json) à la racine est la même configuration à l'emplacement standard d'[Open Plugins](https://open-plugins.com), ce qui permet aux outils de registre/découverte qui l'analysent (par exemple [cursor.directory](https://cursor.directory)) de détecter ce serveur automatiquement.

Node.js 18 ou ultérieur est requis. La variable d'environnement `ORCAROUTER_API_KEY`
n'est nécessaire que pour `orcarouter_chat` ; les outils de catalogue fonctionnent sans elle.

## Outils

- `orcarouter_chat` — exécute une complétion de chat (avec chaîne de repli optionnelle)
- `orcarouter_models_list` — parcourt le catalogue (tarifs, contexte, capacités)
- `orcarouter_model_card` — informations détaillées sur un modèle
- `orcarouter_providers_list` — liste les fournisseurs avec le nombre de modèles

Les schémas d'entrée complets sont exposés à l'exécution via la méthode MCP `tools/list` — votre client MCP (Claude Desktop, Cursor, etc.) les lit automatiquement.

## Configuration

| Nom                         | Requis    | Description                                              |
| --------------------------- | --------- | -------------------------------------------------------- |
| `ORCAROUTER_API_KEY`        | optionnel | Clé API OrcaRouter. Requise uniquement pour `orcarouter_chat`. |
| `ORCAROUTER_BASE_URL`       | optionnel | URL de base de l'API. Par défaut `https://api.orcarouter.ai`.   |
| `ORCAROUTER_REQUEST_TIMEOUT`| optionnel | Délai d'expiration HTTP par requête en **secondes**. Par défaut `300`. |

## Sécurité

Les clés API sont lues depuis les variables d'environnement, ne sont jamais journalisées et
ne sont envoyées qu'à l'API OrcaRouter. Consultez [SECURITY.md](SECURITY.md) pour la
politique de divulgation des vulnérabilités.

## Développement

```sh
# bun (préféré)
bun install
bun run test
bun run typecheck
bun run build

# ou avec npm
npm install
npm test
npm run typecheck
npm run build
```

La compilation produit un bundle ESM dans `dist/index.js` avec un
shebang `#!/usr/bin/env node`, exécutable comme binaire `orcarouter-mcp`.

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md). Pour des tâches accueillantes aux débutants, parcourez le label [`good first issue`](https://github.com/Continuum-AI-Corp/orcarouter-mcp-server/labels/good%20first%20issue).

## Licence

[MIT](LICENSE)
