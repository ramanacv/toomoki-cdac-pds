#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANNEL="${PDS_FABRIC_CHANNEL:-pdschannel}"
ORDERER="${ORDERER_ADDRESS:-orderer.pds.example.com:7053}"

echo "Joining orderer to channel ${CHANNEL} via osnadmin"

if ! command -v osnadmin >/dev/null 2>&1; then
  echo "osnadmin not found; document-only step for Fabric 3 channel participation"
  exit 0
fi

osnadmin channel join \
  --channelID "${CHANNEL}" \
  --config-block "${ROOT}/channel-artifacts/${CHANNEL}.block" \
  --orderer-address "${ORDERER}" \
  --ca-file "${ROOT}/crypto/ordererOrganizations/pds.example.com/orderers/orderer.pds.example.com/tls/ca.crt" \
  --client-cert "${ROOT}/crypto/ordererOrganizations/pds.example.com/users/Admin@pds.example.com/tls/client.crt" \
  --client-key "${ROOT}/crypto/ordererOrganizations/pds.example.com/users/Admin@pds.example.com/tls/client.key"
