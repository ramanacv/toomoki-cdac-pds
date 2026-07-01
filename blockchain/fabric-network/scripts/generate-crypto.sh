#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRYPTO_DIR="${ROOT}/crypto"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "Generating dev crypto material under ${CRYPTO_DIR}"
mkdir -p "${CRYPTO_DIR}"

cat > "${ROOT}/crypto-config.yaml" <<'EOF'
OrdererOrgs:
  - Name: Orderer
    Domain: pds.example.com
    Specs:
      - Hostname: orderer
PeerOrgs:
  - Name: FoodAndCivilSupplies
    Domain: food.example.com
    EnableNodeOUs: true
    Template:
      Count: 1
    Users:
      Count: 1
  - Name: GodownWarehouse
    Domain: godown.example.com
    EnableNodeOUs: true
    Template:
      Count: 1
    Users:
      Count: 1
EOF

if command -v cryptogen >/dev/null 2>&1; then
  cryptogen generate --config="${ROOT}/crypto-config.yaml" --output="${CRYPTO_DIR}"
elif docker info >/dev/null 2>&1; then
  echo "Using fabric-tools Docker image for cryptogen"
  # cryptogen does not need fabric network
  docker run --rm \
    --user "$(id -u):$(id -g)" \
    -v "${ROOT}:/work" \
    -w /work \
    "${FABRIC_TOOLS_IMAGE:-hyperledger/fabric-tools:2.5.13}" \
    cryptogen generate --config=/work/crypto-config.yaml --output=/work/crypto
else
  echo "ERROR: cryptogen not found and Docker is unavailable"
  exit 1
fi

echo "Crypto generation complete"
