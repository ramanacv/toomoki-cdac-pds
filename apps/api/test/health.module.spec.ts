import { beforeEach, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { HealthController } from '../src/modules/health/health.controller.js';
import { HealthModule } from '../src/modules/health/health.module.js';

describe('HealthModule', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule]
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('returns health status', () => {
    expect(controller.health()).toEqual({ ok: true });
  });

  it('renders landing page html', () => {
    expect(controller.root()).toContain('PDS-Chain');
  });
});
