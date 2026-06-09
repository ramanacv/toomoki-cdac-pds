import { resolve } from 'node:path';
import type { LedgerEvent } from '@pds/shared-types';
import { PdsChaincodeInvoker } from '@pds/pds-chaincode';
import type { ChaincodeOperation } from '@pds/pds-chaincode';
import type { FabricClient, FabricOperationName, FabricTransactionEnvelope } from './fabric-client.js';
import type { ChainQueryPort, LedgerVerification } from './chain-query-port.js';

export class FabricChaincodeClient implements FabricClient, ChainQueryPort {
  private readonly invoker: PdsChaincodeInvoker;

  constructor(statePath = resolve(process.cwd(), '../../tmp/chaincode-world-state.json')) {
    this.invoker = new PdsChaincodeInvoker(statePath);
  }

  submit(envelope: FabricTransactionEnvelope): { txId: string } {
    const result = this.invoker.submit(envelope.operation as ChaincodeOperation, envelope.payload);
    return { txId: result.txId };
  }

  submitLedgerEvent(event: LedgerEvent): { txId: string } {
    return this.invoker.submitLedgerEvent(event);
  }

  evaluate(operation: FabricOperationName, payload: Record<string, unknown>): unknown {
    return this.invoker.evaluate(operation as ChaincodeOperation, payload);
  }

  getLotHistory(lotId: string): LedgerEvent[] {
    return this.invoker.evaluate('GetLotHistory', { lotId }) as LedgerEvent[];
  }

  getDistributionHistory(distributionId: string): LedgerEvent[] {
    return this.invoker.evaluate('GetDistributionHistory', { distributionId }) as LedgerEvent[];
  }

  verifyDatabaseHash(digest: string): LedgerVerification {
    return this.invoker.evaluate('VerifyDatabaseHash', { digest }) as LedgerVerification;
  }
}
