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

// ── Per-collection state keys ────────────────────────────────────────────────
// Replaces the former single pds.state blob (Tier 2).
// Each operation loads and saves only the 2–5 collections it touches.

export const KEYS = {
  stakeholders: 'pds.stakeholders',
  lots: 'pds.lots',
  transfers: 'pds.transfers',
  allocations: 'pds.allocations',
  entitlements: 'pds.entitlements',
  authTransactions: 'pds.authTransactions',
  distributions: 'pds.distributions',
  alerts: 'pds.alerts',
  events: 'pds.events',
  stock: 'pds.stock',
  rationCards: 'pds.rationCards',
  grievances: 'pds.grievances',
  entitlementRules: 'pds.entitlementRules'
} as const;

export type CollectionKey = keyof typeof KEYS;

export const loadCollection = async <T>(ctx: Context, key: CollectionKey): Promise<T[]> => {
  const raw = await ctx.stub.getState(KEYS[key]);
  return raw.length > 0 ? (JSON.parse(raw.toString()) as T[]) : [];
};

export const saveCollection = async <T>(ctx: Context, key: CollectionKey, data: T[]): Promise<void> => {
  await ctx.stub.putState(KEYS[key], Buffer.from(JSON.stringify(data)));
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
  entitlementRules: []
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
  console.log(JSON.stringify({ level: 'info', plane, operation, txId, ts: new Date().toISOString() }));
};
