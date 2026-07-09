#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:3000}"
AUTH_TOKEN="${PDS_DEV_AUTH_TOKEN:-${SMOKE_AUTH_TOKEN:-}}"

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
curl -sf "${API_BASE}/trace/lots/LOT-RICE-2026-001" | grep -q 'verificationSource'

echo "Fabric smoke checks passed"
