#!/usr/bin/env bash
set -euo pipefail
trap 'echo "IAM bootstrap failed at line $LINENO" >&2' ERR

: "${KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME:?Set KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME}"
: "${KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD:?Set KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD}"
: "${PDS_METRICS_CLIENT_SECRET:?Set PDS_METRICS_CLIENT_SECRET}"
: "${PDS_BENCHMARK_CLIENT_SECRET:?Set PDS_BENCHMARK_CLIENT_SECRET}"
: "${PDS_INTEGRATION_CLIENT_SECRET:?Set PDS_INTEGRATION_CLIENT_SECRET}"
: "${PDS_DEMO_USER_PASSWORD:?Set PDS_DEMO_USER_PASSWORD}"

compose=(docker compose --profile iam)
kcadm=("${compose[@]}" exec -T keycloak /opt/keycloak/bin/kcadm.sh)

authenticate_keycloak() {
  "${kcadm[@]}" config credentials --server http://localhost:8080 --realm master \
    --user "$KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME" --password "$KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null
}

authenticate_keycloak
"${compose[@]}" exec -T postgres psql -U pds -d pds_chain -v ON_ERROR_STOP=1 \
  < infra/postgres/schema.sql >/dev/null

client_id() {
  "${kcadm[@]}" get clients -r viksitpds -q "clientId=$1" --fields id --format csv --noquotes | head -n 1
}

ensure_realm_role() {
  local role="$1"
  local description="${2:-}"
  if ! "${kcadm[@]}" get "roles/$role" -r viksitpds >/dev/null 2>&1; then
    if [[ -n "$description" ]]; then
      "${kcadm[@]}" create roles -r viksitpds -s "name=$role" -s "description=$description" >/dev/null
    else
      "${kcadm[@]}" create roles -r viksitpds -s "name=$role" >/dev/null
    fi
  elif [[ -n "$description" ]]; then
    "${kcadm[@]}" update "roles/$role" -r viksitpds -s "description=$description" >/dev/null
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
  local id="$1" name="$2" mapper="$3" attribute="${4:-}" claim="${5:-}" mapper_id endpoint operation
  mapper_id="$("${kcadm[@]}" get "clients/$id/protocol-mappers/models" -r viksitpds \
    --fields id,name --format csv --noquotes |
    awk -F, -v mapper_name="$name" '$2 == mapper_name { print $1; exit }')"
  endpoint="clients/$id/protocol-mappers/models"
  operation="create"
  if [[ -n "$mapper_id" ]]; then
    endpoint="$endpoint/$mapper_id"
    operation="update"
  fi
  if [[ "$mapper" == "oidc-audience-mapper" ]]; then
    "${kcadm[@]}" "$operation" "$endpoint" -r viksitpds \
      -s "name=$name" -s protocol=openid-connect -s "protocolMapper=$mapper" \
      -s 'config."included.client.audience"=pds-api' \
      -s 'config."access.token.claim"=true' >/dev/null
  else
    "${kcadm[@]}" "$operation" "$endpoint" -r viksitpds \
      -s "name=$name" -s protocol=openid-connect -s "protocolMapper=$mapper" \
      -s "config.\"user.attribute\"=$attribute" -s "config.\"claim.name\"=$claim" \
      -s 'config."jsonType.label"=String' -s 'config."access.token.claim"=true' >/dev/null
  fi
}

ensure_realm_role integration-service "Restricted inbound source-event ingestion"
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

authenticate_keycloak

