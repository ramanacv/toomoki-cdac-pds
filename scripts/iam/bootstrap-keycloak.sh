#!/usr/bin/env bash
set -euo pipefail

: "${KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME:?Set KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME}"
: "${KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD:?Set KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD}"
: "${PDS_METRICS_CLIENT_SECRET:?Set PDS_METRICS_CLIENT_SECRET}"
: "${PDS_BENCHMARK_CLIENT_SECRET:?Set PDS_BENCHMARK_CLIENT_SECRET}"
: "${PDS_INTEGRATION_CLIENT_SECRET:?Set PDS_INTEGRATION_CLIENT_SECRET}"
: "${PDS_DEMO_USER_PASSWORD:?Set PDS_DEMO_USER_PASSWORD}"

compose=(docker compose --profile iam)
kcadm=("${compose[@]}" exec -T keycloak /opt/keycloak/bin/kcadm.sh)
"${kcadm[@]}" config credentials --server http://localhost:8080 --realm master \
  --user "$KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME" --password "$KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
"${compose[@]}" exec -T postgres psql -U pds -d pds_chain -v ON_ERROR_STOP=1 \
  < infra/postgres/schema.sql >/dev/null

client_id() {
  "${kcadm[@]}" get clients -r viksitpds -q "clientId=$1" --fields id --format csv --noquotes | head -n 1
}

ensure_realm_role() {
  local role="$1"
  if ! "${kcadm[@]}" get "roles/$role" -r viksitpds >/dev/null 2>&1; then
    "${kcadm[@]}" create roles -r viksitpds -s "name=$role" >/dev/null
  fi
}

ensure_integration_client() {
  local id
  id="$(client_id pds-integration-maharashtra)"
  if [[ -z "$id" ]]; then
    "${kcadm[@]}" create clients -r viksitpds \
      -s 'clientId=pds-integration-maharashtra' \
      -s 'name=Maharashtra non-production source adapters' \
      -s enabled=true -s publicClient=false -s serviceAccountsEnabled=true \
      -s standardFlowEnabled=false -s directAccessGrantsEnabled=false \
      -s 'protocol=openid-connect' >/dev/null
    id="$(client_id pds-integration-maharashtra)"
  fi
  test -n "$id"
  printf '%s' "$id"
}

ensure_mapper() {
  local id="$1" name="$2" mapper="$3" attribute="${4:-}" claim="${5:-}"
  if "${kcadm[@]}" get "clients/$id/protocol-mappers/models" -r viksitpds \
    --fields name --format csv --noquotes | grep -Fxq "$name"; then
    return
  fi
  if [[ "$mapper" == "oidc-audience-mapper" ]]; then
    "${kcadm[@]}" create "clients/$id/protocol-mappers/models" -r viksitpds \
      -s "name=$name" -s protocol=openid-connect -s "protocolMapper=$mapper" \
      -s 'config."included.client.audience"=pds-api' \
      -s 'config."access.token.claim"=true' >/dev/null
  else
    "${kcadm[@]}" create "clients/$id/protocol-mappers/models" -r viksitpds \
      -s "name=$name" -s protocol=openid-connect -s "protocolMapper=$mapper" \
      -s "config.\"user.attribute\"=$attribute" -s "config.\"claim.name\"=$claim" \
      -s 'config."jsonType.label"=String' -s 'config."access.token.claim"=true' >/dev/null
  fi
}

ensure_realm_role integration-service
integration_id="$(ensure_integration_client)"
ensure_mapper "$integration_id" pds-api-audience oidc-audience-mapper
ensure_mapper "$integration_id" pds-source-systems oidc-usermodel-attribute-mapper pds_source_systems pds_source_systems
ensure_mapper "$integration_id" pds-endpoint-families oidc-usermodel-attribute-mapper pds_endpoint_families pds_endpoint_families
ensure_mapper "$integration_id" pds-event-types oidc-usermodel-attribute-mapper pds_event_types pds_event_types

