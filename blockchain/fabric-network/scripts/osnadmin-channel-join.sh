#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHANNEL="${PDS_FABRIC_CHANNEL:-pdschannel}"
ORDERER="${ORDERER_ADDRESS:-orderer.pds.example.com:7053}"

echo "Joining orderer to channel ${CHANNEL} via osnadmin"

run_osnadmin() {
  if command -v osnadmin >/dev/null 2>&1; then
    osnadmin channel join \
      --channelID "${CHANNEL}" \
      --config-block "${ROOT}/channel-artifacts/${CHANNEL}.block" \
      --orderer-address "${ORDERER}" \
      --ca-file "${ROOT}/crypto/ordererOrganizations/pds.example.com/orderers/orderer.pds.example.com/tls/ca.crt" \
      --client-cert "${ROOT}/crypto/ordererOrganizations/pds.example.com/users/Admin@pds.example.com/tls/client.crt" \
      --client-key "${ROOT}/crypto/ordererOrganizations/pds.example.com/users/Admin@pds.example.com/tls/client.key"
  elif docker info >/dev/null 2>&1; then
    # osnadmin runs on host network to reach published orderer admin port
    docker run --rm \
      --add-host orderer.pds.example.com:host-gateway \
      -v "${ROOT}:/work" \
      -w /work \
      "${FABRIC_TOOLS_IMAGE:-hyperledger/fabric-tools:2.5.13}" \
      osnadmin channel join \
      --channelID "${CHANNEL}" \
      --config-block "/work/channel-artifacts/${CHANNEL}.block" \
      --orderer-address "${ORDERER}" \
      --ca-file "/work/crypto/ordererOrganizations/pds.example.com/orderers/orderer.pds.example.com/tls/ca.crt" \
      --client-cert "/work/crypto/ordererOrganizations/pds.example.com/users/Admin@pds.example.com/tls/client.crt" \
      --client-key "/work/crypto/ordererOrganizations/pds.example.com/users/Admin@pds.example.com/tls/client.key"
  else
    echo "ERROR: osnadmin not found and Docker is unavailable"
    exit 1
  fi
}

run_osnadmin
echo "Orderer joined channel ${CHANNEL}"
