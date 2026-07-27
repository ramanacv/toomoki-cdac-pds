import type { MonthlyEntitlement } from '@pds/shared-types';

/**
 * Derive `YYYY-MM` in UTC. Matches chaincode `monthFromTimestamp` so load,
 * engine validation, and reconcile use the same bucket.
 */
export function entitlementMonthFromTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Align an entitlement row with durable issued kg before balance checks.
 * Prefer the larger of the row's alreadyLifted and SUM(distributions).
 */
export function applyDurableLift(
  entitlement: MonthlyEntitlement,
  durableLiftedKg: number
): MonthlyEntitlement {
  const alreadyLiftedKg = Math.max(entitlement.alreadyLiftedKg, durableLiftedKg);
  return {
    ...entitlement,
    alreadyLiftedKg,
    availableBalanceKg: Math.max(0, entitlement.monthlyEntitlementKg - alreadyLiftedKg)
  };
}

export function sumDeliveredKg(rows: Array<{ delivered_kg?: unknown; deliveredKg?: unknown }>): number {
  return rows.reduce((total, row) => {
    const value = row.delivered_kg ?? row.deliveredKg ?? 0;
    return total + Number(value);
  }, 0);
}
