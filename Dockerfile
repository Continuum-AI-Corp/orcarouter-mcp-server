# Multi-stage build for the OrcaRouter MCP server.
#
# Stage 1: install all deps, build TypeScript with tsup, prune devDeps.
# Stage 2: copy only the built artifact + runtime deps, run as non-root.
#
# Final image runs `node /app/dist/index.js`, speaking MCP over stdio.
# Compatible with Glama's sandboxed scanner (Firecracker microVM that
# expects the container to start and respond to MCP introspection).

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json tsconfig.json tsup.config.ts ./
COPY src ./src
RUN npm install --no-audit --no-fund \
 && npm run build \
 && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
USER node
ENTRYPOINT ["node", "/app/dist/index.js"]
