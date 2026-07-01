#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHANNEL="${PDS_FABRIC_CHANNEL:-pdschannel}"

echo "Generating channel block for ${CHANNEL}"
mkdir -p "${ROOT}/channel-artifacts"
export FABRIC_CFG_PATH="${ROOT}/config"

run_configtxgen() {
  if command -v configtxgen >/dev/null 2>&1; then
    configtxgen -profile PdsChannel -outputBlock "${ROOT}/channel-artifacts/${CHANNEL}.block" -channelID "${CHANNEL}"
  elif docker info >/dev/null 2>&1; then
    docker run --rm \
      --user "$(id -u):$(id -g)" \
      -v "${ROOT}:/work" \
      -w /work \
      -e FABRIC_CFG_PATH=/work/config \
      "${FABRIC_TOOLS_IMAGE:-hyperledger/fabric-tools:2.5.13}" \
      configtxgen -profile PdsChannel -outputBlock "/work/channel-artifacts/${CHANNEL}.block" -channelID "${CHANNEL}"
  else
    echo "ERROR: configtxgen not found and Docker is unavailable"
    exit 1
  fi
}

run_configtxgen
echo "Channel block written to ${ROOT}/channel-artifacts/${CHANNEL}.block"
