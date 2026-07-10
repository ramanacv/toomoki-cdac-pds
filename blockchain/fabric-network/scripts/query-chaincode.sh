#!/usr/bin/env bash
# Evaluate a pds-chaincode query via peer0.food (read-only, no ordering).
#
# Usage:
#   ./query-chaincode.sh GetLotHistory '{"lotId":"LOT-RICE-2026-001"}'
#   ./query-chaincode.sh GetCurrentStock
#   ./query-chaincode.sh GetDistributionHistory '{"distributionId":"DIST-001"}'
set -euo pipefail

NETWORK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CHANNEL="${PDS_FABRIC_CHANNEL:-pdschannel}"
CC_NAME="${PDS_FABRIC_CHAINCODE:-pds-chaincode}"
PEER_CONTAINER="${PDS_FABRIC_QUERY_PEER:-peer0.food.example.com}"
FOOD_ADMIN="${NETWORK_ROOT}/crypto/peerOrganizations/food.example.com/users/Admin@food.example.com/msp"

OPERATION="${1:?chaincode operation required (e.g. GetLotHistory)}"
PAYLOAD="${2:-{}}"

if [[ ! -d "${FOOD_ADMIN}" ]]; then
  echo "ERROR: admin MSP not found at ${FOOD_ADMIN} — run bootstrap-fabric-full.sh first" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "${PEER_CONTAINER}"; then
  echo "ERROR: peer container ${PEER_CONTAINER} is not running" >&2
  exit 1
fi

docker cp "${FOOD_ADMIN}" "${PEER_CONTAINER}:/tmp/admin-msp" >/dev/null

# Escape payload for JSON Args array.
ESCAPED_PAYLOAD=$(printf '%s' "${PAYLOAD}" | sed 's/\\/\\\\/g; s/"/\\"/g')
QUERY_ARGS="{\"Args\":[\"${OPERATION}\",\"${ESCAPED_PAYLOAD}\"]}"

docker exec \
  -e CORE_PEER_MSPCONFIGPATH=/tmp/admin-msp \
  "${PEER_CONTAINER}" \
  peer chaincode query \
  -C "${CHANNEL}" \
  -n "${CC_NAME}" \
  -c "${QUERY_ARGS}"
