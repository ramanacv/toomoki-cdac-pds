import { parseDemoArgs } from './cli.mjs';
import { runHappyPathFabric } from './fabric-api.mjs';
import { runHappyPathDemo, toPrettyJson } from '../../apps/api/dist/src/demo-scripts.js';
import { getServiceAccessToken } from '../iam/service-token.mjs';

const { ledger, token, apiBase } = parseDemoArgs();

const result =
  ledger === 'fabric'
    ? await runHappyPathFabric({ apiBase, token: token || await getServiceAccessToken() })
    : await runHappyPathDemo();

console.log(toPrettyJson(result));
