import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { LedgerEvent, Stakeholder } from '@pds/shared-types';
import { PdsLedgerEngine, type PdsLedgerState } from './index.js';
import { type ChaincodeOperation, isChaincodeQuery } from './operations.js';

export type ChaincodeSubmitResult = {
  txId: string;
  result: unknown;
};

const WORLD_STATE_KEY = 'pds.state';

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

    const engine = this.loadEngine();
    const result = this.dispatchWrite(engine, operation, payload);
    this.persist(engine);
    return {
      txId: this.extractTxId(result, payload),
      result
    };
  }

  submitLedgerEvent(event: LedgerEvent): ChaincodeSubmitResult {
    const engine = this.loadEngine();
    const result = engine.applyLedgerEvent(event);
    this.persist(engine);
    return { txId: result.ledgerTxId, result };
  }

  evaluate(operation: ChaincodeOperation, payload: Record<string, unknown> = {}): unknown {
    const engine = this.loadEngine();
    return this.dispatchRead(engine, operation, payload);
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
