#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
NETWORK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANNEL="${PDS_FABRIC_CHANNEL:-pdschannel}"
CC_NAME="${PDS_FABRIC_CHAINCODE:-pds-chaincode}"
CC_VERSION="${CC_VERSION:-1.0}"
CC_SEQUENCE="${CC_SEQUENCE:-1}"

echo "Packaging and deploying ${CC_NAME}@${CC_VERSION} on ${CHANNEL}"

if ! command -v peer >/dev/null 2>&1; then
  echo "peer CLI not found; build chaincode package only"
  mkdir -p "${NETWORK_ROOT}/chaincode-packages"
  exit 0
fi

pushd "${ROOT}/blockchain/chaincode/pds-chaincode" >/dev/null
npm run build
peer lifecycle chaincode package "${NETWORK_ROOT}/chaincode-packages/${CC_NAME}.tar.gz" \
  --path . \
  --lang node \
  --label "${CC_NAME}_${CC_VERSION}"
popd >/dev/null

echo "Install, approve, and commit steps require a running network and enrolled admin identities"
echo "Package written to ${NETWORK_ROOT}/chaincode-packages/${CC_NAME}.tar.gz"
