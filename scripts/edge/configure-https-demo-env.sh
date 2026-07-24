#!/usr/bin/env bash
# Print / merge HTTPS public-demo env for a public IP or explicit hostnames.
# Usage:
#   scripts/edge/configure-https-demo-env.sh --ip 151.185.43.18 --email you@example.com
#   scripts/edge/configure-https-demo-env.sh --web demo.example.com --auth login.example.com --email you@example.com
set -euo pipefail

web_host=""
auth_host=""
public_ip=""
acme_email=""
write_env=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ip) public_ip="${2:?}"; shift 2 ;;
    --web) web_host="${2:?}"; shift 2 ;;
    --auth) auth_host="${2:?}"; shift 2 ;;
    --email) acme_email="${2:?}"; shift 2 ;;
    --write-env) write_env=1; shift ;;
    -h|--help)
      sed -n '2,6p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -n "$public_ip" ]]; then
  web_host="${web_host:-${public_ip}.sslip.io}"
  auth_host="${auth_host:-auth.${public_ip}.sslip.io}"
fi

: "${web_host:?Set --web or --ip}"
: "${auth_host:?Set --auth or --ip}"
: "${acme_email:?Set --email for Let's Encrypt registration}"

web_origin="https://${web_host}"
auth_base="https://${auth_host}"
authority="${auth_base}/realms/viksitpds"

snippet=$(cat <<EOF
# HTTPS public demo values (managed between BEGIN/END markers when using --write-env)
PDS_WEB_HOST=${web_host}
PDS_AUTH_HOST=${auth_host}
PDS_ACME_EMAIL=${acme_email}
VITE_OIDC_AUTHORITY=${authority}
VITE_OIDC_CLIENT_ID=pds-web
PDS_OIDC_ISSUER=${authority}
PDS_OIDC_JWKS_URI=http://keycloak:8080/realms/viksitpds/protocol/openid-connect/certs
PDS_CORS_ORIGINS=${web_origin}
PDS_PUBLIC_WEB_ORIGIN=${web_origin}
KC_HOSTNAME=${auth_host}
KC_HOSTNAME_URL=${auth_base}
KC_HOSTNAME_ADMIN_URL=${auth_base}
KC_PROXY_HEADERS=xforwarded
KC_HTTP_ENABLED=true
EOF
)

printf '%s\n' "$snippet"

if [[ "$write_env" -eq 1 ]]; then
  root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
  env_file="${root}/.env"
  if [[ ! -f "$env_file" ]]; then
    cp "${root}/.env.example" "$env_file"
  fi
  tmp="$(mktemp)"
  awk '
    BEGIN {skip=0}
    /^# BEGIN PDS HTTPS PUBLIC DEMO/ {skip=1; next}
    /^# END PDS HTTPS PUBLIC DEMO/ {skip=0; next}
    skip {next}
    {print}
  ' "$env_file" >"$tmp"
  {
    printf '\n# BEGIN PDS HTTPS PUBLIC DEMO\n'
    printf '%s\n' "$snippet"
    printf '# END PDS HTTPS PUBLIC DEMO\n'
  } >>"$tmp"
  mv "$tmp" "$env_file"
  echo "Updated ${env_file}" >&2
fi

echo >&2
echo "Open the demo at: ${web_origin}" >&2
echo "Keycloak at:      ${auth_base}" >&2
