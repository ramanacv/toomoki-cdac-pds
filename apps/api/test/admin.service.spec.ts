import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { FabricRuntimeConfig } from '../src/modules/config/fabric.config.js';
import { PdsLedgerFacade } from '../src/modules/core/pds-ledger.facade.js';
import { FilePdsLedgerPort } from '../src/infrastructure/ledger-port.js';
import { AdminService } from '../src/modules/admin/admin.service.js';

const fabricConfigFixture = (overrides: Partial<FabricRuntimeConfig> = {}): FabricRuntimeConfig => ({
  ledgerMode: 'demo',
  mode: 'local-file',
  clientOrg: 'FoodAndCivilSupplies',
  statePath: '/tmp/state.json',
  journalPath: '/tmp/journal.ndjson',
  envelopePath: '/tmp/envelope.ndjson',
  chaincodeStatePath: '/tmp/chaincode-state.json',
  contractPath: '/tmp/fabric-contract.json',
  connectionProfilePath: '/tmp/food-department.json',
  network: 'pds-chain-fabric-network',
  channel: 'pdschannel',
  chaincode: 'pds-chaincode',
  peerEndpoint: 'peer0.food.example.com:7051',
  peerTlsCertPath: '/tmp/tls/ca.crt',
  peerHostAlias: 'peer0.food.example.com',
  mspId: 'FoodAndCivilSuppliesMSP',
  certPath: '/tmp/cert.pem',
  keyPath: '/tmp/keystore',
  ...overrides
});

describe('AdminService', () => {
  let service: AdminService;
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'pds-admin-'));
    const port = new FilePdsLedgerPort(join(dir, 'state.json'), join(dir, 'journal.ndjson'));
    const facade = new PdsLedgerFacade(port);
    await facade.onModuleInit();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: PdsLedgerFacade, useValue: facade },
        { provide: 'FABRIC_RUNTIME_CONFIG', useValue: fabricConfigFixture() }
      ]
    }).compile();

    service = moduleRef.get(AdminService);
  });

  it('returns a unified admin overview payload', () => {
    const overview = service.getOverview();

    expect(overview.readOnly).toBe(true);
    expect(overview.dashboard.activeLots).toBeGreaterThan(0);
    expect(overview.metrics.stakeholders).toBeGreaterThan(0);
    expect(overview.network.ledgerMode).toBe('demo');
    expect(overview.network.demo?.worldStateSummary.lots).toBeGreaterThan(0);
    expect(overview.activity.eventCount).toBeGreaterThan(0);
    expect(overview.health.some((check) => check.name === 'api')).toBe(true);
  });

  it('returns network, activity, and stakeholder summaries', () => {
    const network = service.getNetwork();
    const activity = service.getActivity();
    const stakeholders = service.getStakeholderSummary();

    expect(network.persistenceBackend).toBeDefined();
    expect(activity.recentEvents.length).toBeGreaterThan(0);
    expect(stakeholders.byType.length).toBeGreaterThan(0);
    expect(stakeholders.fabricOrgMapping.length).toBeGreaterThan(0);
  });

  it('cleans up temp files', () => {
    rmSync(dir, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});
