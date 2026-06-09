import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
rmSync(resolve(root, 'tmp'), { recursive: true, force: true });

console.log(
  JSON.stringify(
    {
      reset: true,
      removedPath: resolve(root, 'tmp')
    },
    null,
    2
  )
);
