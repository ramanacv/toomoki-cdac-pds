import { Injectable } from '@nestjs/common';
import { dirname, resolve } from 'node:path';
import { PdsLedgerEngine } from '@pds/pds-chaincode';
import { createLedgerPortFromEnv } from './ledger-port-factory.js';
import { FilePdsLedgerPort, type PdsLedgerPort } from './ledger-port.js';

@Injectable()
export class PdsRuntime extends PdsLedgerEngine {
  private readonly port: PdsLedgerPort;
  private persistedEventCount = 0;

  constructor(seed = true, portOrStatePath: PdsLedgerPort | string = createLedgerPortFromEnv()) {
    super(false);
    this.port =
      typeof portOrStatePath === 'string'
        ? new FilePdsLedgerPort(
            resolve(portOrStatePath),
            resolve(dirname(portOrStatePath), 'pds-ledger.ndjson')
          )
        : portOrStatePath;
    const persisted = this.port.loadState();
    if (persisted) {
      this.restoreState(persisted);
      this.persistedEventCount = persisted.events.length;
    } else if (seed) {
      this.seedDemoData();
      this.persist();
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

  private persist(): void {
    const state = this.exportState();
    this.port.saveState(state);
    const newEvents = state.events.slice(this.persistedEventCount);
    this.port.appendEvents(newEvents);
    this.persistedEventCount = state.events.length;
  }
}
