import { describe, expect, it } from 'vitest';
import { AllocationsController } from '../src/modules/allocations/allocations.controller.js';
import { AdminController } from '../src/modules/admin/admin.controller.js';
import { AuditController } from '../src/modules/audit/audit.controller.js';
import { AuthController } from '../src/modules/auth/auth.controller.js';
import { DistributionsController } from '../src/modules/distributions/distributions.controller.js';
import { EntitlementsController } from '../src/modules/entitlements/entitlements.controller.js';
import { HealthController } from '../src/modules/health/health.controller.js';
import { LotsController } from '../src/modules/lots/lots.controller.js';
import { MetricsController } from '../src/modules/metrics/metrics.controller.js';
import { OpenapiController } from '../src/modules/openapi/openapi.controller.js';
import { StakeholdersController } from '../src/modules/stakeholders/stakeholders.controller.js';
import { TransfersController } from '../src/modules/transfers/transfers.controller.js';
import { IntegrationsController } from '../src/modules/integrations/integrations.controller.js';
import { EligibilityController } from '../src/modules/eligibility/eligibility.controller.js';
import { IS_PUBLIC_KEY } from '../src/modules/auth/public.decorator.js';
import type { PdsRole } from '../src/modules/auth/identity-provider.js';

type ControllerClass = { prototype: object };

const effectiveRoles = (controller: ControllerClass, method: string): PdsRole[] => {
  const prototype = controller.prototype as unknown as Record<string, object>;
  const handler = prototype[method];
  return (handler ? Reflect.getMetadata('roles', handler) : undefined) ?? Reflect.getMetadata('roles', controller) ?? [];
};

describe('canonical endpoint authorization policy', () => {
  it.each([
    [StakeholdersController, 'registerStakeholder', ['department']],
    [LotsController, 'createLot', ['fci']],
    [TransfersController, 'dispatch', ['fci', 'godown']],
    [TransfersController, 'receive', ['fci', 'godown']],
    [TransfersController, 'authorize', ['department']],
    [AllocationsController, 'allocate', ['department', 'block-office']],
    [AllocationsController, 'fpsReceipt', ['fps']],
    [AuthController, 'authOtp', ['fps']],
    [AuthController, 'authBiometric', ['fps']],
    [AuthController, 'authException', ['fps']],
    [DistributionsController, 'distribute', ['fps']],
    [EntitlementsController, 'create', ['department']],
    [EntitlementsController, 'validate', ['department', 'fps']],
    [AuditController, 'reconcile', ['auditor']],
    [AuditController, 'resolveAlert', ['auditor']],
    [AdminController, 'reset', ['demo-reset']],
    [MetricsController, 'scrape', ['metrics-reader', 'platform-admin']],
    [IntegrationsController, 'smartPds', ['integration-service']],
    [IntegrationsController, 'allocations', ['integration-service']],
    [IntegrationsController, 'movements', ['integration-service']],
    [IntegrationsController, 'distributions', ['integration-service']]
    ,[EligibilityController, 'screening', ['department']]
    ,[EligibilityController, 'notice', ['department']]
    ,[EligibilityController, 'verification', ['department']]
    ,[EligibilityController, 'recommendation', ['department']]
    ,[EligibilityController, 'decision', ['department']]
    ,[EligibilityController, 'appeal', ['department']]
    ,[EligibilityController, 'reinstate', ['department']]
    ,[EligibilityController, 'reset', ['demo-reset']]
  ] as const)('%s.%s has the exact least-privilege role set', (controller, method, expected) => {
    expect(effectiveRoles(controller, method)).toEqual(expected);
  });

  it.each([
    [AuthController, 'authTransactions', ['fps', 'department', 'auditor']],
    [EntitlementsController, 'entitlementList', ['fps', 'department', 'auditor']],
    [DistributionsController, 'distributions', ['fps', 'department', 'auditor', 'management']],
    [AdminController, 'overview', ['platform-admin']]
    ,[EligibilityController, 'summary', ['department', 'auditor', 'management']]
    ,[EligibilityController, 'cases', ['department', 'auditor', 'management']]
  ] as const)('%s.%s restricts sensitive or administrative reads', (controller, method, expected) => {
    expect(effectiveRoles(controller, method)).toEqual(expected);
  });

  it('marks only the public health/docs and OpenAPI controllers public', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, HealthController)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, OpenapiController)).toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, LotsController)).not.toBe(true);
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, AdminController)).not.toBe(true);
  });
});
