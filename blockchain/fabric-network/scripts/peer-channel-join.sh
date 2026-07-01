#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANNEL="${PDS_FABRIC_CHANNEL:-pdschannel}"
BLOCK="${ROOT}/channel-artifacts/${CHANNEL}.block"

join_peer_container() {
  local container="$1"
  local admin_msp_src="$2"
  echo "Joining ${container} to ${CHANNEL} (admin identity)"
  docker cp "${BLOCK}" "${container}:/tmp/${CHANNEL}.block"
  docker cp "${admin_msp_src}" "${container}:/tmp/admin-msp"
  docker exec \
    -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp \
    "${container}" peer channel join -b "/tmp/${CHANNEL}.block"
}

if ! docker ps --format '{{.Names}}' | grep -q '^peer0.food.example.com$'; then
  echo "ERROR: Fabric peer containers are not running. Start with: docker compose --profile fabric up -d"
  exit 1
fi

join_peer_container peer0.food.example.com \
  "${ROOT}/crypto/peerOrganizations/food.example.com/users/Admin@food.example.com/msp"

join_peer_container peer0.godown.example.com \
  "${ROOT}/crypto/peerOrganizations/godown.example.com/users/Admin@godown.example.com/msp"

echo "Peers joined channel ${CHANNEL}"