metrics_id="$(client_id pds-metrics)"
benchmark_id="$(client_id pds-benchmark)"
web_id="$(client_id pds-web)"
test -n "$metrics_id"
test -n "$benchmark_id"
test -n "$web_id"
ensure_mapper "$benchmark_id" pds-stakeholder-id oidc-usermodel-attribute-mapper pds_stakeholder_id pds_stakeholder_id
ensure_mapper "$benchmark_id" pds-org-id oidc-usermodel-attribute-mapper pds_org_id pds_org_id
ensure_mapper "$web_id" pds-stakeholder-id oidc-usermodel-attribute-mapper pds_stakeholder_id pds_stakeholder_id
ensure_mapper "$web_id" pds-org-id oidc-usermodel-attribute-mapper pds_org_id pds_org_id
test -n "$integration_id"
"${kcadm[@]}" update "clients/$metrics_id" -r viksitpds -s "secret=$PDS_METRICS_CLIENT_SECRET" >/dev/null
"${kcadm[@]}" update "clients/$benchmark_id" -r viksitpds -s "secret=$PDS_BENCHMARK_CLIENT_SECRET" >/dev/null
"${kcadm[@]}" update "clients/$integration_id" -r viksitpds -s "secret=$PDS_INTEGRATION_CLIENT_SECRET" >/dev/null

ensure_user() {
  local username="$1" role="$2" stakeholder_id="${3:-}" organization_id="${4:-}" user_id
  user_id="$("${kcadm[@]}" get users -r viksitpds -q "username=$username" -q exact=true --fields id --format csv --noquotes | head -n 1)"
  if [[ -z "$user_id" ]]; then
    "${kcadm[@]}" create users -r viksitpds -s "username=$username" -s enabled=true >/dev/null
    user_id="$("${kcadm[@]}" get users -r viksitpds -q "username=$username" -q exact=true --fields id --format csv --noquotes | head -n 1)"
  fi
  "${kcadm[@]}" set-password -r viksitpds --userid "$user_id" --new-password "$PDS_DEMO_USER_PASSWORD" >/dev/null
  "${kcadm[@]}" add-roles -r viksitpds --uid "$user_id" --rolename "$role" >/dev/null
  if [[ -n "$stakeholder_id" ]]; then
    "${kcadm[@]}" update "users/$user_id" -r viksitpds \
      -s "attributes={\"pds_stakeholder_id\":[\"$stakeholder_id\"],\"pds_org_id\":[\"$organization_id\"]}" >/dev/null
  fi
}

psql_exec() {
  "${compose[@]}" exec -T postgres psql -U pds -d pds_chain -v ON_ERROR_STOP=1 -c "$1" >/dev/null
}

assign_database_role() {
  local subject_id="$1" role="$2"
  psql_exec "
    INSERT INTO authorization_subjects (subject_id, status)
    VALUES ('$subject_id', 'ACTIVE')
    ON CONFLICT (subject_id) DO UPDATE SET status = 'ACTIVE', updated_at = NOW();
    INSERT INTO subject_role_assignments (subject_id, role, active)
    VALUES ('$subject_id', '$role', TRUE)
    ON CONFLICT (subject_id, role) DO UPDATE SET active = TRUE, valid_until = NULL;"
}

for role in management department procurement fci godown auditor platform-admin demo-reset; do
  ensure_user "demo-$role" "$role"
done
ensure_user "demo-fps" "fps" "FPS-101" "FPS-101"

for role in management department procurement fci godown fps auditor platform-admin demo-reset; do
  demo_subject_id="$("${kcadm[@]}" get users -r viksitpds -q "username=demo-$role" -q exact=true --fields id --format csv --noquotes | head -n 1)"
  test -n "$demo_subject_id"
  assign_database_role "$demo_subject_id" "$role"
  if [[ "$role" == "fps" ]]; then
    psql_exec "
      INSERT INTO subject_scope_assignments (subject_id, scope_type, scope_id, active)
      VALUES ('$demo_subject_id', 'FPS', 'FPS-101', TRUE)
      ON CONFLICT (subject_id, scope_type, scope_id)
      DO UPDATE SET active = TRUE, valid_until = NULL;"
  fi
