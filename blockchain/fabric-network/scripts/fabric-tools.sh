#!/usr/bin/env bash
# Run Fabric CLI tools via Docker when host binaries are not installed.
set -euo pipefail

NETWORK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FABRIC_VERSION="${FABRIC_VERSION:-2.5.13}"
IMAGE="hyperledger/fabric-tools:${FABRIC_VERSION}"
DOCKER_NETWORK="${FABRIC_DOCKER_NETWORK:-pds-fabric}"

run_fabric_tools() {
  docker run --rm \
    --network "${DOCKER_NETWORK}" \
    -v "${NETWORK_ROOT}:/work" \
    -w /work \
    -e FABRIC_CFG_PATH=/work/config \
    "${IMAGE}" \
    "$@"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_fabric_tools "$@"
fi
