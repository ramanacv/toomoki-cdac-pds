import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const realm = JSON.parse(readFileSync(join(root, 'infra/keycloak/viksitpds-realm.json'), 'utf8'));
const bootstrap = readFileSync(join(root, 'scripts/iam/bootstrap-keycloak.sh'), 'utf8');
const serviceToken = readFileSync(join(root, 'scripts/iam/service-token.mjs'), 'utf8');
const compose = readFileSync(join(root, 'docker-compose.yml'), 'utf8');

describe('IAM assignments for FPS and source integrations', () => {
  it('defines least-privilege realm roles and a restricted Maharashtra service client', () => {
    const roles = realm.roles.realm.map((role: { name: string }) => role.name);
    expect(roles).toContain('integration-service');
    const client = realm.clients.find((item: { clientId: string }) => item.clientId === 'pds-integration-maharashtra');
    expect(client).toMatchObject({
      publicClient: false,
      serviceAccountsEnabled: true,
      directAccessGrantsEnabled: false
    });
    expect(client.protocolMappers.map((mapper: { name: string }) => mapper.name)).toEqual(expect.arrayContaining([
      'pds-api-audience', 'pds-source-systems', 'pds-endpoint-families', 'pds-event-types'
    ]));
  });

  it('idempotently assigns demo-fps to FPS-101 and limits the integration account by durable contracts', () => {
    expect(bootstrap).toContain('ensure_user "demo-fps" "fps"');
    expect(bootstrap).toContain('service-account-pds-integration-maharashtra');
    expect(bootstrap).toContain('"SMARTPDS_RCMS|smartpds|MASTER_REFERENCE"');
    expect(bootstrap).toContain('"STATE_SCM|scm|ALLOCATION"');
    expect(bootstrap).toContain('"AEPDS_EPOS|epos|DISTRIBUTION"');
    expect(bootstrap).toContain('ensure_integration_client');
    expect(bootstrap).toContain('ensure_mapper "$integration_id" pds-source-systems');
    expect(bootstrap).toContain('integration_source_assignments');
    expect(bootstrap).toContain('integration_credentials');
  });

  it('reconciles claim mappers and verifies every seeded demo identity', () => {
    expect(bootstrap).toContain('"$operation" "$endpoint"');
    expect(bootstrap).toContain('demo_roles=(management department procurement fci godown block-office fps auditor platform-admin demo-reset)');
    expect(bootstrap).toContain('verify_demo_user "$role"');
    expect(bootstrap).toContain('subject_role_assignments WHERE subject_id');
    expect(bootstrap).toContain("scope_type = 'FPS'");
    expect(bootstrap.match(/authenticate_keycloak/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('uses the same default public issuer host for service tokens and API validation', () => {
    expect(serviceToken).toContain('http://localhost:8080/realms/viksitpds');
    expect(compose).toContain('PDS_OIDC_ISSUER: ${PDS_OIDC_ISSUER:-http://localhost:8080/realms/viksitpds}');
  });
});
