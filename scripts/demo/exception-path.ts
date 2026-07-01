import { runExceptionDemo, toPrettyJson } from './flows.js';

const result = await runExceptionDemo();
console.log(toPrettyJson(result));
