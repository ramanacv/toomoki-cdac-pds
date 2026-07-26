import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlertType } from '@pds/shared-types';
import { PdsRuntime } from '../src/modules/core/pds-runtime.js';

describe('Postgres mutation rejection audit evidence', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists RaiseAuditFlag alerts after a rejected over-allocation rolls back', async () => {
    const statements: string[] = [];
    let inTransaction = false;
    const client = {
      query: vi.fn(async (sql: string, params: unknown[] = []) => {
        const normalized = sql.trim();
        statements.push(normalized.split('\n')[0] ?? normalized);
        if (normalized === 'BEGIN') {
          inTransaction = true;
          return { rows: [], rowCount: 0 };
        }
        if (normalized === 'COMMIT') {
          inTransaction = false;
          return { rows: [], rowCount: 0 };
        }
        if (normalized === 'ROLLBACK') {
          inTransaction = false;
          return { rows: [], rowCount: 0 };
        }
        if (normalized.includes('FROM stakeholders')) {
          const stakeholderId = String(params[0] ?? '');
          if (stakeholderId === 'GODOWN-B-001') {
            return {
              rows: [{
                stakeholder_id: 'GODOWN-B-001',
                stakeholder_type: 'STATE_GODOWN',
                name: 'Block',
                district: 'Demo',
                license_no: 'G-B',
                status: 'ACTIVE'
              }],
              rowCount: 1
            };
          }
          if (stakeholderId === 'FPS-101') {
            return {
              rows: [{
                stakeholder_id: 'FPS-101',
                stakeholder_type: 'FAIR_PRICE_SHOP',
                name: 'FPS',
                district: 'Demo',
                license_no: 'F-101',
                status: 'ACTIVE'
              }],
              rowCount: 1
            };
          }
          if (stakeholderId === 'TRANS-001') {
            return {
              rows: [{
                stakeholder_id: 'TRANS-001',
                stakeholder_type: 'TRANSPORTER',
                name: 'Transporter',
                district: 'Demo',
                license_no: 'T-001',
                status: 'ACTIVE'
              }],
              rowCount: 1
            };
          }
          return { rows: [], rowCount: 0 };
        }
        if (normalized.includes('FROM stock_positions')) {
          return {
            rows: [{ stakeholder_id: 'GODOWN-B-001', commodity: 'Rice', quantity_kg: 100 }],
            rowCount: 1
          };
        }
        if (normalized.includes('FROM fps_allocations')) {
          return { rows: [], rowCount: 0 };
        }
        if (normalized.includes('INSERT INTO audit_alerts')) {
          return { rows: [], rowCount: 1 };
        }
        if (normalized.includes('INSERT INTO ledger_events')) {
          return { rows: [], rowCount: 1 };
        }
        if (normalized.includes('INSERT INTO ledger_tx_index')) {
          return { rows: [], rowCount: 1 };
        }
        if (normalized.includes('INSERT INTO ledger_outbox')) {
          return { rows: [], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: vi.fn()
    };
    const pool = {
      connect: vi.fn(async () => client),
      query: vi.fn(async (sql: string) => {
        if (String(sql).includes('COUNT(*)')) {
          return { rows: [{ count: '1' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      })
    };
    const runtime = new PdsRuntime(false, {
      getPool: () => pool,
      persist: async () => undefined,
      load: async () => null
    } as never, { deferBootstrap: true });
    await runtime.bootstrapFromPersistenceAsync();

    await expect(
      runtime.allocateToFpsPersisted({
        allocationId: 'ALLOC-REJECT-1',
        fpsId: 'FPS-101',
        commodity: 'Rice',
        allocatedQtyKg: 500,
        month: '2026-07',
        sourceGodownId: 'GODOWN-B-001',
        transporterId: 'TRANS-001',
        vehicleNo: 'KA01NEG001'
      })
    ).rejects.toThrow(/Insufficient stock/);

    expect(statements.filter((sql) => sql === 'ROLLBACK').length).toBeGreaterThanOrEqual(1);
    expect(statements.filter((sql) => sql === 'COMMIT').length).toBeGreaterThanOrEqual(1);
    expect(statements.some((sql) => sql.includes('INSERT INTO audit_alerts'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO ledger_events'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO ledger_outbox'))).toBe(true);
    expect(inTransaction).toBe(false);
    expect(client.release).toHaveBeenCalled();
    expect(AlertType.UNAUTHORIZED_TRANSACTION).toBe('UNAUTHORIZED_TRANSACTION');
  });
});
