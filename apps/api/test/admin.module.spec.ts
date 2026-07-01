import { afterEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { FabricRuntimeConfig } from '../src/modules/config/fabric.config.js';
import { AdminController } from '../src/modules/admin/admin.controller.js';
import { AdminService } from '../src/modules/admin/admin.service.js';
import { PdsLedgerFacade } from '../src/modules/core/pds-ledger.facade.js';
import { createDemoLedgerFixture, type DemoLedgerFixture } from './helpers/demo-ledger.js';

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

describe('AdminModule', () => {
  let fixture: DemoLedgerFixture;
  let controller: AdminController;

  afterEach(async () => { await fixture?.cleanup(); });

  it('serves overview, network, activity, and stakeholder endpoints', async () => {
    fixture = await createDemoLedgerFixture();

    const moduleRef = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        AdminService,
        { provide: PdsLedgerFacade, useValue: fixture.facade },
        { provide: 'FABRIC_RUNTIME_CONFIG', useValue: fabricConfigFixture() }
      ]
    }).compile();

    controller = moduleRef.get(AdminController);

    const overview = controller.overview();
    expect(overview.readOnly).toBe(true);
    expect(overview.network.ledgerMode).toBe('demo');

    const network = controller.network();
    expect(network.persistenceBackend).toBeDefined();

    const activity = controller.activity();
    expect(activity.recentEvents.length).toBeGreaterThan(0);

    const stakeholders = controller.stakeholdersSummary();
    expect(stakeholders.byType.length).toBeGreaterThan(0);
  });
});
