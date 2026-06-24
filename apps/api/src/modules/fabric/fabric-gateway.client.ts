import { TextDecoder } from 'node:util';
import type { LedgerEvent } from '@pds/shared-types';
import type { ChainQueryPort, LedgerVerification } from '../../infrastructure/chain-query-port.js';
import type { FabricRuntimeConfig } from '../config/fabric.config.js';
import { createFabricGatewayConnection, type FabricGatewayConnection } from './fabric-gateway.connection.js';
import type { FabricClient, FabricOperationName, FabricTransactionEnvelope } from './fabric-client.js';
import { toFabricTransactionEnvelope } from './fabric-client.js';

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

  submit(envelope: FabricTransactionEnvelope): { txId: string } {
    void this.submitAsync(envelope.operation, envelope.payload);
    return { txId: envelope.txId };
  }

  async submitAsync(operation: FabricOperationName, payload: Record<string, unknown>): Promise<unknown> {
    const { contract } = await this.getConnection();
    const resultBytes = await contract.submitTransaction(operation, JSON.stringify(payload));
    const resultJson = utf8Decoder.decode(resultBytes);
    return resultJson.length > 0 ? JSON.parse(resultJson) : null;
  }

  evaluate(operation: FabricOperationName, payload: Record<string, unknown>): unknown {
    return this.evaluateAsync(operation, payload);
  }

  async evaluateAsync(operation: FabricOperationName, payload: Record<string, unknown>): Promise<unknown> {
    const { contract } = await this.getConnection();
    const resultBytes = await contract.evaluateTransaction(operation, JSON.stringify(payload));
    const resultJson = utf8Decoder.decode(resultBytes);
    return resultJson.length > 0 ? JSON.parse(resultJson) : null;
  }

  submitLedgerEvent(event: LedgerEvent): { txId: string } {
    const envelope = toFabricTransactionEnvelope(event);
    return this.submit(envelope);
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
