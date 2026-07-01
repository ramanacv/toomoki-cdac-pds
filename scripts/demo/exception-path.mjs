import { runExceptionDemo, toPrettyJson } from '../../apps/api/dist/src/demo-scripts.js';

console.log(toPrettyJson(await runExceptionDemo()));
