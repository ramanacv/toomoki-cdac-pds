import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { SourceEventEnvelope, SourceSystem } from '@pds/shared-types';
import { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import type { PdsIdentity, PdsRole } from './identity-provider.js';

const databaseAuthorizationEnabled = (): boolean =>
  (process.env.PDS_AUTHORIZATION_MODE ?? 'claims').trim().toLowerCase() === 'database';

@Injectable()
export class DurableAuthorizationService {
  constructor(@Inject(PdsLedgerFacade) private readonly ledger: PdsLedgerFacade) {}

  async assertRoles(identity: PdsIdentity, requiredRoles?: readonly PdsRole[]): Promise<void> {
    if (!databaseAuthorizationEnabled()) return;
    const pool = this.ledger.getOperationalPool();
    if (!pool) throw new ForbiddenException('Database authorization is unavailable');
    const result = await pool.query(
      `SELECT role FROM authorization_subjects s
       JOIN subject_role_assignments r ON r.subject_id = s.subject_id
       WHERE s.subject_id = $1 AND s.status = 'ACTIVE' AND r.active = TRUE
         AND r.valid_from <= NOW() AND (r.valid_until IS NULL OR r.valid_until > NOW())`,
      [identity.subject]
    );
    const assigned = new Set(result.rows.map((row) => String(row.role)));
    const tokenRolesAreAssigned = identity.roles.every((role) => assigned.has(role));
    const requiredRoleAssigned = !requiredRoles?.length || requiredRoles.some((role) => assigned.has(role));
    if (!tokenRolesAreAssigned || !requiredRoleAssigned) {
      throw new ForbiddenException('Authenticated subject has no active database role assignment');
    }
  }

  async assertFpsScope(identity: PdsIdentity, fpsId: string): Promise<void> {
    if (!databaseAuthorizationEnabled()) return;
    const pool = this.ledger.getOperationalPool();
    if (!pool) throw new ForbiddenException('Database authorization is unavailable');
    const result = await pool.query(
      `SELECT 1 FROM subject_scope_assignments
       WHERE subject_id = $1 AND scope_type = 'FPS' AND scope_id = $2
         AND active = TRUE AND valid_from <= NOW()
         AND (valid_until IS NULL OR valid_until > NOW())`,
      [identity.subject, fpsId]
    );
    if (!result.rowCount) throw new ForbiddenException('FPS identity has no active database shop assignment');
  }

  async assertIntegrationContract(
    identity: PdsIdentity,
    sourceSystem: SourceSystem,
    endpointFamily: string,
    eventType: SourceEventEnvelope['eventType']
  ): Promise<void> {
    if (!databaseAuthorizationEnabled()) return;
    const pool = this.ledger.getOperationalPool();
    if (!pool) throw new ForbiddenException('Database authorization is unavailable');
    const authorizedParty = typeof identity.claims.azp === 'string' ? identity.claims.azp : '';
    const result = await pool.query(
      `SELECT 1
       FROM integration_source_assignments a
       JOIN authorization_subjects s ON s.subject_id = a.subject_id
       JOIN integration_credentials c ON c.subject_id = a.subject_id
       WHERE a.subject_id = $1 AND a.source_system = $2 AND a.endpoint_family = $3
         AND a.event_type = $4 AND a.active = TRUE AND s.status = 'ACTIVE'
         AND c.credential_id = $5 AND c.status = 'ACTIVE'
         AND (c.expires_at IS NULL OR c.expires_at > NOW())`,
      [identity.subject, sourceSystem, endpointFamily, eventType, authorizedParty]
    );
    if (!result.rowCount) {
      throw new ForbiddenException('Integration identity has no active database source or credential assignment');
    }
  }
}

export { databaseAuthorizationEnabled };
