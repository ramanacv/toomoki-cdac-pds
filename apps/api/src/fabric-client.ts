import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { LedgerEvent } from '@pds/shared-types';

export type FabricOperationName =
  | 'RegisterStakeholder'
  | 'CreateCommodityLot'
  | 'DispatchLot'
  | 'ReceiveLot'
  | 'AllocateToFPS'
  | 'RecordFPSReceipt'
  | 'RegisterBeneficiaryHash'
  | 'CreateMonthlyEntitlement'
  | 'RecordDistribution'
  | 'CheckDuplicateClaim'
  | 'RaiseAuditFlag'
  | 'ResolveAuditFlag'
  | 'GetLotHistory'
  | 'GetDistributionHistory'
  | 'GetCurrentStock'
  | 'VerifyDatabaseHash';

export type FabricTransactionEnvelope = {
  network: 'pds-chain-fabric-network';
  channel: string;
  chaincode: string;
  operation: FabricOperationName;
  entityType: LedgerEvent['entityType'];
  entityId: string;
  txId: string;
  payload: Record<string, unknown>;
  timestamp: string;
};

export interface FabricClient {
  submit(envelope: FabricTransactionEnvelope): { txId: string };
  evaluate(operation: FabricOperationName, payload: Record<string, unknown>): unknown;
}

export class LocalFabricClient implements FabricClient {
  readonly envelopePath: string;

  constructor(envelopePath = resolve(process.cwd(), '../../tmp/pds-fabric-client.ndjson')) {
    this.envelopePath = envelopePath;
  }

  submit(envelope: FabricTransactionEnvelope): { txId: string } {
    mkdirSync(dirname(this.envelopePath), { recursive: true });
    appendFileSync(this.envelopePath, `${JSON.stringify({ kind: 'submit', envelope })}\n`, 'utf8');
    return { txId: envelope.txId };
  }

  evaluate(operation: FabricOperationName, payload: Record<string, unknown>): unknown {
    mkdirSync(dirname(this.envelopePath), { recursive: true });
    appendFileSync(this.envelopePath, `${JSON.stringify({ kind: 'evaluate', operation, payload })}\n`, 'utf8');
    return { ok: true, operation, payload };
  }
}

export const toFabricTransactionEnvelope = (event: LedgerEvent): FabricTransactionEnvelope => {
  const operationByEventType: Record<LedgerEvent['eventType'], FabricOperationName> = {
    RegisterStakeholder: 'RegisterStakeholder',
    CreateCommodityLot: 'CreateCommodityLot',
    DispatchLot: 'DispatchLot',
    ReceiveLot: 'ReceiveLot',
    AllocateToFPS: 'AllocateToFPS',
    RecordFPSReceipt: 'RecordFPSReceipt',
    AuthTransaction: 'RegisterBeneficiaryHash',
    RecordDistribution: 'RecordDistribution',
    RaiseAuditFlag: 'RaiseAuditFlag',
    ResolveAuditFlag: 'ResolveAuditFlag'
  } as Record<LedgerEvent['eventType'], FabricOperationName>;

  return {
    network: 'pds-chain-fabric-network',
    channel: 'pdschannel',
    chaincode: 'pds-chaincode',
    operation: operationByEventType[event.eventType] ?? 'VerifyDatabaseHash',
    entityType: event.entityType,
    entityId: event.entityId,
    txId: `fabric-${randomUUID()}`,
    payload: event.payload,
    timestamp: event.timestamp
  };
};
