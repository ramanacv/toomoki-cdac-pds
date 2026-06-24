import { Injectable } from '@nestjs/common';
import { dirname, resolve } from 'node:path';
import { PdsLedgerEngine } from '@pds/pds-chaincode';
import type { ChainQueryPort } from '../../infrastructure/chain-query-port.js';
import { FilePdsLedgerPort, hasAsyncLedgerLoad, type PdsLedgerPort } from '../../infrastructure/ledger-port.js';

const asChainQueryPort = (port: PdsLedgerPort): ChainQueryPort | null => {
  const candidate = port as Partial<ChainQueryPort>;
  if (
    typeof candidate.getLotHistory === 'function' &&
    typeof candidate.getDistributionHistory === 'function' &&
    typeof candidate.verifyDatabaseHash === 'function'
  ) {
    return port as unknown as ChainQueryPort;
  }
  return null;
};

@Injectable()
export class PdsRuntime extends PdsLedgerEngine {
  private readonly port: PdsLedgerPort;
  private readonly chainQuery: ChainQueryPort | null;
  private readonly seedOnBootstrap: boolean;
  private persistedEventCount = 0;
  private bootstrapped = false;

  constructor(
    seed = true,
    portOrStatePath: PdsLedgerPort | string = new FilePdsLedgerPort(),
    options?: { deferBootstrap?: boolean }
  ) {
    super(false);
    this.seedOnBootstrap = seed;
    this.port =
      typeof portOrStatePath === 'string'
        ? new FilePdsLedgerPort(
            resolve(portOrStatePath),
            resolve(dirname(portOrStatePath), 'pds-ledger.ndjson')
          )
        : portOrStatePath;
    this.chainQuery = typeof portOrStatePath === 'string' ? null : asChainQueryPort(this.port);
    if (!options?.deferBootstrap) {
      this.bootstrapFromPersistence();
    }
  }

  protected bootstrapFromPersistence(): void {
    const persisted = this.port.loadState();
    this.applyPersistedState(persisted);
    this.bootstrapped = true;
  }

  async bootstrapFromPersistenceAsync(): Promise<void> {
    const persisted = hasAsyncLedgerLoad(this.port)
      ? await this.port.loadStateAsync()
      : this.port.loadState();
    this.applyPersistedState(persisted);
    this.bootstrapped = true;
  }

  private applyPersistedState(persisted: ReturnType<PdsLedgerPort['loadState']>): void {
    if (persisted) {
      this.restoreState(persisted);
      this.persistedEventCount = persisted.events.length;
      return;
    }

    if (this.seedOnBootstrap) {
      this.seedDemoData();
      this.persist();
    }
  }

  protected assertBootstrapped(): void {
    if (!this.bootstrapped) {
      throw new Error('PdsRuntime is not initialized yet');
    }
  }

  override registerStakeholder(...args: Parameters<PdsLedgerEngine['registerStakeholder']>) {
    const result = super.registerStakeholder(...args);
    this.persist();
    return result;
  }

  override createCommodityLot(...args: Parameters<PdsLedgerEngine['createCommodityLot']>) {
    const result = super.createCommodityLot(...args);
    this.persist();
    return result;
  }

  override dispatchLot(...args: Parameters<PdsLedgerEngine['dispatchLot']>) {
    const result = super.dispatchLot(...args);
    this.persist();
    return result;
  }

  override receiveLot(...args: Parameters<PdsLedgerEngine['receiveLot']>) {
    const result = super.receiveLot(...args);
    this.persist();
    return result;
  }

  override allocateToFps(...args: Parameters<PdsLedgerEngine['allocateToFps']>) {
    const result = super.allocateToFps(...args);
    this.persist();
    return result;
  }

  override recordFpsReceipt(...args: Parameters<PdsLedgerEngine['recordFpsReceipt']>) {
    const result = super.recordFpsReceipt(...args);
    this.persist();
    return result;
  }

  override simulateAuthentication(...args: Parameters<PdsLedgerEngine['simulateAuthentication']>) {
    const result = super.simulateAuthentication(...args);
    this.persist();
    return result;
  }

  override createOrUpdateEntitlement(...args: Parameters<PdsLedgerEngine['createOrUpdateEntitlement']>) {
    const result = super.createOrUpdateEntitlement(...args);
    this.persist();
    return result;
  }

  override recordDistribution(...args: Parameters<PdsLedgerEngine['recordDistribution']>) {
    const result = super.recordDistribution(...args);
    this.persist();
    return result;
  }

  override reconcileAlerts(...args: Parameters<PdsLedgerEngine['reconcileAlerts']>) {
    const result = super.reconcileAlerts(...args);
    this.persist();
    return result;
  }

  override resolveAuditAlert(...args: Parameters<PdsLedgerEngine['resolveAuditAlert']>) {
    const result = super.resolveAuditAlert(...args);
    this.persist();
    return result;
  }

  override getLotHistory(lotId: string) {
    return this.chainQuery?.getLotHistory(lotId) ?? super.getLotHistory(lotId);
  }

  override getTraceForLot(lotId: string) {
    const trace = super.getTraceForLot(lotId);
    if (!this.chainQuery) {
      return trace;
    }
    return {
      ...trace,
      history: this.chainQuery.getLotHistory(lotId),
      verificationSource: 'chaincode'
    };
  }

  getDistributionHistoryFromChain(distributionId: string) {
    return this.chainQuery?.getDistributionHistory(distributionId) ?? this.getDistributionHistory(distributionId);
  }

  verifyLedgerDigest(digest: string) {
    return this.chainQuery?.verifyDatabaseHash(digest) ?? { match: false, ledgerDigest: '' };
  }

  private persist(): void {
    const state = this.exportState();
    this.port.saveState(state);
    const newEvents = state.events.slice(this.persistedEventCount);
    this.port.appendEvents(newEvents);
    this.persistedEventCount = state.events.length;
  }
}
