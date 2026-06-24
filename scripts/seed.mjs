import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PdsRuntime } from '../apps/api/dist/src/pds-runtime.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const statePath = resolve(root, 'tmp/pds-state.json');

rmSync(resolve(root, 'tmp'), { recursive: true, force: true });
const service = new PdsRuntime(true, statePath);

console.log(
  JSON.stringify(
    {
      seeded: true,
      statePath,
      summary: service.getDashboardSummary(),
      stakeholders: service.listStakeholders().length,
      lots: service.listLots().length,
      alerts: service.getAlerts().length
    },
    null,
    2
  )
);
