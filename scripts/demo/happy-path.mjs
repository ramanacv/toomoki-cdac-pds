import { parseDemoArgs } from './cli.mjs';
import { runHappyPathFabric } from './fabric-api.mjs';
import { runHappyPathDemo, toPrettyJson } from '../../apps/api/dist/src/demo-scripts.js';

const { ledger, token, apiBase } = parseDemoArgs();

const result =
  ledger === 'fabric'
    ? await runHappyPathFabric({ apiBase, token })
    : await runHappyPathDemo();

console.log(toPrettyJson(result));
