import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const chaincodeStatePath = resolve(root, 'tmp/chaincode-world-state.json');

mkdirSync(dirname(chaincodeStatePath), { recursive: true });
writeFileSync(
  chaincodeStatePath,
  `${JSON.stringify({ key: 'pds.state', state: { stakeholders: [], lots: [], transfers: [], allocations: [], entitlements: [], authTransactions: [], distributions: [], alerts: [], events: [], stock: [] } }, null, 2)}\n`,
  'utf8'
);

console.log(
  JSON.stringify(
    {
      bootstrapped: true,
      chaincodeStatePath,
      mode: 'chaincode-runtime'
    },
    null,
    2
  )
);