done

metrics_service_user="service-account-pds-metrics"
benchmark_service_user="service-account-pds-benchmark"
integration_service_user="service-account-pds-integration-maharashtra"
"${kcadm[@]}" add-roles -r viksitpds --uusername "$metrics_service_user" --rolename metrics-reader >/dev/null
metrics_service_id="$("${kcadm[@]}" get users -r viksitpds -q "username=$metrics_service_user" -q exact=true --fields id --format csv --noquotes | head -n 1)"
test -n "$metrics_service_id"
assign_database_role "$metrics_service_id" "metrics-reader"
benchmark_service_id="$("${kcadm[@]}" get users -r viksitpds -q "username=$benchmark_service_user" -q exact=true --fields id --format csv --noquotes | head -n 1)"
test -n "$benchmark_service_id"
"${kcadm[@]}" update "users/$benchmark_service_id" -r viksitpds \
  -s 'attributes={"pds_stakeholder_id":["FPS-101"],"pds_org_id":["FPS-101"]}' >/dev/null
for role in management department procurement fci godown fps auditor platform-admin demo-reset; do
  "${kcadm[@]}" add-roles -r viksitpds --uusername "$benchmark_service_user" --rolename "$role" >/dev/null
  assign_database_role "$benchmark_service_id" "$role"
done
psql_exec "
  INSERT INTO subject_scope_assignments (subject_id, scope_type, scope_id, active)
  VALUES ('$benchmark_service_id', 'FPS', 'FPS-101', TRUE)
  ON CONFLICT (subject_id, scope_type, scope_id)
  DO UPDATE SET active = TRUE, valid_until = NULL;"
"${kcadm[@]}" add-roles -r viksitpds --uusername "$integration_service_user" --rolename integration-service >/dev/null
integration_service_id="$("${kcadm[@]}" get users -r viksitpds -q "username=$integration_service_user" -q exact=true --fields id --format csv --noquotes | head -n 1)"
test -n "$integration_service_id"
assign_database_role "$integration_service_id" "integration-service"
"${kcadm[@]}" update "users/$integration_service_id" -r viksitpds \
  -s 'attributes={"pds_source_systems":["SMARTPDS_RCMS,STATE_SCM,AEPDS_EPOS"],"pds_endpoint_families":["smartpds,scm,epos"],"pds_event_types":["MASTER_REFERENCE,ALLOCATION,MOVEMENT,DISTRIBUTION"]}' >/dev/null
for assignment in \
  "SMARTPDS_RCMS|smartpds|MASTER_REFERENCE" \
  "STATE_SCM|scm|ALLOCATION" \
  "STATE_SCM|scm|MOVEMENT" \
  "AEPDS_EPOS|epos|DISTRIBUTION"; do
  IFS='|' read -r source_system endpoint_family event_type <<<"$assignment"
  psql_exec "
    INSERT INTO integration_source_assignments
      (subject_id, source_system, endpoint_family, event_type, active)
    VALUES ('$integration_service_id', '$source_system', '$endpoint_family', '$event_type', TRUE)
    ON CONFLICT (subject_id, source_system, endpoint_family, event_type)
    DO UPDATE SET active = TRUE;"
done
psql_exec "
  INSERT INTO integration_credentials
    (credential_id, subject_id, credential_fingerprint, status)
  VALUES (
    'pds-integration-maharashtra',
    '$integration_service_id',
    'oidc-client:pds-integration-maharashtra',
    'ACTIVE'
  )
  ON CONFLICT (credential_id) DO UPDATE
  SET subject_id = EXCLUDED.subject_id, status = 'ACTIVE', expires_at = NULL;"

echo "Keycloak realm users, service roles and client secrets are configured."
