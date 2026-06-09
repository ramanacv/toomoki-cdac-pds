import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { LotCreateDto } from '../src/dto.js';

describe('dto validation', () => {
  it('rejects invalid lot quantities', () => {
    const dto = plainToInstance(LotCreateDto, {
      lotId: 'LOT-001',
      commodity: 'Rice',
      season: 'Kharif 2026',
      quantityKg: 0,
      qualityGrade: 'A',
      source: 'Procurement Centre 01',
      currentOwner: 'PROC-001',
      currentLocation: 'Procurement Yard'
    });

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
