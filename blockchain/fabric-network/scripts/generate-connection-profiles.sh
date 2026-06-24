#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/connection-profiles"

mkdir -p "${OUT}"

generate_profile() {
  local org="$1"
  local file="$2"
  local msp="$3"
  local peer="$4"
  local port="$5"

  cat > "${OUT}/${file}" <<EOF
{
  "name": "${org}",
  "version": "1.0.0",
  "client": {
    "organization": "${org}",
    "connection": {
      "timeout": {
        "peer": { "endorser": "300" }
      }
    }
  },
  "organizations": {
    "${org}": {
      "mspid": "${msp}",
      "peers": ["${peer}"]
    }
  },
  "peers": {
    "${peer}": {
      "url": "grpcs://${peer}:${port}",
      "tlsCACerts": {
        "path": "../crypto/peerOrganizations/${peer#peer0.}/peers/${peer}/tls/ca.crt"
      },
      "grpcOptions": {
        "ssl-target-name-override": "${peer}",
        "hostnameOverride": "${peer}"
      }
    }
  }
}
EOF
}

generate_profile FoodAndCivilSupplies food-department.json FoodAndCivilSuppliesMSP peer0.food.example.com 7051
generate_profile GodownWarehouse godown-warehouse.json GodownWarehouseMSP peer0.godown.example.com 9051

# Regenerate connection profiles for the 2-org demo network
echo "connection profiles written to ${OUT}"
