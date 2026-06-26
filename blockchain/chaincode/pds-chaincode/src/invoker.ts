import { randomUUID } from 'node:crypto';
import { mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LedgerEvent, Stakeholder } from '@pds/shared-types';
import { PdsLedgerEngine, type PdsLedgerState } from './index.js';
import { type ChaincodeOperation, isChaincodeQuery } from './operations.js';

export type ChaincodeSubmitResult = {
  txId: string;
  result: unknown;
};

const WORLD_STATE_KEY = 'pds.state';

/**
 * Synchronous process-level file lock used to serialize the demo invoker's
 * read-modify-write on the world-state file (T1.6). Without this, concurrent
 * invocations can read the same state, both apply their write, and the second
 * persist clobbers the first — losing updates.
 *
 * The lock is acquired by atomically creating `<statePath>.lock` with O_EXCL.
 * If creation fails because the lock is held, we back off and retry until the
 * hold max is reached. The lock is released by unlinking the file. A stale
 * lock (left over from a crashed process) is reclaimed after `STALE_MS`.
 *
 * This guards a single demo host; it is NOT the deeper per-entity-key world
 * state split (deferred to T5.7).
 */
const LOCK_STALE_MS = 30_000;
const LOCK_POLL_MS = 5;
const LOCK_TOTAL_TIMEOUT_MS = 10_000;

const lockPathFor = (statePath: string): string => `${statePath}.lock`;

/** Synchronous sleep using a shared Int32Array + Atomics.wait (no Node timers). */
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
const sleepSync = (ms: number): void => {
  Atomics.wait(waitBuffer, 0, 0, ms);
};

const acquireLock = (statePath: string): string => {
  const lockPath = lockPathFor(statePath);
  mkdirSync(dirname(lockPath), { recursive: true });
  const started = Date.now();
  while (true) {
    try {
      const handle = openSync(lockPath, 'wx');
      writeFileSync(handle, `${process.pid}\n`);
      return lockPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        throw error;
      }
      // Reclaim stale locks left by a crashed process.
      let mtimeMs = 0;
      try {
        mtimeMs = statSync(lockPath).mtimeMs;
      } catch {
        mtimeMs = 0;
      }
      if (Date.now() - mtimeMs > LOCK_STALE_MS) {
        try {
          unlinkSync(lockPath);
        } catch {
          // another process may have just released it; loop and retry
        }
      }
    }
    if (Date.now() - started > LOCK_TOTAL_TIMEOUT_MS) {
      throw new Error(`Timed out waiting for chaincode state lock: ${lockPath}`);
    }
    sleepSync(LOCK_POLL_MS);
  }
};

const releaseLock = (lockPath: string): void => {
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
};

const withLock = <T>(statePath: string, fn: () => T): T => {
  const lockPath = acquireLock(statePath);
  try {
    return fn();
  } finally {
    releaseLock(lockPath);
  }
};

