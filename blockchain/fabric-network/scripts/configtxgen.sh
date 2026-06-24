#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANNEL="${PDS_FABRIC_CHANNEL:-pdschannel}"
CONFIGTX="${CONFIGTXLATOR:-configtxgen}"

echo "Generating channel block for ${CHANNEL}"

if ! command -v "${CONFIGTX}" >/dev/null 2>&1; then
  echo "${CONFIGTX} not found; skipping configtxgen (dev scaffold)"
  mkdir -p "${ROOT}/channel-artifacts"
  : > "${ROOT}/channel-artifacts/${CHANNEL}.block"
  exit 0
fi

export FABRIC_CFG_PATH="${ROOT}/config"
mkdir -p "${ROOT}/channel-artifacts"
"${CONFIGTX}" -profile PdsChannel -outputBlock "${ROOT}/channel-artifacts/${CHANNEL}.block"
