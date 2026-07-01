import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { AuthResult, StakeholderStatus, StakeholderType } from '@pds/shared-types';
import { AllocationDto } from '../src/modules/allocations/dto/allocation.dto.js';
import { AuthOtpDto, SupervisorExceptionAuthDto } from '../src/modules/auth/dto/auth.dto.js';
import { DistributionDto } from '../src/modules/distributions/dto/distribution.dto.js';
import { EntitlementValidateDto } from '../src/modules/entitlements/dto/entitlement.dto.js';
import { LotCreateDto } from '../src/modules/lots/dto/lot.dto.js';
import { ResolveAuditAlertDto } from '../src/modules/audit/dto/resolve-audit-alert.dto.js';
import { StakeholderCreateDto } from '../src/modules/stakeholders/dto/stakeholder.dto.js';
import { DispatchDto, TransferReceiveDto } from '../src/modules/transfers/dto/transfer.dto.js';
import { VerifyLedgerDto } from '../src/modules/trace/dto/verify-ledger.dto.js';

const expectValid = (dto: object): void => {
  expect(validateSync(dto)).toHaveLength(0);
};

const expectInvalid = (dto: object): void => {
  expect(validateSync(dto).length).toBeGreaterThan(0);
};

describe('module DTO validation', () => {
  it('validates stakeholder create payloads', () => {
    expectValid(
      plainToInstance(StakeholderCreateDto, {
        stakeholderId: 'STK-001',
        stakeholderType: StakeholderType.DEPARTMENT,
        name: 'Demo',
        district: 'Demo',
        licenseNo: 'LIC-001',
        status: StakeholderStatus.ACTIVE
      })
    );

    expectInvalid(
      plainToInstance(StakeholderCreateDto, {
        stakeholderId: '',
        stakeholderType: 'INVALID',
        name: '',
        district: '',
        licenseNo: '',
        status: 'UNKNOWN'
      })
    );
  });

  it('validates lot create payloads', () => {
    expectValid(
      plainToInstance(LotCreateDto, {
        lotId: 'LOT-001',
        commodity: 'Rice',
        season: 'Kharif 2026',
        quantityKg: 100,
        qualityGrade: 'A',
        source: 'Source',
        currentOwner: 'PROC-001',
        currentLocation: 'Yard'
      })
    );

    expectInvalid(
      plainToInstance(LotCreateDto, {
        lotId: 'LOT-001',
        commodity: 'Rice',
        season: 'Kharif 2026',
        quantityKg: 0,
        qualityGrade: 'A',
        source: 'Source',
        currentOwner: 'PROC-001',
        currentLocation: 'Yard'
      })
    );
  });

  it('validates transfer dispatch and receive payloads', () => {
    expectValid(
      plainToInstance(DispatchDto, {
        transferId: 'TR-001',
        lotId: 'LOT-001',
        fromOrg: 'PROC-001',
        toOrg: 'MLL-001',
        dispatchedQtyKg: 50,
        vehicleNo: 'KA01AB0001'
      })
    );

    expectInvalid(
      plainToInstance(TransferReceiveDto, {
        receivedQtyKg: 0
      })
    );
  });

  it('validates allocation payloads', () => {
    expectValid(
      plainToInstance(AllocationDto, {
        allocationId: 'ALLOC-001',
        fpsId: 'FPS-101',
        commodity: 'Rice',
        allocatedQtyKg: 25,
        month: '2026-06',
        sourceGodownId: 'GODOWN-B-001'
      })
    );
  });

  it('validates auth payloads', () => {
    expectValid(
      plainToInstance(AuthOtpDto, {
        authTxnId: 'AUTH-001',
        beneficiaryRefHash: 'hash',
        rationCardHash: 'card-hash',
        authResult: AuthResult.SUCCESS
      })
    );

    expectInvalid(
      plainToInstance(SupervisorExceptionAuthDto, {
        authTxnId: 'AUTH-001',
        beneficiaryRefHash: 'hash',
        rationCardHash: 'card-hash',
        authResult: AuthResult.SUCCESS
      })
    );
  });

  it('validates entitlement and distribution payloads', () => {
    expectValid(
      plainToInstance(EntitlementValidateDto, {
        rationCardHash: 'card-hash',
        commodity: 'Rice',
        month: '2026-06',
        requestedQtyKg: 5
      })
    );

    expectInvalid(
      plainToInstance(DistributionDto, {
        distributionId: 'DIST-001',
        fpsId: 'FPS-101',
        rationCardHash: 'card-hash',
        beneficiaryRefHash: 'hash',
        commodity: 'Rice',
        deliveredKg: 0,
        authMode: 'INVALID',
        authResult: 'INVALID',
        authTxnRefHash: 'ref',
        dealerId: 'DEALER-001'
      })
    );
  });

  it('validates audit-alert resolve payload (T5.3)', () => {
    expectValid(
      plainToInstance(ResolveAuditAlertDto, {
        resolvedBy: 'AUDIT-001',
        resolutionNote: 'Verified against miller invoice.'
      })
    );
    expectValid(plainToInstance(ResolveAuditAlertDto, { resolvedBy: 'AUDIT-001' }));

    expectInvalid(plainToInstance(ResolveAuditAlertDto, { resolvedBy: '' }));
    expectInvalid(plainToInstance(ResolveAuditAlertDto, { resolvedBy: '   ' }));
    expectInvalid(
      plainToInstance(ResolveAuditAlertDto, {
        resolvedBy: 'X',
        resolutionNote: 'x'.repeat(2000)
      })
    );
  });

  it('validates trace verify payload (T5.3)', () => {
    expectValid(plainToInstance(VerifyLedgerDto, { digest: 'deadbeef' }));
    expectValid(
      plainToInstance(VerifyLedgerDto, {
        digest: 'a'.repeat(64)
      })
    );

    expectInvalid(plainToInstance(VerifyLedgerDto, { digest: '' }));
    expectInvalid(plainToInstance(VerifyLedgerDto, { digest: 'not-hex!!' }));
    expectInvalid(plainToInstance(VerifyLedgerDto, { digest: 'xyz' }));
  });
});
