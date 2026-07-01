import type { LedgerEvent } from '@pds/shared-types';

export type LedgerVerification = {
  match: boolean;
  ledgerDigest: string;
};

export interface ChainQueryPort {
  getLotHistory(lotId: string): LedgerEvent[];
  getDistributionHistory(distributionId: string): LedgerEvent[];
  verifyDatabaseHash(digest: string): LedgerVerification;
}

/**
 * Sink for ledger-event submission to the chaincode runtime. Implemented by
 * `FabricChaincodeClient` in `modules/fabric`; infrastructure depends only on
 * this abstraction so the infra ↔ modules/fabric dependency stays one-way
 * (modules/fabric → infrastructure), breaking the prior cycle (T5.1).
 */
export interface ChaincodeEventSink extends ChainQueryPort {
  submitLedgerEvent(event: LedgerEvent): { txId: string };
}
