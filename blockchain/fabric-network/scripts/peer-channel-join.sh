#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANNEL="${PDS_FABRIC_CHANNEL:-pdschannel}"
BLOCK="${ROOT}/channel-artifacts/${CHANNEL}.block"

join_peer() {
  local peer="$1"
  local msp="$2"
  local address="$3"
  echo "Joining ${peer} (${msp}) to ${CHANNEL}"
  if ! command -v peer >/dev/null 2>&1; then
    echo "peer CLI not found; skipping ${peer}"
    return 0
  fi
  CORE_PEER_LOCALMSPID="${msp}" \
  CORE_PEER_ADDRESS="${address}" \
  peer channel join -b "${BLOCK}"
}

join_peer peer0.food.example.com FoodAndCivilSuppliesMSP peer0.food.example.com:7051
join_peer peer0.godown.example.com GodownWarehouseMSP peer0.godown.example.com:9051
