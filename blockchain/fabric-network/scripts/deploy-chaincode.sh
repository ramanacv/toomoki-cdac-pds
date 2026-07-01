#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
NETWORK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANNEL="${PDS_FABRIC_CHANNEL:-pdschannel}"
CC_NAME="${PDS_FABRIC_CHAINCODE:-pds-chaincode}"
CC_VERSION="${CC_VERSION:-1.0}"
CC_SEQUENCE="${CC_SEQUENCE:-1}"
FABRIC_TOOLS_IMAGE="${FABRIC_TOOLS_IMAGE:-hyperledger/fabric-tools:2.5.13}"
PACKAGE_DIR="${NETWORK_ROOT}/chaincode-packages"

peer_admin() {
  local container="$1"
  local admin_msp="$2"
  shift 2
  docker exec -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp "${container}" peer "$@"
  docker cp "${admin_msp}" "${container}:/tmp/admin-msp" >/dev/null 2>&1 || true
}

copy_admin() {
  local container="$1"
  local admin_msp="$2"
  docker cp "${admin_msp}" "${container}:/tmp/admin-msp"
}

peer_admin_exec() {
  local container="$1"
  local admin_msp="$2"
  shift 2
  copy_admin "${container}" "${admin_msp}"
  docker exec -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp "${container}" peer "$@"
}

echo "Packaging and deploying ${CC_NAME}@${CC_VERSION} on ${CHANNEL}"
mkdir -p "${PACKAGE_DIR}"

bash "${NETWORK_ROOT}/scripts/package-chaincode-bundle.sh"
BUNDLE="${NETWORK_ROOT}/chaincode-packages/pds-chaincode-bundle"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v "${BUNDLE}:/chaincode:ro" \
  -v "${PACKAGE_DIR}:/packages" \
  "${FABRIC_TOOLS_IMAGE}" \
  peer lifecycle chaincode package "/packages/${CC_NAME}.tar.gz" \
  --path "/chaincode" \
  --lang node --label "${CC_NAME}_${CC_VERSION}"

FOOD_ADMIN="${NETWORK_ROOT}/crypto/peerOrganizations/food.example.com/users/Admin@food.example.com/msp"
GODOWN_ADMIN="${NETWORK_ROOT}/crypto/peerOrganizations/godown.example.com/users/Admin@godown.example.com/msp"
ORDERER_TLS="${NETWORK_ROOT}/crypto/ordererOrganizations/pds.example.com/orderers/orderer.pds.example.com/msp/tlscacerts/tlsca.pds.example.com-cert.pem"
FOOD_TLS="${NETWORK_ROOT}/crypto/peerOrganizations/food.example.com/peers/peer0.food.example.com/tls/ca.crt"
GODOWN_TLS="${NETWORK_ROOT}/crypto/peerOrganizations/godown.example.com/peers/peer0.godown.example.com/tls/ca.crt"

docker cp "${PACKAGE_DIR}/${CC_NAME}.tar.gz" peer0.food.example.com:/tmp/${CC_NAME}.tar.gz
docker cp "${PACKAGE_DIR}/${CC_NAME}.tar.gz" peer0.godown.example.com:/tmp/${CC_NAME}.tar.gz
docker cp "${ORDERER_TLS}" peer0.food.example.com:/tmp/orderer-ca.pem
docker cp "${ORDERER_TLS}" peer0.godown.example.com:/tmp/orderer-ca.pem
docker cp "${FOOD_TLS}" peer0.food.example.com:/tmp/food-peer-ca.crt
docker cp "${GODOWN_TLS}" peer0.godown.example.com:/tmp/godown-peer-ca.crt

peer_admin_exec peer0.food.example.com "${FOOD_ADMIN}" lifecycle chaincode install "/tmp/${CC_NAME}.tar.gz"
peer_admin_exec peer0.godown.example.com "${GODOWN_ADMIN}" lifecycle chaincode install "/tmp/${CC_NAME}.tar.gz"

INSTALLED=$(peer_admin_exec peer0.food.example.com "${FOOD_ADMIN}" lifecycle chaincode queryinstalled)
PACKAGE_ID=$(printf '%s\n' "${INSTALLED}" | grep "${CC_NAME}_${CC_VERSION}" | head -1 | cut -d: -f2 | tr -d ' ,')
echo "Package ID: ${PACKAGE_ID}"

peer_admin_exec peer0.food.example.com "${FOOD_ADMIN}" lifecycle chaincode approveformyorg \
  -o orderer.pds.example.com:7050 --ordererTLSHostnameOverride orderer.pds.example.com \
  --tls --cafile /tmp/orderer-ca.pem \
  --channelID "${CHANNEL}" --name "${CC_NAME}" --version "${CC_VERSION}" \
  --package-id "${PACKAGE_ID}" --sequence "${CC_SEQUENCE}"

peer_admin_exec peer0.godown.example.com "${GODOWN_ADMIN}" lifecycle chaincode approveformyorg \
  -o orderer.pds.example.com:7050 --ordererTLSHostnameOverride orderer.pds.example.com \
  --tls --cafile /tmp/orderer-ca.pem \
  --channelID "${CHANNEL}" --name "${CC_NAME}" --version "${CC_VERSION}" \
  --package-id "${PACKAGE_ID}" --sequence "${CC_SEQUENCE}"

peer_admin_exec peer0.food.example.com "${FOOD_ADMIN}" lifecycle chaincode commit \
  -o orderer.pds.example.com:7050 --ordererTLSHostnameOverride orderer.pds.example.com \
  --tls --cafile /tmp/orderer-ca.pem \
  --channelID "${CHANNEL}" --name "${CC_NAME}" --version "${CC_VERSION}" \
  --sequence "${CC_SEQUENCE}" \
  --peerAddresses peer0.food.example.com:7051 --tlsRootCertFiles /tmp/food-peer-ca.crt \
  --peerAddresses peer0.godown.example.com:9051 --tlsRootCertFiles /tmp/godown-peer-ca.crt

echo "Chaincode ${CC_NAME} committed on ${CHANNEL}"
