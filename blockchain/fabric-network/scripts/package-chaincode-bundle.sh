#!/usr/bin/env bash
# Build a self-contained chaincode directory for Fabric lifecycle packaging.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CC_SRC="${REPO_ROOT}/blockchain/chaincode/pds-chaincode"
OUT="${REPO_ROOT}/blockchain/fabric-network/chaincode-packages/pds-chaincode-bundle"

echo "Building standalone chaincode bundle at ${OUT}"
rm -rf "${OUT}"
mkdir -p "${OUT}/node_modules/@pds"

npm run build --workspace=@pds/shared-types --prefix "${REPO_ROOT}"
npm run build --workspace=@pds/pds-chaincode --prefix "${REPO_ROOT}"

cp -r "${CC_SRC}/dist" "${OUT}/dist"
cp "${CC_SRC}/package.json" "${OUT}/package.json"

cat > "${OUT}/package.json" <<'EOF'
{
  "name": "pds-chaincode-bundle",
  "private": true,
  "type": "module",
  "main": "./dist/src/server.js",
  "scripts": {
    "start": "fabric-chaincode-node start"
  },
  "dependencies": {
    "fabric-contract-api": "^2.5.8",
    "fabric-shim": "^2.5.8"
  }
}
EOF

# @pds/shared-types is the only workspace dep the chaincode needs on the Fabric
# runtime path. @pds/fixtures is intentionally excluded (T6.5): demo seeding is
# lazy-loaded via createRequire inside seedDemoData, which the Fabric server
# path never invokes, so the bundle stays lean and fixture-free.
mkdir -p "${OUT}/node_modules/@pds/shared-types"
cp -r "${REPO_ROOT}/packages/shared-types/dist" "${OUT}/node_modules/@pds/shared-types/dist"
cp "${REPO_ROOT}/packages/shared-types/package.json" "${OUT}/node_modules/@pds/shared-types/package.json"

# Install runtime deps inside bundle (no workspace hoisting)
npm install --prefix "${OUT}" --omit=dev

echo "Bundle ready: ${OUT}"
