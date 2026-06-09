export type PersistenceBackend = 'file' | 'postgres';

export type PersistenceRuntimeConfig = {
  backend: PersistenceBackend;
  postgresDsn: string;
};

export const loadPersistenceRuntimeConfig = (): PersistenceRuntimeConfig => {
  const backend = (process.env.PDS_PERSISTENCE_BACKEND ?? 'file').toLowerCase() as PersistenceBackend;

  if (!['file', 'postgres'].includes(backend)) {
    throw new Error(`Unsupported PDS_PERSISTENCE_BACKEND mode: ${backend}`);
  }

  return {
    backend,
    postgresDsn: process.env.PDS_POSTGRES_DSN ?? 'postgresql://pds:pds@localhost:5432/pds_chain'
  };
};
