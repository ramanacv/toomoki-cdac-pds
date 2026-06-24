#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CRYPTO_DIR="${ROOT}/crypto"
FABRIC_BIN="${FABRIC_BIN:-fabric-ca-client}"

echo "Generating dev crypto material under ${CRYPTO_DIR}"
mkdir -p "${CRYPTO_DIR}"

if command -v cryptogen >/dev/null 2>&1; then
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
  cryptogen generate --config="${ROOT}/crypto-config.yaml" --output="${CRYPTO_DIR}"
else
  echo "cryptogen not found; create ${CRYPTO_DIR} manually or install Fabric binaries"
  mkdir -p "${CRYPTO_DIR}/peerOrganizations/food.example.com/peers/peer0.food.example.com/tls"
  mkdir -p "${CRYPTO_DIR}/peerOrganizations/food.example.com/users/User1@food.example.com/msp/signcerts"
  mkdir -p "${CRYPTO_DIR}/peerOrganizations/food.example.com/users/User1@food.example.com/msp/keystore"
fi

echo "Crypto generation complete"
