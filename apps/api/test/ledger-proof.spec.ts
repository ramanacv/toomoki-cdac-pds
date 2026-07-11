import { describe, expect, it } from 'vitest';
import { canonicalJson, ledgerProofFromEvent } from '../src/modules/fabric/ledger-proof.js';

const actor = { subject: 'demo-user', applicationRole: 'DEPARTMENT', submittingOrganization: 'FoodAndCivilSuppliesMSP' };

describe('LedgerProof', () => {
  it('hashes semantically identical payloads identically', () => {
    expect(canonicalJson({ b: 2, a: { y: 2, x: 1 } })).toBe(canonicalJson({ a: { x: 1, y: 2 }, b: 2 }));
  });

  it('creates a traceable versioned proof', () => {
    const proof = ledgerProofFromEvent({ ledgerTxId: 'evt-1', entityType: 'lot', entityId: 'lot-1', eventType: 'DispatchLot', payload: { quantityKg: 2 }, timestamp: '2026-01-01T00:00:00.000Z' }, actor, 'op-1');
    expect(proof).toMatchObject({ eventId: 'evt-1', operationId: 'op-1', schemaVersion: 1, actor });
    expect(proof.payloadHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects sensitive fields at any depth', () => {
    expect(() => ledgerProofFromEvent({ ledgerTxId: 'evt-1', entityType: 'auth', entityId: 'auth-1', eventType: 'AuthTransaction', payload: { evidence: { otp: '1234' } }, timestamp: '2026-01-01T00:00:00.000Z' }, actor)).toThrow(/prohibited personal data/);
  });
});
