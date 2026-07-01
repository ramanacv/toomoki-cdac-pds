# syntax=docker/dockerfile:1.7
# Multi-stage build for the PDS NestJS API (T3.1).
# Builder: installs all deps + builds the workspace packages the API needs.
# Runtime: copies compiled dist + production deps only, runs as non-root node.

FROM node:22-alpine AS builder
WORKDIR /app

# Copy workspace manifests first for better layer caching.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/fixtures/package.json packages/fixtures/package.json
COPY blockchain/chaincode/pds-chaincode/package.json blockchain/chaincode/pds-chaincode/package.json

RUN npm ci

# Copy the rest of the source and build only the packages the API consumes.
COPY . .

RUN npm run build --workspace=@pds/shared-types \
  && npm run build --workspace=@pds/fixtures \
  && npm run build --workspace=@pds/pds-chaincode \
  && npm run build --workspace=@pds/api

# Keep the workspace dependency tree intact. `npm prune --omit=dev` at the
# workspace root can remove production deps used only by child workspaces.

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Install curl for the HEALTHCHECK (alpine image is minimal).
RUN apk add --no-cache curl

# Copy the built workspace + pruned node_modules from the builder.
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=builder /app/packages/fixtures/dist ./packages/fixtures/dist
COPY --from=builder /app/packages/fixtures/package.json ./packages/fixtures/package.json
COPY --from=builder /app/blockchain/chaincode/pds-chaincode/dist ./blockchain/chaincode/pds-chaincode/dist
COPY --from=builder /app/blockchain/chaincode/pds-chaincode/package.json ./blockchain/chaincode/pds-chaincode/package.json
COPY --from=builder /app/blockchain/fabric-network ./blockchain/fabric-network

RUN mkdir -p /app/tmp && chown -R node:node /app/tmp

# Run as the non-root node user (created by the node:alpine image).
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fs http://127.0.0.1:3000/health || exit 1

CMD ["node", "apps/api/dist/src/main.js"]
