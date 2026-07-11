/**
 * Shared infrastructure for PdsControlContract and PdsDataContract.
 *
 * All helpers here are pure functions or constants — no class state, no
 * inheritance required. Both contract classes import from this module so
 * per-collection state I/O, engine construction, identity resolution, and
 * timestamp extraction are defined exactly once.
 */

import { Context } from 'fabric-contract-api';
import { PdsLedgerEngine, type PdsLedgerState } from './index.js';
import type { ClientIdentity } from './authorization.js';
import type {
  Stakeholder,
  CommodityLot,
  TransferOrder,
  FPSAllocation,
  MonthlyEntitlement,
  AuthTransaction,
  DistributionTransaction,
  AuditAlert,
  RationCard,
  Grievance,
  EntitlementRule,
} from '@pds/shared-types';

// ── Per-collection state keys ────────────────────────────────────────────────
// Replaces the former single pds.state blob (Tier 2).
// Each operation loads and saves only the 2–5 collections it touches.

export const PREFIXES = {
  stakeholders: 'stakeholder',
  lots: 'lot',
  transfers: 'transfer',
  allocations: 'allocation',
  entitlements: 'entitlement',
  authTransactions: 'auth',
  distributions: 'distribution',
  alerts: 'alert',
  events: 'event',
  stock: 'stock',
  rationCards: 'rationcard',
  grievances: 'grievance',
  entitlementRules: 'entitlementrule'
} as const;

export type CollectionKey = keyof typeof PREFIXES;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getEntityCompositeKey = (ctx: Context, collection: CollectionKey, item: any): string => {
  const prefix = PREFIXES[collection];
  if (collection === 'stock') {
    const [stockKey] = item as [string, number];
    const [org, commodity] = stockKey.split(':');
    return ctx.stub.createCompositeKey(prefix, [org!, commodity!]);
  }
  if (collection === 'entitlements') {
    return ctx.stub.createCompositeKey(prefix, [item.rationCardHash, item.commodity, item.month]);
  }

  const idFields: Record<CollectionKey, string> = {
    stakeholders: 'stakeholderId',
    lots: 'lotId',
    transfers: 'transferId',
    allocations: 'allocationId',
    entitlements: '',
    authTransactions: 'authTxnId',
    distributions: 'distributionId',
    alerts: 'alertId',
    events: 'ledgerTxId',
    stock: '',
    rationCards: 'rationCardHash',
    grievances: 'grievanceId',
    entitlementRules: 'ruleId'
  };
  const idField = idFields[collection];
  return ctx.stub.createCompositeKey(prefix, [String((item as Record<string, unknown>)[idField])]);
};

export const loadCollection = async <T>(ctx: Context, key: CollectionKey): Promise<T[]> => {
  const prefix = PREFIXES[key];
  const iterator = await ctx.stub.getStateByPartialCompositeKey(prefix, []);
  const results: T[] = [];
  try {
    while (true) {
      const res = await iterator.next();
      if (res.done) {
        break;
      }
      if (res.value && res.value.value) {
        const valStr = Buffer.from(res.value.value).toString('utf8');
        if (key === 'stock') {
          const parsedKey = ctx.stub.splitCompositeKey(res.value.key);
          const org = parsedKey.attributes[0];
          const commodity = parsedKey.attributes[1];
          const qty = Number(valStr);
          results.push([`${org}:${commodity}`, qty] as unknown as T);
        } else {
          results.push(JSON.parse(valStr) as T);
        }
      }
    }
  } finally {
    await iterator.close();
  }
  return results;
};

