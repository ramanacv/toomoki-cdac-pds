FROM node:22-alpine
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
  && npm run build --workspace=@pds/api

EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=@pds/api"]