export const loadWorldState = (statePath: string): PdsLedgerState | null => {
  try {
    const raw = readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw) as { key?: string; state?: PdsLedgerState };
    if (parsed.key === WORLD_STATE_KEY && parsed.state) {
      return parsed.state;
    }
    return parsed as PdsLedgerState;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

export const saveWorldState = (statePath: string, state: PdsLedgerState): void => {
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify({ key: WORLD_STATE_KEY, state }, null, 2)}\n`, 'utf8');
};

export class PdsChaincodeInvoker {
  constructor(private readonly statePath: string) {}

  private loadEngine(): PdsLedgerEngine {
    const engine = new PdsLedgerEngine(false);
    const state = loadWorldState(this.statePath);
    if (state) {
      engine.restoreState(state);
    }
    return engine;
  }

  private persist(engine: PdsLedgerEngine): void {
    saveWorldState(this.statePath, engine.exportState());
  }

  submit(operation: ChaincodeOperation, payload: Record<string, unknown>): ChaincodeSubmitResult {
    if (isChaincodeQuery(operation)) {
      throw new Error(`${operation} is a query operation`);
    }

    return withLock(this.statePath, () => {
      const engine = this.loadEngine();
      const result = this.dispatchWrite(engine, operation, payload);
      this.persist(engine);
      return {
        txId: this.extractTxId(result, payload),
        result
      };
    });
  }

  submitLedgerEvent(event: LedgerEvent): ChaincodeSubmitResult {
    return withLock(this.statePath, () => {
      const engine = this.loadEngine();
      const result = engine.applyLedgerEvent(event);
      this.persist(engine);
      return { txId: result.ledgerTxId, result };
    });
  }

  evaluate(operation: ChaincodeOperation, payload: Record<string, unknown> = {}): unknown {
    // Reads take the lock too, so they never observe a half-written state file.
    return withLock(this.statePath, () => {
      const engine = this.loadEngine();
      return this.dispatchRead(engine, operation, payload);
    });
  }

  private dispatchWrite(engine: PdsLedgerEngine, operation: ChaincodeOperation, payload: Record<string, unknown>): unknown {
    switch (operation) {
      case 'RegisterStakeholder':
        return engine.registerStakeholder(payload as unknown as Stakeholder);
      case 'CreateCommodityLot':
        return engine.createCommodityLot(payload as Parameters<PdsLedgerEngine['createCommodityLot']>[0]);
      case 'DispatchLot':
        return engine.dispatchLot(payload as Parameters<PdsLedgerEngine['dispatchLot']>[0]);
      case 'ReceiveLot':
        return engine.receiveLot(payload as Parameters<PdsLedgerEngine['receiveLot']>[0]);
      case 'AllocateToFPS':
        return engine.allocateToFps(payload as Parameters<PdsLedgerEngine['allocateToFps']>[0]);
      case 'RecordFPSReceipt':
        return engine.recordFpsReceipt(payload as Parameters<PdsLedgerEngine['recordFpsReceipt']>[0]);
      case 'RegisterBeneficiaryHash':
        return engine.simulateAuthentication(payload as Parameters<PdsLedgerEngine['simulateAuthentication']>[0]);
      case 'CreateMonthlyEntitlement':
        return engine.createOrUpdateEntitlement(payload as Parameters<PdsLedgerEngine['createOrUpdateEntitlement']>[0]);
      case 'RecordDistribution':
        return engine.recordDistribution(payload as Parameters<PdsLedgerEngine['recordDistribution']>[0]);
      case 'RaiseAuditFlag':
        return engine.raiseAuditFlag(payload as Parameters<PdsLedgerEngine['raiseAuditFlag']>[0]);
      case 'ResolveAuditFlag':
        return engine.resolveAuditAlert(payload as Parameters<PdsLedgerEngine['resolveAuditAlert']>[0]);
      case 'RecordLedgerProof':
        return engine.applyLedgerEvent(payload as unknown as LedgerEvent);
      case 'IssueRationCard':
        return engine.issueRationCard(payload as Parameters<PdsLedgerEngine['issueRationCard']>[0]);
      case 'ActivateRationCard':
        return engine.activateRationCard(payload as Parameters<PdsLedgerEngine['activateRationCard']>[0]);
      case 'SuspendRationCard':
        return engine.suspendRationCard(payload as Parameters<PdsLedgerEngine['suspendRationCard']>[0]);
      case 'TransferRationCard':
        return engine.transferRationCard(payload as Parameters<PdsLedgerEngine['transferRationCard']>[0]);
      case 'FileGrievance':
        return engine.fileGrievance(payload as Parameters<PdsLedgerEngine['fileGrievance']>[0]);
      case 'AcknowledgeGrievance':
        return engine.acknowledgeGrievance(payload as Parameters<PdsLedgerEngine['acknowledgeGrievance']>[0]);
      case 'ResolveGrievance':
        return engine.resolveGrievance(payload as Parameters<PdsLedgerEngine['resolveGrievance']>[0]);
      case 'EscalateOverdueGrievances':
        return engine.escalateOverdueGrievances(payload as Parameters<PdsLedgerEngine['escalateOverdueGrievances']>[0]);
      case 'ProposeEntitlementRule':
        return engine.proposeEntitlementRule(payload as Parameters<PdsLedgerEngine['proposeEntitlementRule']>[0]);
      case 'ApproveEntitlementRule':
        return engine.approveEntitlementRule(payload as Parameters<PdsLedgerEngine['approveEntitlementRule']>[0]);
      case 'RolloverUnclaimedQuota':
        return engine.rolloverUnclaimedQuota(payload as Parameters<PdsLedgerEngine['rolloverUnclaimedQuota']>[0]);
      default:
        throw new Error(`Unsupported write operation: ${operation}`);
    }
  }

  private dispatchRead(engine: PdsLedgerEngine, operation: ChaincodeOperation, payload: Record<string, unknown>): unknown {
    switch (operation) {
      case 'GetLotHistory':
        return engine.getLotHistory(String(payload.lotId ?? ''));
      case 'GetDistributionHistory':
        return engine.getDistributionHistory(String(payload.distributionId ?? ''));
      case 'GetCurrentStock':
        return engine.exportState().stock;
      case 'VerifyDatabaseHash':
        return engine.verifyDatabaseHash(payload as { digest: string });
      case 'CheckDuplicateClaim':
        return engine.checkDuplicateClaim(
          payload as {
            rationCardHash: string;
            commodity: string;
            month: string;
            requestedQtyKg: number;
          }
        );
      case 'GetRationCardHistory':
        return engine.getRationCardHistory(String(payload.rationCardHash ?? ''));
      case 'GetActiveEntitlementRules':
        return engine.getActiveEntitlementRules();
      case 'GetDistributionsByFPS':
        return engine.exportState().distributions.filter((d) => d.fpsId === String(payload.fpsId ?? ''));
      case 'GetStakeholdersByType':
        return engine.exportState().stakeholders.filter((s) => s.stakeholderType === String(payload.type ?? ''));
      case 'GetEntityHistory':
        // Not available in mock mode — return empty array to allow graceful degradation.
        return [];
      default:
        throw new Error(`Unsupported query operation: ${operation}`);
    }
  }

  private extractTxId(result: unknown, payload: Record<string, unknown>): string {
    if (typeof result === 'object' && result && 'ledgerTxId' in result) {
      return String((result as { ledgerTxId: string }).ledgerTxId);
    }
    if (typeof payload.ledgerTxId === 'string') {
      return payload.ledgerTxId;
    }
    return `TX-${randomUUID()}`;
  }
}