export const saveCollection = async <T>(ctx: Context, key: CollectionKey, data: T[]): Promise<void> => {
  const prefix = PREFIXES[key];
  for (const item of data) {
    const compositeKey = getEntityCompositeKey(ctx, key, item);
    let valueStr: string;
    if (key === 'stock') {
      const [, qty] = item as unknown as [string, number];
      valueStr = String(qty);
    } else {
      valueStr = JSON.stringify({ ...item, docType: prefix });
    }
    await ctx.stub.putState(compositeKey, Buffer.from(valueStr));
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const queryState = async <T>(ctx: Context, query: Record<string, any>): Promise<T[]> => {
  const iterator = await ctx.stub.getQueryResult(JSON.stringify(query));
  const results: T[] = [];
  try {
    while (true) {
      const res = await iterator.next();
      if (res.done) {
        break;
      }
      if (res.value && res.value.value) {
        results.push(JSON.parse(Buffer.from(res.value.value).toString('utf8')) as T);
      }
    }
  } finally {
    await iterator.close();
  }
  return results;
};

export const readState = async <T>(ctx: Context, prefix: string, attributes: string[]): Promise<T | null> => {
  const key = ctx.stub.createCompositeKey(prefix, attributes);
  const data = await ctx.stub.getState(key);
  if (data.length === 0) return null;
  if (prefix === 'stock') {
    return Number(Buffer.from(data).toString('utf8')) as unknown as T;
  }
  return JSON.parse(Buffer.from(data).toString('utf8')) as T;
};

export const writeState = async <T>(ctx: Context, prefix: string, attributes: string[], value: T): Promise<void> => {
  const key = ctx.stub.createCompositeKey(prefix, attributes);
  let valStr: string;
  if (prefix === 'stock') {
    valStr = String(value);
  } else {
    valStr = JSON.stringify({ ...value, docType: prefix });
  }
  await ctx.stub.putState(key, Buffer.from(valStr));
};

export const emptyState = (): PdsLedgerState => ({
  stakeholders: [],
  lots: [],
  transfers: [],
  allocations: [],
  entitlements: [],
  authTransactions: [],
  distributions: [],
  alerts: [],
  events: [],
  stock: [],
  rationCards: [],
  grievances: [],
  entitlementRules: [],
  seriesId: 'POC'
});

export const buildEngine = (partial: Partial<PdsLedgerState>): PdsLedgerEngine => {
  const engine = new PdsLedgerEngine(false);
  engine.restoreState({ ...emptyState(), ...partial });
  return engine;
};

export const identityFromContext = (ctx: Context): ClientIdentity => ({
  getMSPID: () => ctx.clientIdentity.getMSPID(),
  getAttributeValue: (name: string) => {
    try {
      const value = ctx.clientIdentity.getAttributeValue(name);
      return value && value.length > 0 ? value : undefined;
    } catch {
      return undefined;
    }
  }
});

/** Returns the consensus-guaranteed transaction timestamp as ISO-8601. */
export const getTxTimestamp = (ctx: Context): string => {
  const ts = ctx.stub.getTxTimestamp();
  return new Date(Number(ts.seconds) * 1000).toISOString();
};

/**
 * Emits a Fabric chaincode event and writes a console log visible in peer logs.
 * Both carry the Fabric txId so log lines can be correlated with block explorer entries.
 */
export const emitAndLog = (
  ctx: Context,
  plane: 'control' | 'data',
  operation: string,
  txId: string,
  payload: unknown
): void => {
  const eventPayload = Buffer.from(JSON.stringify({ txId, plane, operation, payload }));
  ctx.stub.setEvent(operation, eventPayload);
  // Fabric peer captures stdout from the chaincode process.
  // This structured line is queryable via `peer logs` or a log shipper.
  console.log(JSON.stringify({ level: 'info', plane, operation, txId, ts: getTxTimestamp(ctx) }));
};

export const loadSelective = async (
  ctx: Context,
  keys: {
    stakeholders?: string[];
    lots?: string[];
    transfers?: string[];
    allocations?: string[];
    entitlements?: Array<{ rationCardHash: string; commodity: string; month: string }>;
    authTransactions?: string[];
    distributions?: string[];
    alerts?: string[];
    stock?: Array<{ org: string; commodity: string }>;
    rationCards?: string[];
    grievances?: string[];
    entitlementRules?: string[];
  }
): Promise<Partial<PdsLedgerState>> => {
  const state: Partial<PdsLedgerState> = {
    stakeholders: [],
    lots: [],
    transfers: [],
    allocations: [],
    entitlements: [],
    authTransactions: [],
    distributions: [],
    alerts: [],
    events: [],
    stock: [],
    rationCards: [],
    grievances: [],
    entitlementRules: []
  };

  const promises: Promise<void>[] = [];

  if (keys.stakeholders) {
    for (const id of keys.stakeholders) {
      promises.push(
        readState<Stakeholder>(ctx, 'stakeholder', [id]).then((item) => {
          if (item) state.stakeholders!.push(item);
        })
      );
    }
  }
  if (keys.lots) {
    for (const id of keys.lots) {
      promises.push(
        readState<CommodityLot>(ctx, 'lot', [id]).then((item) => {
          if (item) state.lots!.push(item);
        })
      );
    }
  }
  if (keys.transfers) {
    for (const id of keys.transfers) {
      promises.push(
        readState<TransferOrder>(ctx, 'transfer', [id]).then((item) => {
          if (item) state.transfers!.push(item);
        })
      );
    }
  }
  if (keys.allocations) {
    for (const id of keys.allocations) {
      promises.push(
        readState<FPSAllocation>(ctx, 'allocation', [id]).then((item) => {
          if (item) state.allocations!.push(item);
        })
      );
    }
  }
  if (keys.entitlements) {
    for (const k of keys.entitlements) {
      promises.push(
        readState<MonthlyEntitlement>(ctx, 'entitlement', [k.rationCardHash, k.commodity, k.month]).then((item) => {
          if (item) state.entitlements!.push(item);
        })
      );
    }
  }
  if (keys.authTransactions) {
    for (const id of keys.authTransactions) {
      promises.push(
        readState<AuthTransaction>(ctx, 'auth', [id]).then((item) => {
          if (item) state.authTransactions!.push(item);
        })
      );
    }
  }
  if (keys.distributions) {
    for (const id of keys.distributions) {
      promises.push(
        readState<DistributionTransaction>(ctx, 'distribution', [id]).then((item) => {
          if (item) state.distributions!.push(item);
        })
      );
    }
  }
  if (keys.alerts) {
    for (const id of keys.alerts) {
      promises.push(
        readState<AuditAlert>(ctx, 'alert', [id]).then((item) => {
          if (item) state.alerts!.push(item);
        })
      );
    }
  }
  if (keys.rationCards) {
    for (const hash of keys.rationCards) {
      promises.push(
        readState<RationCard>(ctx, 'rationcard', [hash]).then((item) => {
          if (item) state.rationCards!.push(item);
        })
      );
    }
  }
  if (keys.grievances) {
    for (const id of keys.grievances) {
      promises.push(
        readState<Grievance>(ctx, 'grievance', [id]).then((item) => {
          if (item) state.grievances!.push(item);
        })
      );
    }
  }
  if (keys.entitlementRules) {
    for (const id of keys.entitlementRules) {
      promises.push(
        readState<EntitlementRule>(ctx, 'entitlementrule', [id]).then((item) => {
          if (item) state.entitlementRules!.push(item);
        })
      );
    }
  }
  if (keys.stock) {
    for (const k of keys.stock) {
      promises.push(
        readState<number>(ctx, 'stock', [k.org, k.commodity]).then((qty) => {
          if (qty !== null && qty !== undefined) {
            state.stock!.push([`${k.org}:${k.commodity}`, qty]);
          }
        })
      );
    }
  }

  await Promise.all(promises);
  return state;
};
