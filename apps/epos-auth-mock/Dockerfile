FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/eligibility-mock/package.json apps/eligibility-mock/package.json
COPY apps/epos-auth-mock/package.json apps/epos-auth-mock/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/fixtures/package.json packages/fixtures/package.json
COPY blockchain/chaincode/pds-chaincode/package.json blockchain/chaincode/pds-chaincode/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY apps/epos-auth-mock apps/epos-auth-mock
COPY packages/shared-types packages/shared-types
RUN npm run build --workspace=@pds/shared-types && npm run build --workspace=@pds/epos-auth-mock

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/epos-auth-mock/package.json ./apps/epos-auth-mock/package.json
COPY --from=build /app/apps/epos-auth-mock/dist ./apps/epos-auth-mock/dist
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/package.json
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
EXPOSE 3011
CMD ["node", "apps/epos-auth-mock/dist/src/main.js"]
