# syntax=docker/dockerfile:1

# ---- Builder stage ----
FROM node:22-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json eslint.config.js ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/fixtures/package.json packages/fixtures/package.json
COPY blockchain/chaincode/pds-chaincode/package.json blockchain/chaincode/pds-chaincode/package.json

RUN npm ci

COPY . .

RUN npm run build --workspace=@pds/shared-types \
  && npm run build --workspace=@pds/fixtures \
  && npm run build --workspace=@pds/pds-chaincode \
  && npm run build --workspace=@pds/web

# ---- Runtime stage ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Create a non-root user (node image already provides uid 1000 `node`).
RUN mkdir -p /app && chown -R node:node /app

# Copy only what the web preview needs: the workspace manifests (for `vite preview`),
# the built web dist, and the installed node_modules for vite.
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=builder --chown=node:node /app/apps/web/vite.config.ts ./apps/web/vite.config.ts
COPY --from=builder --chown=node:node /app/apps/web/tailwind.config.ts ./apps/web/tailwind.config.ts
COPY --from=builder --chown=node:node /app/apps/web/postcss.config.js ./apps/web/postcss.config.js
COPY --from=builder --chown=node:node /app/apps/web/index.html ./apps/web/index.html
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/apps/web/node_modules ./apps/web/node_modules

USER node

EXPOSE 4173
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4173/ >/dev/null 2>&1 || exit 1

CMD ["npm", "run", "start", "--workspace=@pds/web"]
