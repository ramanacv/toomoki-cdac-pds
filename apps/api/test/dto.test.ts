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
      source: 'FCI Central Depot',
      currentOwner: 'FCI-001',
      currentLocation: 'FCI Depot'
    });

    expect(validateSync(dto).length).toBeGreaterThan(0);
  });
});
