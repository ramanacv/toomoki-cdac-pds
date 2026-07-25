#!/usr/bin/env bash
# Point Keycloak pds-web at a public web origin for browser OIDC.
#
# The realm import only allows localhost redirect URIs. Remote public-cloud demos must
# patch pds-web after Keycloak is up.
#
# Usage (plain HTTP public IP demo, e.g. E2E Networks):
#   PDS_PUBLIC_WEB_ORIGIN=http://203.0.113.10:4173 \
#   KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME=... \
#   KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD=... \
#   npm run iam:configure-public-web
#
# Usage (HTTPS public origin):
#   PDS_PUBLIC_WEB_ORIGIN=https://demo.example.com \
#   KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME=... \
#   KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD=... \
#   npm run iam:configure-public-web
#
# kcadm talks to Keycloak on localhost inside the container. Do not use the
# public IP for admin API calls while sslRequired=external.
set -euo pipefail

: "${KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME:?Set KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME}"
: "${KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD:?Set KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD}"
: "${PDS_PUBLIC_WEB_ORIGIN:?Set PDS_PUBLIC_WEB_ORIGIN, e.g. http://<public-ip>:4173}"

origin="${PDS_PUBLIC_WEB_ORIGIN%/}"
callback="${origin}/auth/callback"
logout="${origin}/*"

compose=(docker compose --profile iam)
kcadm=("${compose[@]}" exec -T keycloak /opt/keycloak/bin/kcadm.sh)

"${kcadm[@]}" config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "$KEYCLOAK_BOOTSTRAP_ADMIN_USERNAME" \
  --password "$KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD" >/dev/null

web_id="$("${kcadm[@]}" get clients -r viksitpds -q clientId=pds-web --fields id --format csv --noquotes | head -n 1)"
test -n "$web_id"

"${kcadm[@]}" update "clients/${web_id}" -r viksitpds \
  -s "rootUrl=${origin}" \
  -s "baseUrl=${origin}/" \
  -s "redirectUris=[\"${callback}\",\"http://localhost:4173/auth/callback\",\"http://localhost:5173/auth/callback\"]" \
  -s "webOrigins=[\"${origin}\",\"http://localhost:4173\",\"http://localhost:5173\"]" \
  -s "attributes.\"post.logout.redirect.uris\"=${logout}##http://localhost:4173/*##http://localhost:5173/*" \
  >/dev/null

# Public HTTP demos need sslRequired=none; HTTPS origins keep external.
if [[ "$origin" == https://* ]]; then
  "${kcadm[@]}" update realms/viksitpds -s sslRequired=external >/dev/null
else
  "${kcadm[@]}" update realms/viksitpds -s sslRequired=none >/dev/null
fi

echo "Configured pds-web for origin ${origin}"
