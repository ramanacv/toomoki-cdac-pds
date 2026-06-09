import { runExceptionDemo, toPrettyJson } from './flows.js';

const result = runExceptionDemo();
console.log(toPrettyJson(result));
