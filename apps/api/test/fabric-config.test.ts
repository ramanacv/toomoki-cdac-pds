import { describe, expect, it } from 'vitest';
import { loadFabricRuntimeConfig } from '../src/fabric-config.js';

describe('fabric runtime config', () => {
  it('loads a default runtime config aligned with the contract', () => {
    const config = loadFabricRuntimeConfig();
    expect(config.network).toBe('pds-chain-fabric-network');
    expect(config.channel).toBe('pdschannel');
    expect(config.chaincode).toBe('pds-chaincode');
    expect(config.connectionProfilePath).toContain('food-department.json');
    expect(config.endorsingOrgs).toEqual(['FoodAndCivilSuppliesMSP']);
  });

  it('normalizes explicit endorsing org env values to connection profile organization names', () => {
    const original = {
      PDS_FABRIC_ENDORSING_ORGS: process.env.PDS_FABRIC_ENDORSING_ORGS,
      PDS_LEDGER_BACKEND: process.env.PDS_LEDGER_BACKEND
    };

    process.env.PDS_FABRIC_ENDORSING_ORGS = 'FoodAndCivilSuppliesMSP,GodownWarehouseMSP';
    process.env.PDS_LEDGER_BACKEND = 'fabric-envelope';

    try {
      const config = loadFabricRuntimeConfig();
      expect(config.endorsingOrgs).toEqual(['FoodAndCivilSuppliesMSP', 'GodownWarehouseMSP']);
    } finally {
      process.env.PDS_FABRIC_ENDORSING_ORGS = original.PDS_FABRIC_ENDORSING_ORGS;
      process.env.PDS_LEDGER_BACKEND = original.PDS_LEDGER_BACKEND;
    }
  });

  it('selects a connection profile by organization', () => {
    const original = {
      PDS_FABRIC_CLIENT_ORG: process.env.PDS_FABRIC_CLIENT_ORG,
      PDS_LEDGER_BACKEND: process.env.PDS_LEDGER_BACKEND
    };
    process.env.PDS_FABRIC_CLIENT_ORG = 'AuditAuthority';
    process.env.PDS_LEDGER_BACKEND = 'fabric-envelope';

    try {
      const config = loadFabricRuntimeConfig();
      expect(config.connectionProfilePath).toContain('audit-authority.json');
      expect(config.mode).toBe('fabric-envelope');
    } finally {
      process.env.PDS_FABRIC_CLIENT_ORG = original.PDS_FABRIC_CLIENT_ORG;
      process.env.PDS_LEDGER_BACKEND = original.PDS_LEDGER_BACKEND;
    }
  });

  it('rejects unknown fabric organizations', () => {
    const original = process.env.PDS_FABRIC_CLIENT_ORG;
    const backend = process.env.PDS_LEDGER_BACKEND;
    process.env.PDS_LEDGER_BACKEND = 'fabric-envelope';
    process.env.PDS_FABRIC_CLIENT_ORG = 'UnknownOrg';
    try {
      expect(() => loadFabricRuntimeConfig()).toThrow('Unknown Fabric client organization');
    } finally {
      process.env.PDS_FABRIC_CLIENT_ORG = original;
      process.env.PDS_LEDGER_BACKEND = backend;
    }
  });
});
