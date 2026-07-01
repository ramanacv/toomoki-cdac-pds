import { Injectable } from '@nestjs/common';
import { dirname, resolve } from 'node:path';
import { PdsLedgerEngine } from '@pds/pds-chaincode';
import type { ChainQueryPort } from '../../infrastructure/chain-query-port.js';
import { FilePdsLedgerPort, type PdsLedgerPort } from '../../infrastructure/ledger-port.js';

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

/**
 * Async wrapper around the (sync) {@link PdsLedgerEngine} that persists every
 * mutation through {@link PdsLedgerPort}. The ledger port interface is async
 * (T2.2), so every mutating override returns a Promise and callers must await.
 * Bootstrap from persistence is async-only — construct with
 * `{ deferBootstrap: true }` then `await bootstrapFromPersistenceAsync()`.
 */
@Injectable()
export class PdsRuntime extends PdsLedgerEngine {
  private readonly port: PdsLedgerPort;
  private readonly chainQuery: ChainQueryPort | null;
  private readonly seedOnBootstrap: boolean;
  private persistedEventCount = 0;
  private bootstrapped = false;
  private pendingPersist: Promise<void> = Promise.resolve();

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
      throw new Error('PdsRuntime requires async bootstrap — pass { deferBootstrap: true } and await bootstrapFromPersistenceAsync()');
    }
  }

  async bootstrapFromPersistenceAsync(): Promise<void> {
    const persisted = await this.port.loadState();
    if (persisted) {
      this.restoreState(persisted);
      this.persistedEventCount = persisted.events.length;
      this.bootstrapped = true;
      return;
    }
    if (this.seedOnBootstrap) {
      this.seedDemoData();
      await this.persist();
    }
    this.bootstrapped = true;
  }

  protected assertBootstrapped(): void {
    if (!this.bootstrapped) {
      throw new Error('PdsRuntime is not initialized yet');
    }
  }

  override registerStakeholder(...args: Parameters<PdsLedgerEngine['registerStakeholder']>) {
    const result = super.registerStakeholder(...args);
    void this.persist();
    return result;
  }

  override createCommodityLot(...args: Parameters<PdsLedgerEngine['createCommodityLot']>) {
    const result = super.createCommodityLot(...args);
    void this.persist();
    return result;
  }

  override transformLot(...args: Parameters<PdsLedgerEngine['transformLot']>) {
    const result = super.transformLot(...args);
    void this.persist();
    return result;
  }

  override dispatchLot(...args: Parameters<PdsLedgerEngine['dispatchLot']>) {
    const result = super.dispatchLot(...args);
    void this.persist();
    return result;
  }

  override authorizeMovement(...args: Parameters<PdsLedgerEngine['authorizeMovement']>) {
    const result = super.authorizeMovement(...args);
    void this.persist();
    return result;
  }

  override receiveLot(...args: Parameters<PdsLedgerEngine['receiveLot']>) {
    const result = super.receiveLot(...args);
    void this.persist();
    return result;
  }

  override allocateToFps(...args: Parameters<PdsLedgerEngine['allocateToFps']>) {
    const result = super.allocateToFps(...args);
    void this.persist();
    return result;
  }

  override recordFpsReceipt(...args: Parameters<PdsLedgerEngine['recordFpsReceipt']>) {
    const result = super.recordFpsReceipt(...args);
    void this.persist();
    return result;
  }

  override simulateAuthentication(...args: Parameters<PdsLedgerEngine['simulateAuthentication']>) {
    const result = super.simulateAuthentication(...args);
    void this.persist();
    return result;
  }

  override createOrUpdateEntitlement(...args: Parameters<PdsLedgerEngine['createOrUpdateEntitlement']>) {
    const result = super.createOrUpdateEntitlement(...args);
    void this.persist();
    return result;
  }

  override recordDistribution(...args: Parameters<PdsLedgerEngine['recordDistribution']>) {
    const result = super.recordDistribution(...args);
    void this.persist();
    return result;
  }

  override reconcileAlerts(...args: Parameters<PdsLedgerEngine['reconcileAlerts']>) {
    const result = super.reconcileAlerts(...args);
    void this.persist();
    return result;
  }

  override resolveAuditAlert(...args: Parameters<PdsLedgerEngine['resolveAuditAlert']>) {
    const result = super.resolveAuditAlert(...args);
    void this.persist();
    return result;
  }

  override raiseAuditFlag(...args: Parameters<PdsLedgerEngine['raiseAuditFlag']>) {
    const result = super.raiseAuditFlag(...args);
    void this.persist();
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

  /**
   * Persist the current state + newly appended events. The engine mutation has
   * already happened in-memory; the async write is chained onto any in-flight
   * persist so writes are ordered. Callers that need to observe the persisted
   * file (e.g. tests) must `await runtime.flushPersist()`.
   */
  protected persist(): Promise<void> {
    const state = this.exportState();
    const newEvents = state.events.slice(this.persistedEventCount);
    this.persistedEventCount = state.events.length;
    this.pendingPersist = this.pendingPersist
      .catch(() => undefined)
      .then(() => this.port.saveState(state))
      .then(() => this.port.appendEvents(newEvents));
    return this.pendingPersist;
  }

  /** Await any in-flight persist so tests can assert on persisted files. */
  async flushPersist(): Promise<void> {
    await this.pendingPersist;
  }
}
