import { describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { OpenapiController } from '../src/modules/openapi/openapi.controller.js';
import { OpenapiModule } from '../src/modules/openapi/openapi.module.js';

describe('OpenapiModule', () => {
  it('serves the openapi document', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [OpenapiModule]
    }).compile();

    const controller = moduleRef.get(OpenapiController);
    const spec = controller.openapi();

    expect(spec.openapi).toBeDefined();
    expect(spec.paths['/stakeholders']).toBeDefined();
    expect(spec.paths['/dashboard/summary']).toBeDefined();
    expect(spec.paths['/trace/lots/{lotId}']).toBeDefined();
  });
});
