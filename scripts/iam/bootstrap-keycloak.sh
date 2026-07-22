#!/usr/bin/env bash
set -euo pipefail

: "${KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME:?Set KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME}"
: "${KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD:?Set KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD}"
: "${PDS_METRICS_CLIENT_SECRET:?Set PDS_METRICS_CLIENT_SECRET}"
: "${PDS_BENCHMARK_CLIENT_SECRET:?Set PDS_BENCHMARK_CLIENT_SECRET}"
: "${PDS_DEMO_USER_PASSWORD:?Set PDS_DEMO_USER_PASSWORD}"

compose=(docker compose --profile iam)
kcadm=("${compose[@]}" exec -T keycloak /opt/keycloak/bin/kcadm.sh)
"${kcadm[@]}" config credentials --server http://localhost:8080 --realm master \
  --user "$KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME" --password "$KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null

client_id() {
  "${kcadm[@]}" get clients -r viksitpds -q "clientId=$1" --fields id --format csv --noquotes | head -n 1
}

metrics_id="$(client_id pds-metrics)"
benchmark_id="$(client_id pds-benchmark)"
test -n "$metrics_id"
test -n "$benchmark_id"
"${kcadm[@]}" update "clients/$metrics_id" -r viksitpds -s "secret=$PDS_METRICS_CLIENT_SECRET" >/dev/null
"${kcadm[@]}" update "clients/$benchmark_id" -r viksitpds -s "secret=$PDS_BENCHMARK_CLIENT_SECRET" >/dev/null

ensure_user() {
  local username="$1" role="$2" user_id
  user_id="$("${kcadm[@]}" get users -r viksitpds -q "username=$username" -q exact=true --fields id --format csv --noquotes | head -n 1)"
  if [[ -z "$user_id" ]]; then
    "${kcadm[@]}" create users -r viksitpds -s "username=$username" -s enabled=true >/dev/null
    user_id="$("${kcadm[@]}" get users -r viksitpds -q "username=$username" -q exact=true --fields id --format csv --noquotes | head -n 1)"
  fi
  "${kcadm[@]}" set-password -r viksitpds --userid "$user_id" --new-password "$PDS_DEMO_USER_PASSWORD" >/dev/null
  "${kcadm[@]}" add-roles -r viksitpds --uid "$user_id" --rolename "$role" >/dev/null
}

for role in management department procurement fci godown fps auditor platform-admin demo-reset; do
  ensure_user "demo-$role" "$role"
done

metrics_service_user="service-account-pds-metrics"
benchmark_service_user="service-account-pds-benchmark"
"${kcadm[@]}" add-roles -r viksitpds --uusername "$metrics_service_user" --rolename metrics-reader >/dev/null
for role in management department procurement fci godown fps auditor platform-admin demo-reset; do
  "${kcadm[@]}" add-roles -r viksitpds --uusername "$benchmark_service_user" --rolename "$role" >/dev/null
done

echo "Keycloak realm users, service roles and client secrets are configured."
