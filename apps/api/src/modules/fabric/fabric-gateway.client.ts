import { TextDecoder } from 'node:util';
import type { LedgerEvent } from '@pds/shared-types';
import type { ChainQueryPort, LedgerVerification } from '../../infrastructure/chain-query-port.js';
import type { FabricRuntimeConfig } from '../config/fabric.config.js';
import { createFabricGatewayConnection, type FabricGatewayConnection } from './fabric-gateway.connection.js';
import type { FabricClient, FabricOperationName, FabricTransactionEnvelope } from './fabric-client.js';
import { toFabricTransactionEnvelope } from './fabric-client.js';
import { ledgerProofFromEvent } from './ledger-proof.js';

const utf8Decoder = new TextDecoder();

export class FabricGatewayClient implements FabricClient, ChainQueryPort {
  private connection: FabricGatewayConnection | null = null;
  private connectionPromise: Promise<FabricGatewayConnection> | null = null;

  constructor(private readonly config: FabricRuntimeConfig) {}

  private async getConnection(): Promise<FabricGatewayConnection> {
    if (this.connection) {
      return this.connection;
    }
    if (!this.connectionPromise) {
      this.connectionPromise = createFabricGatewayConnection(this.config);
    }
    this.connection = await this.connectionPromise;
    return this.connection;
  }

  private contractNameFor(operation: FabricOperationName): 'PdsControlContract' | 'PdsDataContract' {
    const controlOperations = new Set<FabricOperationName>([
      'RegisterStakeholder'
    ]);
    return controlOperations.has(operation) ? 'PdsControlContract' : 'PdsDataContract';
  }

  private async getContract(operation: FabricOperationName) {
    const { gateway } = await this.getConnection();
    return gateway.getNetwork(this.config.channel).getContract(this.config.chaincode, this.contractNameFor(operation));
  }

  /**
   * Submit a transaction and await commit/ordering confirmation (T2.3). The
   * previous implementation fired-and-forgot `submitAsync` and returned a fake
   * txId, reporting success before the ordering service committed — masking
   * commit failures. This now surfaces commit errors to the caller.
   */
  async submit(envelope: FabricTransactionEnvelope): Promise<{ txId: string; result?: unknown }> {
    return this.submitWithTxId(envelope.operation, envelope.payload);
  }

  private async submitWithTxId(operation: FabricOperationName, payload: Record<string, unknown>): Promise<{ txId: string; result?: unknown }> {
    const contract = await this.getContract(operation);
    const options = {
      arguments: [JSON.stringify(payload)],
      ...(this.config.endorsingOrgs.length > 0 ? { endorsingOrganizations: this.config.endorsingOrgs } : {})
    };
    const proposal = contract.newProposal(operation, options);
    const transaction = await proposal.endorse();
    const txId = transaction.getTransactionId();
    const resultJson = utf8Decoder.decode(transaction.getResult());
    const commit = await transaction.submit();
    const status = await commit.getStatus();
    if (!status.successful) throw new Error(`Fabric transaction ${txId} failed validation with code ${status.code}`);
    return { txId, result: resultJson.length > 0 ? JSON.parse(resultJson) : null };
  }

  async submitAsync(operation: FabricOperationName, payload: Record<string, unknown>): Promise<unknown> {
    const contract = await this.getContract(operation);
    const options = {
      arguments: [JSON.stringify(payload)],
      ...(this.config.endorsingOrgs.length > 0 ? { endorsingOrganizations: this.config.endorsingOrgs } : {})
    };
    const resultBytes = await contract.submit(operation, options);
    const resultJson = utf8Decoder.decode(resultBytes);
    return resultJson.length > 0 ? JSON.parse(resultJson) : null;
  }

  evaluate(operation: FabricOperationName, payload: Record<string, unknown>): unknown {
    return this.evaluateAsync(operation, payload);
  }

  async evaluateAsync(operation: FabricOperationName, payload: Record<string, unknown>): Promise<unknown> {
    const contract = await this.getContract(operation);
    const resultBytes = await contract.evaluate(operation, {
      arguments: [JSON.stringify(payload)]
    });
    const resultJson = utf8Decoder.decode(resultBytes);
    return resultJson.length > 0 ? JSON.parse(resultJson) : null;
  }

  submitLedgerEvent(event: LedgerEvent): { txId: string } {
    const envelope = toFabricTransactionEnvelope(event);
    void this.submit(envelope);
    return { txId: envelope.txId };
  }

  /** Awaited variant used by {@link FabricGatewayLedgerPort.appendEvents} (T2.3). */
  async submitLedgerEventAsync(event: LedgerEvent): Promise<{ txId: string; result?: unknown }> {
    const proof = ledgerProofFromEvent(event, {
      subject: 'pds-api',
      applicationRole: 'SYSTEM',
      submittingOrganization: this.config.mspId
    });
    return this.submitWithTxId('RecordLedgerProof', proof as unknown as Record<string, unknown>);
  }

  getLotHistory(lotId: string): LedgerEvent[] {
    return this.getLotHistoryAsync(lotId) as unknown as LedgerEvent[];
  }

  async getLotHistoryAsync(lotId: string): Promise<LedgerEvent[]> {
    return (await this.evaluateAsync('GetLotHistory', { lotId })) as LedgerEvent[];
  }

  getDistributionHistory(distributionId: string): LedgerEvent[] {
    return this.getDistributionHistoryAsync(distributionId) as unknown as LedgerEvent[];
  }

  async getDistributionHistoryAsync(distributionId: string): Promise<LedgerEvent[]> {
    return (await this.evaluateAsync('GetDistributionHistory', { distributionId })) as LedgerEvent[];
  }

  verifyDatabaseHash(digest: string): LedgerVerification {
    return this.verifyDatabaseHashAsync(digest) as unknown as LedgerVerification;
  }

  async verifyDatabaseHashAsync(digest: string): Promise<LedgerVerification> {
    return (await this.evaluateAsync('VerifyDatabaseHash', { digest })) as LedgerVerification;
  }

  async close(): Promise<void> {
    if (this.connection) {
      this.connection.close();
      this.connection = null;
    }
  }
}
