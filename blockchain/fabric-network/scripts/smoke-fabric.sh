#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3000}"
OIDC_TOKEN_URL="${PDS_OIDC_TOKEN_URL:-http://localhost:8080/realms/viksitpds/protocol/openid-connect/token}"
: "${PDS_BENCHMARK_CLIENT_SECRET:?Set PDS_BENCHMARK_CLIENT_SECRET}"
AUTH_TOKEN="${PDS_E2E_ACCESS_TOKEN:-$(curl -sf -X POST "$OIDC_TOKEN_URL" \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode grant_type=client_credentials \
  --data-urlencode client_id=pds-benchmark \
  --data-urlencode "client_secret=$PDS_BENCHMARK_CLIENT_SECRET" | jq -r .access_token)}"

auth_header=()
if [[ -n "${AUTH_TOKEN}" ]]; then
  auth_header=(-H "Authorization: Bearer ${AUTH_TOKEN}")
fi

echo "Fabric smoke: health check"
curl -sf "${API_BASE}/health" | grep -q '"ok":true'

echo "Fabric smoke: register stakeholder"
curl -sf -X POST "${API_BASE}/stakeholders" \
  -H 'Content-Type: application/json' \
  "${auth_header[@]}" \
  -d '{"stakeholderId":"SMOKE-001","stakeholderType":"DISTRICT_SUPPLY_OFFICE","name":"Smoke Test","district":"Demo","licenseNo":"SMK-001","status":"ACTIVE"}'

echo "Fabric smoke: trace lot history"
curl -sf "${API_BASE}/trace/lots/LOT-RICE-2026-001" "${auth_header[@]}" | grep -q 'verificationSource'

echo "Fabric smoke checks passed"
