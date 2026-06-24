import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OPENAPI_SPEC } from '../src/openapi.js';

describe('infrastructure contracts', () => {
  it('includes core pds tables in the postgres schema', () => {
    const schema = readFileSync(resolve(process.cwd(), '../../infra/postgres/schema.sql'), 'utf8');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS stakeholders');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS commodity_lots');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS distribution_transactions');
    expect(schema).toContain('CREATE TABLE IF NOT EXISTS ledger_events');
  });

  it('defines compose services for postgres api and web', () => {
    const compose = readFileSync(resolve(process.cwd(), '../../docker-compose.yml'), 'utf8');
    expect(compose).toContain('postgres:');
    expect(compose).toContain('api:');
    expect(compose).toContain('web:');
    expect(compose).toContain('PDS_PERSISTENCE_BACKEND: postgres');
    expect(compose).toContain('PDS_POSTGRES_DSN:');
  });

  it('exposes seed and reset scripts at the repo root', () => {
    const packageJson = readFileSync(resolve(process.cwd(), '../../package.json'), 'utf8');
    expect(packageJson).toContain('"seed": "node scripts/seed.mjs"');
    expect(packageJson).toContain('"reset": "node scripts/reset.mjs"');
  });

  it('documents the persistence backend in env example', () => {
    const env = readFileSync(resolve(process.cwd(), '../../.env.example'), 'utf8');
    expect(env).toContain('PDS_PERSISTENCE_BACKEND=file');
    expect(env).toContain('PDS_CHAINCODE_STATE_PATH=');
    expect(env).toContain('PDS_POSTGRES_DSN=postgresql://pds:pds@localhost:5432/pds_chain');
  });

  it('exposes a local openapi contract', () => {
    const openapi = readFileSync(resolve(process.cwd(), 'src/modules/openapi/openapi.document.ts'), 'utf8');
    expect(openapi).toContain('/stakeholders');
    expect(openapi).toContain('/distributions/{distributionId}');
    expect(openapi).toContain('/auth/transactions/{authTxnId}');
    expect(openapi).toContain('/entitlements');
  });

  it('includes key paths in the openapi object', () => {
    expect(Object.prototype.hasOwnProperty.call(OPENAPI_SPEC.paths, '/openapi.json')).toBe(false);
    expect(OPENAPI_SPEC.paths['/stakeholders']).toBeDefined();
    expect(OPENAPI_SPEC.paths['/distributions/{distributionId}']).toBeDefined();
  });
});
