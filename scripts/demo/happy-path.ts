import { runHappyPathDemo, toPrettyJson } from './flows.js';

const result = await runHappyPathDemo();
console.log(toPrettyJson(result));
