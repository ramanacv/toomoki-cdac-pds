#!/usr/bin/env bash
# Full Fabric 2-org bootstrap using Docker CLI tools (no host Fabric binaries required).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
NETWORK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS="${NETWORK_ROOT}/scripts"
FABRIC_VERSION="${FABRIC_VERSION:-2.5.13}"
FABRIC_TOOLS_IMAGE="${FABRIC_TOOLS_IMAGE:-hyperledger/fabric-tools:2.5.13}"

echo "==> PDS Fabric bootstrap (Docker tools, Fabric ${FABRIC_VERSION})"

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker is required"
  exit 1
fi

FABRIC_TOOLS_IMAGE="${FABRIC_TOOLS_IMAGE:-hyperledger/fabric-tools:2.5.13}"

echo "==> Pulling fabric-tools image..."
docker pull "${FABRIC_TOOLS_IMAGE}" >/dev/null

echo "==> Step 1: crypto + channel block + connection profiles"
bash "${SCRIPTS}/generate-crypto.sh"
bash "${SCRIPTS}/configtxgen.sh"
bash "${SCRIPTS}/generate-connection-profiles.sh"

echo "==> Step 2: start Fabric containers"
cd "${REPO_ROOT}"
docker compose --profile fabric up -d \
  orderer.pds.example.com \
  couchdb0 couchdb1 \
  peer0.food.example.com peer0.godown.example.com \
  ca.food.example.com ca.godown.example.com

echo "==> Waiting for orderer and peers..."
sleep 8
for i in $(seq 1 30); do
  if docker ps --format '{{.Names}}' | grep -q '^orderer.pds.example.com$' && \
     docker ps --format '{{.Names}}' | grep -q '^peer0.food.example.com$'; then
    break
  fi
  sleep 2
done

echo "==> Step 3: orderer joins channel"
bash "${SCRIPTS}/osnadmin-channel-join.sh"

echo "==> Step 4: peers join channel"
bash "${SCRIPTS}/peer-channel-join.sh"

echo "==> Step 5: deploy chaincode"
bash "${SCRIPTS}/deploy-chaincode.sh"

echo ""
echo "Bootstrap complete. Start the app in fabric mode:"
echo "  cd ${REPO_ROOT}"
echo "  PDS_LEDGER_MODE=fabric docker compose --profile fabric up --build -d"
echo ""
echo "Then verify:"
echo "  curl http://localhost:3000/health"
echo "  node scripts/smoke-fabric-gateway.mjs"
