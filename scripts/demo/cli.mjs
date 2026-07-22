export const parseDemoArgs = (argv = process.argv.slice(2)) => {
  const ledgerArg = argv.find((arg) => arg.startsWith('--ledger='));
  const tokenArg = argv.find((arg) => arg.startsWith('--token='));
  const ledger = ledgerArg?.split('=')[1] ?? process.env.PDS_LEDGER_MODE ?? 'demo';

  return {
    ledger: ledger === 'fabric' ? 'fabric' : 'demo',
    token: tokenArg?.split('=')[1] ?? process.env.PDS_E2E_ACCESS_TOKEN ?? '',
    apiBase: process.env.API_BASE ?? 'http://127.0.0.1:3000'
  };
};
