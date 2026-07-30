import { describe, expect, it } from 'vitest';
import { formatDateTime } from '@/lib/constants.js';

describe('formatDateTime', () => {
  it('renders a human-readable date with a 12-hour AM/PM clock', () => {
    expect(formatDateTime('2026-07-30T18:14:00')).toBe('30 Jul 2026, 6:14 PM');
    expect(formatDateTime('2026-07-30T08:05:00')).toBe('30 Jul 2026, 8:05 AM');
  });

  it('keeps pending and invalid values safe', () => {
    expect(formatDateTime()).toBe('Pending');
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
  });
});
