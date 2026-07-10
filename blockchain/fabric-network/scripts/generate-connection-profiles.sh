#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/connection-profiles"

mkdir -p "${OUT}"

generate_single_org_profile() {
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
  "channels": {
    "pdschannel": {
      "peers": {
        "${peer}": {
          "endorsingPeer": true,
          "chaincodeQuery": true,
          "ledgerQuery": true,
          "eventSource": true
        }
      }
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

generate_dual_org_profile() {
  cat > "${OUT}/food-department.json" <<EOF
{
  "name": "FoodAndCivilSupplies",
  "version": "1.0.0",
  "client": {
    "organization": "FoodAndCivilSupplies",
    "connection": {
      "timeout": {
        "peer": { "endorser": "300" }
      }
    }
  },
  "organizations": {
    "FoodAndCivilSupplies": {
      "mspid": "FoodAndCivilSuppliesMSP",
      "peers": ["peer0.food.example.com"]
    },
    "GodownWarehouse": {
      "mspid": "GodownWarehouseMSP",
      "peers": ["peer0.godown.example.com"]
    }
  },
  "channels": {
    "pdschannel": {
      "peers": {
        "peer0.food.example.com": {
          "endorsingPeer": true,
          "chaincodeQuery": true,
          "ledgerQuery": true,
          "eventSource": true
        },
        "peer0.godown.example.com": {
          "endorsingPeer": true,
          "chaincodeQuery": true,
          "ledgerQuery": true,
          "eventSource": true
        }
      }
    }
  },
  "peers": {
    "peer0.food.example.com": {
      "url": "grpcs://peer0.food.example.com:7051",
      "tlsCACerts": {
        "path": "../crypto/peerOrganizations/food.example.com/peers/peer0.food.example.com/tls/ca.crt"
      },
      "grpcOptions": {
        "ssl-target-name-override": "peer0.food.example.com",
        "hostnameOverride": "peer0.food.example.com"
      }
    },
    "peer0.godown.example.com": {
      "url": "grpcs://peer0.godown.example.com:9051",
      "tlsCACerts": {
        "path": "../crypto/peerOrganizations/godown.example.com/peers/peer0.godown.example.com/tls/ca.crt"
      },
      "grpcOptions": {
        "ssl-target-name-override": "peer0.godown.example.com",
        "hostnameOverride": "peer0.godown.example.com"
      }
    }
  }
}
EOF
}

generate_dual_org_profile
generate_single_org_profile GodownWarehouse godown-warehouse.json GodownWarehouseMSP peer0.godown.example.com 9051

# Regenerate connection profiles for the 2-org demo network
echo "connection profiles written to ${OUT}"
