import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadPersistenceRuntimeConfig } from '../src/persistence-config.js';

describe('persistence config', () => {
  const priorPersistence = process.env.PDS_PERSISTENCE_BACKEND;
  const priorDsn = process.env.PDS_POSTGRES_DSN;

  beforeEach(() => {
    delete process.env.PDS_PERSISTENCE_BACKEND;
    delete process.env.PDS_POSTGRES_DSN;
  });

  afterEach(() => {
    if (priorPersistence === undefined) delete process.env.PDS_PERSISTENCE_BACKEND;
    else process.env.PDS_PERSISTENCE_BACKEND = priorPersistence;
    if (priorDsn === undefined) delete process.env.PDS_POSTGRES_DSN;
    else process.env.PDS_POSTGRES_DSN = priorDsn;
  });

  it('defaults to file persistence', () => {
    expect(loadPersistenceRuntimeConfig()).toEqual({
      backend: 'file',
      postgresDsn: 'postgresql://pds:pds@localhost:5432/pds_chain'
    });
  });

  it('loads postgres settings from env', () => {
    process.env.PDS_PERSISTENCE_BACKEND = 'postgres';
    process.env.PDS_POSTGRES_DSN = 'postgresql://example';

    expect(loadPersistenceRuntimeConfig()).toEqual({
      backend: 'postgres',
      postgresDsn: 'postgresql://example'
    });
  });
});
