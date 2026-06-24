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
