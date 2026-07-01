import { resolveLedgerMode } from '../config/ledger-mode.config.js';

export type AdminAccessConfig = {
  token: string | undefined;
  required: boolean;
};

export const loadAdminAccessConfig = (): AdminAccessConfig => {
  const token = process.env.PDS_ADMIN_TOKEN?.trim() || undefined;
  const ledgerMode = resolveLedgerMode();

  if (token) {
    return { token, required: true };
  }

  return {
    token: undefined,
    required: ledgerMode === 'fabric'
  };
};
