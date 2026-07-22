#!/usr/bin/env bash
set -euo pipefail

root="$(pwd)"
docs_dir="$root/docs/security"
raw_dir="/tmp/viksitpds-security-$(date -u +%Y%m%d%H%M%S)"
mkdir -p "$docs_dir" "$raw_dir"
chmod 700 "$raw_dir"

npm sbom --package-lock-only --sbom-format cyclonedx --omit optional > "$docs_dir/sbom.cdx.json"
npm query '*' --json | jq '{generatedAt: (now | todate), packages: ([.[] | select(.name and .version) | {name, version, license: (if (.license | type) == "string" then .license elif .license.type then .license.type else "UNKNOWN" end), private: (.private // false)}] | unique_by(.name + "@" + .version) | sort_by(.name, .version))}' > "$docs_dir/license-inventory.json"

set +e
npm audit --offline --json > "$raw_dir/npm-audit.json"
audit_status=$?
set -e
chmod 600 "$raw_dir/npm-audit.json"

audit_counts="$(jq -c '.metadata.vulnerabilities // {unavailable: 1}' "$raw_dir/npm-audit.json" 2>/dev/null || echo '{"unavailable":1}')"
licence_total="$(jq '.packages | length' "$docs_dir/license-inventory.json")"
licence_counts="$(jq -r '[.packages[].license] | group_by(.) | map("\(.[0])=\(length)") | join(", ")' "$docs_dir/license-inventory.json")"
secret_files="$(git grep -l -I -E '(AKIA[0-9A-Z]{16}|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|client_secret[[:space:]]*[:=][[:space:]]*[^$<{])' -- ':!package-lock.json' ':!scripts/generate-security-evidence.sh' 2>/dev/null | wc -l)"
trivy_state="not run because Trivy is unavailable in this environment"
command -v trivy >/dev/null 2>&1 && trivy_state="available; an image-specific scan still requires the exact built release image"
zap_state="not run because ZAP baseline tooling is unavailable in this environment"
command -v zap-baseline.py >/dev/null 2>&1 && zap_state="available; a running authenticated target and explicit test authorization are still required"

{
  echo '# Automated Security Evidence'
  echo
  echo "Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo '## Results'
  echo
  echo '- CycloneDX SBOM: generated at `docs/security/sbom.cdx.json` from the package lock.'
  echo "- Licence inventory: $licence_total unique package/version entries; $licence_counts. Unknown licences require manual review."
  echo "- Dependency audit: $audit_counts (npm exit $audit_status). Full raw output is retained only under \`$raw_dir\`."
  echo "- Tracked-source secret pattern scan: $secret_files candidate file(s). Candidate contents are never printed; any candidate requires manual review."
  echo "- Container-image scan: $trivy_state."
  echo "- OWASP ZAP baseline: $zap_state."
  echo
  echo '## Limitations'
  echo
  echo 'This is automated component evidence, not VAPT, legal certification or proof that deployed images and infrastructure are vulnerability-free. Review the remediation register and rerun against the exact release artifacts.'
} > "$docs_dir/security-assurance-results.md"

jq -n --arg sbom docs/security/sbom.cdx.json --argjson licences "$licence_total" --argjson audit "$audit_counts" --argjson secretCandidateFiles "$secret_files" --arg rawDir "$raw_dir" '{sbom: $sbom, licences: $licences, auditCounts: $audit, secretCandidateFiles: $secretCandidateFiles, rawDir: $rawDir}'
