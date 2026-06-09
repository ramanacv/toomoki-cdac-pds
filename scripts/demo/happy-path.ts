import { runHappyPathDemo, toPrettyJson } from './flows.js';

const result = runHappyPathDemo();
console.log(toPrettyJson(result));