ensure_user() {
  local username="$1" role="$2" first_name="$3" last_name="$4" user_id
  user_id="$("${kcadm[@]}" get users -r viksitpds -q "username=$username" -q exact=true --fields id --format csv --noquotes | head -n 1)"
  if [[ -z "$user_id" ]]; then
    "${kcadm[@]}" create users -r viksitpds       -s "username=$username" -s enabled=true       -s "firstName=$first_name" -s "lastName=$last_name" >/dev/null
    user_id="$("${kcadm[@]}" get users -r viksitpds -q "username=$username" -q exact=true --fields id --format csv --noquotes | head -n 1)"
  else
    "${kcadm[@]}" update "users/$user_id" -r viksitpds       -s "firstName=$first_name" -s "lastName=$last_name" -s enabled=true >/dev/null
  fi
  "${kcadm[@]}" set-password -r viksitpds --userid "$user_id" --new-password "$PDS_DEMO_USER_PASSWORD" >/dev/null
  "${kcadm[@]}" add-roles -r viksitpds --uid "$user_id" --rolename "$role" >/dev/null
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

demo_roles=(management department procurement fci godown block-office fps auditor platform-admin demo-reset)

declare -A role_descriptions=(
  [management]="Management — read-only operational dashboards"
  [department]="District Supply Officer (DSO) — Stage-II Release Order authorization"
  [procurement]="Procurement lot and dispatch operations (compatibility role)"
  [fci]="FCI Depot Officer — Stage-I origin and dispatch to state godown"
  [godown]="Godown Operator — state and block godown receipt and dispatch"
  [block-office]="Block Supply Officer (BSO) — FPS allotment and block monitoring"
  [fps]="FPS Dealer — shop receipt and simulated AePDS/ePoS distribution"
  [auditor]="Auditor — trace, reconciliation, proof and alert review"
  [platform-admin]="Platform administrator — application administration views"
  [demo-reset]="Controlled destructive demo reset"
  [metrics-reader]="Prometheus metrics access"
  [integration-service]="Restricted inbound source-event ingestion"
)

declare -A role_display_names=(
  [management]="Management|Dashboard"
  [department]="District Supply|Officer"
  [procurement]="Procurement|Officer"
  [fci]="FCI Depot|Officer"
  [godown]="Godown|Operator"
  [block-office]="Block Supply|Officer"
  [fps]="FPS|Dealer"
  [auditor]="Auditor|Reviewer"
  [platform-admin]="Platform|Administrator"
  [demo-reset]="Demo|Reset"
)

for role in "${!role_descriptions[@]}"; do
  ensure_realm_role "$role" "${role_descriptions[$role]}"
done

for role in management department procurement fci godown block-office auditor platform-admin demo-reset; do
  IFS='|' read -r first_name last_name <<<"${role_display_names[$role]}"
  ensure_user "demo-$role" "$role" "$first_name" "$last_name"
done
IFS='|' read -r first_name last_name <<<"${role_display_names[fps]}"
ensure_user "demo-fps" "fps" "Suresh" "Jadhav"
ensure_user "demo-fps-202" "fps" "Anita" "Deshmukh"

for role in "${demo_roles[@]}"; do
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

demo_fps_202_id="$("${kcadm[@]}" get users -r viksitpds -q "username=demo-fps-202" -q exact=true --fields id --format csv --noquotes | head -n 1)"
test -n "$demo_fps_202_id"
assign_database_role "$demo_fps_202_id" "fps"
psql_exec "
  INSERT INTO subject_scope_assignments (subject_id, scope_type, scope_id, active)
  VALUES ('$demo_fps_202_id', 'FPS', 'FPS-202', TRUE)
  ON CONFLICT (subject_id, scope_type, scope_id)
  DO UPDATE SET active = TRUE, valid_until = NULL;"

authenticate_keycloak

metrics_service_user="service-account-pds-metrics"
benchmark_service_user="service-account-pds-benchmark"
integration_service_user="service-account-pds-integration-maharashtra"
"${kcadm[@]}" add-roles -r viksitpds --uusername "$metrics_service_user" --rolename metrics-reader >/dev/null
metrics_service_id="$("${kcadm[@]}" get users -r viksitpds -q "username=$metrics_service_user" -q exact=true --fields id --format csv --noquotes | head -n 1)"
test -n "$metrics_service_id"
assign_database_role "$metrics_service_id" "metrics-reader"
benchmark_service_id="$("${kcadm[@]}" get users -r viksitpds -q "username=$benchmark_service_user" -q exact=true --fields id --format csv --noquotes | head -n 1)"
test -n "$benchmark_service_id"
for role in "${demo_roles[@]}"; do
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

authenticate_keycloak

verify_demo_user() {
  local role="$1" subject_id realm_roles database_role_count fps_scope_count
  subject_id="$("${kcadm[@]}" get users -r viksitpds -q "username=demo-$role" -q exact=true \
    --fields id --format csv --noquotes | head -n 1)"
  test -n "$subject_id"
  realm_roles="$("${kcadm[@]}" get "users/$subject_id/role-mappings/realm/composite" -r viksitpds \
    --fields name --format csv --noquotes)"
  grep -Fxq "$role" <<<"$realm_roles"
  database_role_count="$("${compose[@]}" exec -T postgres psql -U pds -d pds_chain -tA -v ON_ERROR_STOP=1 \
    -c "SELECT COUNT(*) FROM subject_role_assignments WHERE subject_id = '$subject_id' AND role = '$role' AND active = TRUE AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until > NOW());")"
  [[ "$database_role_count" == "1" ]]
  if [[ "$role" == "fps" ]]; then
    fps_scope_count="$("${compose[@]}" exec -T postgres psql -U pds -d pds_chain -tA -v ON_ERROR_STOP=1 \
      -c "SELECT COUNT(*) FROM subject_scope_assignments WHERE subject_id = '$subject_id' AND scope_type = 'FPS' AND scope_id = 'FPS-101' AND active = TRUE AND valid_from <= NOW() AND (valid_until IS NULL OR valid_until > NOW());")"
    [[ "$fps_scope_count" == "1" ]]
  fi
}

for role in "${demo_roles[@]}"; do
  verify_demo_user "$role"
done

echo "Keycloak realm users, service roles and client secrets are configured."
