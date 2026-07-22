import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { GlobalExceptionFilter } from '../../src/infrastructure/exception.filter.js';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { configureHttpSecurity } from '../../src/infrastructure/http-security.js';

export type DemoHttpAppFixture = {
  app: INestApplication;
  dir: string;
  cleanup: () => Promise<void>;
};

const demoEnvKeys = [
  'PDS_LEDGER_MODE',
  'PDS_LEDGER_BACKEND',
  'PDS_PERSISTENCE_BACKEND',
  'PDS_STATE_PATH',
  'PDS_LEDGER_JOURNAL_PATH',
  'PDS_CHAINCODE_STATE_PATH',
  'PDS_AUTH_MODE',
  'PDS_TEST_AUTH_TOKEN',
  'PDS_TEST_AUTH_ROLE',
  'PDS_CORS_ORIGINS',
  'PDS_ALLOW_RESET'
] as const;

export const createDemoHttpApp = async (): Promise<DemoHttpAppFixture> => {
  const dir = mkdtempSync(join(tmpdir(), 'pds-e2e-'));
  const previous: Partial<Record<(typeof demoEnvKeys)[number], string | undefined>> = {};

  for (const key of demoEnvKeys) {
    previous[key] = process.env[key];
  }

  process.env.PDS_LEDGER_MODE = 'demo';
  process.env.PDS_LEDGER_BACKEND = 'local-file';
  process.env.PDS_PERSISTENCE_BACKEND = 'file';
  process.env.PDS_STATE_PATH = join(dir, 'state.json');
  process.env.PDS_LEDGER_JOURNAL_PATH = join(dir, 'journal.ndjson');
  process.env.PDS_CHAINCODE_STATE_PATH = join(dir, 'chaincode-state.json');
  process.env.PDS_AUTH_MODE = 'test';
  process.env.PDS_TEST_AUTH_TOKEN = 'test-token';
  process.env.PDS_TEST_AUTH_ROLE = 'department';
  process.env.PDS_CORS_ORIGINS = 'http://jury.test';
  process.env.PDS_ALLOW_RESET = 'false';

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule]
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureHttpSecurity(app);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.init();

  return {
    app,
    dir,
    cleanup: async () => {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
      for (const key of demoEnvKeys) {
        if (previous[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = previous[key];
        }
      }
    }
  };
};
