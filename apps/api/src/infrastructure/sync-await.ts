import { spawnSync } from 'node:child_process';

export const runSync = <T>(promise: Promise<T>): T => {
  let result!: T;
  let error: unknown;
  let settled = false;

  promise.then(
    (value) => {
      result = value;
      settled = true;
    },
    (reason) => {
      error = reason;
      settled = true;
    }
  );

  while (!settled) {
    spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 1)'], { stdio: 'ignore' });
  }

  if (error) {
    throw error;
  }

  return result;
};
