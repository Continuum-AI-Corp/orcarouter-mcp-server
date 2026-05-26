#!/usr/bin/env bash
# Build an MCP Bundle (.mcpb) for submission to the Anthropic Directory.
#
# Usage: bash scripts/build-mcpb.sh
# Output: ./orcarouter-mcp-<version>.mcpb
#
# This script stages a clean build (dist + production-only node_modules +
# manifest.json + LICENSE + icon) and runs @anthropic-ai/mcpb pack against it.
# Avoids polluting the .mcpb with dev deps, tests, source, examples, READMEs,
# CI config, and other repo housekeeping that's not needed at runtime.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

VERSION="$(node -p "require('./package.json').version")"
STAGE_DIR=".mcpb-stage"
OUTPUT="orcarouter-mcp-${VERSION}.mcpb"

echo "→ Building distribution"
npm run build

echo "→ Staging clean bundle at ${STAGE_DIR}/"
rm -rf "${STAGE_DIR}"
mkdir -p "${STAGE_DIR}"
cp manifest.json "${STAGE_DIR}/"
cp package.json "${STAGE_DIR}/"
cp LICENSE "${STAGE_DIR}/"
cp -r dist "${STAGE_DIR}/"
cp -r assets "${STAGE_DIR}/"

echo "→ Installing production dependencies"
(cd "${STAGE_DIR}" && npm install --omit=dev --no-audit --no-fund --silent)

echo "→ Packing MCPB"
npx -y @anthropic-ai/mcpb pack "${STAGE_DIR}" "${OUTPUT}"

echo "→ Cleaning staging directory"
rm -rf "${STAGE_DIR}"

echo
echo "✓ Built ${OUTPUT}"
ls -lh "${OUTPUT}"
