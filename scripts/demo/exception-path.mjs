import { parseDemoArgs } from './cli.mjs';
import { runExceptionPathFabric } from './fabric-api.mjs';
import { runExceptionDemo, toPrettyJson } from '../../apps/api/dist/src/demo-scripts.js';
import { getServiceAccessToken } from '../iam/service-token.mjs';

const { ledger, token, apiBase } = parseDemoArgs();

const result =
  ledger === 'fabric'
    ? await runExceptionPathFabric({ apiBase, token: token || await getServiceAccessToken() })
    : await runExceptionDemo();

console.log(toPrettyJson(result));
