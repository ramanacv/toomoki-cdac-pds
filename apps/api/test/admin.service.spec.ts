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
  endorsingOrgs: ['FoodAndCivilSuppliesMSP'],
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

  it('returns a unified admin overview payload', async () => {
    const overview = await service.getOverview();

    expect(overview.readOnly).toBe(true);
    expect(overview.dashboard.activeLots).toBeGreaterThan(0);
    expect(overview.metrics.stakeholders).toBeGreaterThan(0);
    expect(overview.network.ledgerMode).toBe('demo');
    expect(overview.network.demo?.worldStateSummary.lots).toBeGreaterThan(0);
    expect(overview.activity.eventCount).toBeGreaterThan(0);
    expect(overview.health.some((check) => check.name === 'api')).toBe(true);
    expect(overview.stock.every((position) => position.quantityKg > 0)).toBe(true);
    expect(overview.entitlementSummary.recordCount).toBeGreaterThanOrEqual(overview.entitlementSummary.activeCount);
    expect(overview.entitlementSummary.utilizationPct).toBeGreaterThanOrEqual(0);
  });

  it('returns network, activity, and stakeholder summaries', async () => {
    const network = await service.getNetwork();
    const activity = await service.getActivity();
    const stakeholders = await service.getStakeholderSummary();

    expect(network.persistenceBackend).toBeDefined();
    expect(activity.recentEvents.length).toBeGreaterThan(0);
    expect(stakeholders.byType.length).toBeGreaterThan(0);
    expect(stakeholders.byStatus.length).toBeGreaterThan(0);
    expect(stakeholders.fabricOrgMapping.filter((org) => org.deploymentStatus === 'DEPLOYED')).toHaveLength(2);
    expect(stakeholders.fabricOrgMapping.filter((org) => org.deploymentStatus === 'PLANNED')).toHaveLength(3);
  });

  it('resets transactional data while leaving stakeholders intact', async () => {
    const before = await service.getOverview();
    expect(before.metrics.lots).toBeGreaterThan(0);
    expect(before.stock.length).toBeGreaterThan(0);

    const result = await service.resetLedger();
    expect(result.ledgerTxId).toMatch(/^TX-/);
    expect(result.seriesId).toMatch(/^R/);
    expect(result.lots).toHaveLength(6);
    expect(result.lots.every((lot) => lot.lotId.includes(result.seriesId))).toBe(true);

    const after = await service.getOverview();
    // The demo's starting lots are recreated by the reset so the frontend's
    // scripted rice workflow can be replayed while the commodity catalog remains visible.
    expect(after.metrics.lots).toBe(6);
    expect(after.metrics.transfers).toBe(0);
    expect(after.metrics.distributions).toBe(0);
    expect(after.stock.map((position) => position.commodity)).toEqual(
      expect.arrayContaining(['Rice', 'Wheat', 'Dal', 'Sugar', 'Cooking Oil', 'Kerosene'])
    );
    expect(after.metrics.stakeholders).toBe(before.metrics.stakeholders);
  });

  it('scopes a reset to one commodity, leaving the others in place', async () => {
    const before = await service.getOverview();
    const wheatStockBefore = before.stock.find((position) => position.commodity === 'Wheat');
    expect(wheatStockBefore?.quantityKg).toBeGreaterThan(0);

    const result = await service.resetLedger('Rice');
    expect(result.ledgerTxId).toMatch(/^TX-/);
    expect(result.seriesId).toMatch(/^R/);
    expect(result.lots).toHaveLength(1);
    expect(result.lots[0]?.commodity).toBe('Rice');
    expect(result.message).toContain('Rice');

    const after = await service.getOverview();
    expect(after.metrics.lots).toBe(before.metrics.lots);
    expect(after.stock.map((position) => position.commodity)).toEqual(
      expect.arrayContaining(['Rice', 'Wheat', 'Dal', 'Sugar', 'Cooking Oil', 'Kerosene'])
    );
    const wheatStockAfter = after.stock.find((position) => position.commodity === 'Wheat');
    expect(wheatStockAfter?.quantityKg).toBe(wheatStockBefore?.quantityKg);
    expect(after.metrics.stakeholders).toBe(before.metrics.stakeholders);
  });

  it('cleans up temp files', () => {
    rmSync(dir, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});
