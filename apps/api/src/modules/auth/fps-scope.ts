import { createHash } from 'node:crypto';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StakeholderStatus, StakeholderType } from '@pds/shared-types';
import type { PdsLedgerFacade } from '../core/pds-ledger.facade.js';
import type { AuthenticatedRequest, PdsIdentity } from './identity-provider.js';
import { databaseAuthorizationEnabled } from './durable-authorization.service.js';

export type FpsAssignment = {
  fpsId: string;
  operatorRef: string;
};

const opaqueOperatorRef = (subject: string): string =>
  `operator-${createHash('sha256').update(`viksitpds:fps:${subject}`).digest('hex').slice(0, 24)}`;

export const identityFromRequest = (request?: AuthenticatedRequest): PdsIdentity | undefined =>
  request?.user;

export const requireFpsAssignment = async (
  ledger: PdsLedgerFacade,
  request?: AuthenticatedRequest
): Promise<FpsAssignment> => {
  const identity = identityFromRequest(request);
  if (!identity?.roles.includes('fps')) {
    throw new ForbiddenException('An authenticated FPS assignment is required');
  }
  if (!identity.stakeholderId) {
    throw new ForbiddenException('FPS identity has no active shop assignment');
  }

  let stakeholder;
  try {
    stakeholder = await Promise.resolve(ledger.getStakeholder(identity.stakeholderId));
  } catch {
    throw new ForbiddenException('FPS identity has no active shop assignment');
  }
  if (
    stakeholder.stakeholderType !== StakeholderType.FAIR_PRICE_SHOP ||
    stakeholder.status !== StakeholderStatus.ACTIVE
  ) {
    throw new ForbiddenException('FPS identity has no active shop assignment');
  }
  if (databaseAuthorizationEnabled()) {
    const pool = ledger.getOperationalPool();
    if (!pool) throw new ForbiddenException('Database authorization is unavailable');
    const scope = await pool.query(
      `SELECT 1 FROM subject_scope_assignments
       WHERE subject_id = $1 AND scope_type = 'FPS' AND scope_id = $2
         AND active = TRUE AND valid_from <= NOW()
         AND (valid_until IS NULL OR valid_until > NOW())`,
      [identity.subject, identity.stakeholderId]
    );
    if (!scope.rowCount) throw new ForbiddenException('FPS identity has no active database shop assignment');
  }

  return {
    fpsId: stakeholder.stakeholderId,
    operatorRef: opaqueOperatorRef(identity.subject)
  };
};

export const fpsAssignmentForRead = async (
  ledger: PdsLedgerFacade,
  request?: AuthenticatedRequest
): Promise<FpsAssignment | undefined> => {
  const identity = identityFromRequest(request);
  return identity?.roles.includes('fps') ? requireFpsAssignment(ledger, request) : undefined;
};

export const assertCompatibleFpsIdentity = (
  assignment: FpsAssignment,
  input: { fpsId?: string; dealerId?: string }
): void => {
  if (input.fpsId !== undefined && input.fpsId !== assignment.fpsId) {
    throw new ForbiddenException('FPS request does not match the authenticated shop assignment');
  }
  if (input.dealerId !== undefined && input.dealerId !== assignment.operatorRef) {
    throw new ForbiddenException('Dealer reference does not match the authenticated operator');
  }
};

export const hideCrossShopResource = (resourceName: string): never => {
  throw new NotFoundException(`${resourceName} not found`);
};
