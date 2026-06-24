export type PdsLedgerMode = 'demo' | 'fabric';

export type FabricBackendMode = 'local-file' | 'fabric-envelope' | 'chaincode-runtime' | 'fabric-gateway';

export const resolveLedgerMode = (): PdsLedgerMode => {
  const explicit = process.env.PDS_LEDGER_MODE?.toLowerCase();
  if (explicit === 'demo' || explicit === 'fabric') {
    return explicit;
  }

  const legacy = process.env.PDS_LEDGER_BACKEND?.toLowerCase();
  if (legacy === 'fabric-gateway') {
    return 'fabric';
  }
  if (legacy === 'chaincode-runtime') {
    return 'demo';
  }

  return 'demo';
};

export const resolveLegacyBackendMode = (): FabricBackendMode => {
  const legacy = (process.env.PDS_LEDGER_BACKEND ?? 'local-file').toLowerCase() as FabricBackendMode;
  if (['local-file', 'fabric-envelope', 'chaincode-runtime', 'fabric-gateway'].includes(legacy)) {
    return legacy;
  }
  throw new Error(`Unsupported PDS_LEDGER_BACKEND mode: ${legacy}`);
};

export const usesDemoChaincodeRuntime = (ledgerMode: PdsLedgerMode, legacyMode: FabricBackendMode): boolean =>
  ledgerMode === 'demo' && (legacyMode === 'chaincode-runtime' || legacyMode === 'fabric-gateway');
