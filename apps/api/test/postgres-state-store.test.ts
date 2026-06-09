import { describe, expect, it } from 'vitest';
import { StakeholderStatus, StakeholderType } from '@pds/shared-types';
import { PdsLedgerEngine } from '@pds/pds-chaincode';
import { buildSnapshotWritePlan } from '../src/postgres-snapshot.js';
import { InMemoryPostgresSnapshotAdapter, PostgresPdsStateStore } from '../src/postgres-state-store.js';

describe('postgres state store', () => {
  it('writes a snapshot through the adapter boundary', () => {
    const engine = new PdsLedgerEngine(true);
    const adapter = new InMemoryPostgresSnapshotAdapter();
    const store = new PostgresPdsStateStore(adapter);

    store.save(engine.exportState());

    expect(adapter.executed).toHaveLength(buildSnapshotWritePlan(engine.exportState()).length);
    expect(adapter.executed[0]?.text).toBe('BEGIN');
    expect(adapter.executed.at(-1)?.text).toBe('COMMIT');
  });

  it('loads a snapshot from postgres-shaped rows', () => {
    const adapter = new InMemoryPostgresSnapshotAdapter();
    adapter.seed({
      stakeholders: [
        {
          stakeholderId: 'PROC-001',
          stakeholderType: StakeholderType.PROCUREMENT_CENTER,
          name: 'Procurement Centre 01',
          district: 'Demo District',
          licenseNo: 'PROC-LIC-001',
          status: StakeholderStatus.ACTIVE
        }
      ]
    });

    const store = new PostgresPdsStateStore(adapter);
    const state = store.load();

    expect(state?.stakeholders).toHaveLength(1);
    expect(state?.stakeholders[0]?.stakeholderId).toBe('PROC-001');
  });
});
