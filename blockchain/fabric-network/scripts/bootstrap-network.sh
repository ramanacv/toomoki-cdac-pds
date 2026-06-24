#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${ROOT}/scripts/generate-crypto.sh"
"${ROOT}/scripts/configtxgen.sh"
"${ROOT}/scripts/generate-connection-profiles.sh"

echo "Bootstrap complete for channel pdschannel and chaincode pds-chaincode."
echo "  docker compose -f blockchain/fabric-network/docker-compose.fabric.yml --profile fabric up -d"
echo "Then join channel and deploy chaincode:"
echo "  ${ROOT}/scripts/osnadmin-channel-join.sh"
echo "  ${ROOT}/scripts/peer-channel-join.sh"
echo "  ${ROOT}/scripts/deploy-chaincode.sh"
