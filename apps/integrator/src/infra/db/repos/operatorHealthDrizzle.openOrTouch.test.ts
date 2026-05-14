import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openOrTouchOperatorIncident } from './operatorHealthDrizzle.js';

const mockReturning = vi.fn();
const mockOnConflictDoUpdate = vi.fn(() => ({ returning: mockReturning }));
const mockValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
const mockInsert = vi.fn(() => ({ values: mockValues }));

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzle: vi.fn(() => ({
    insert: mockInsert,
  })),
}));

const baseInput = {
  dedupKey: 'outbound:max:max_probe_failed',
  direction: 'outbound',
  integration: 'max',
  errorClass: 'max_probe_failed',
  errorDetail: 'unit',
};

describe('openOrTouchOperatorIncident', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns occurrenceCount from Drizzle returning row', async () => {
    mockReturning.mockResolvedValueOnce([{ id: '11111111-1111-4111-8111-111111111111', occurrenceCount: 1 }]);
    const r = await openOrTouchOperatorIncident(baseInput);
    expect(r).toEqual({ id: '11111111-1111-4111-8111-111111111111', occurrenceCount: 1 });
    expect(mockInsert).toHaveBeenCalledTimes(1);
    expect(mockOnConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it('increments occurrenceCount on sequential touch (same dedup_key path)', async () => {
    mockReturning
      .mockResolvedValueOnce([{ id: '22222222-2222-4222-8222-222222222222', occurrenceCount: 1 }])
      .mockResolvedValueOnce([{ id: '22222222-2222-4222-8222-222222222222', occurrenceCount: 2 }]);

    const first = await openOrTouchOperatorIncident(baseInput);
    const second = await openOrTouchOperatorIncident({ ...baseInput, errorDetail: 'retry' });

    expect(first.occurrenceCount).toBe(1);
    expect(second.occurrenceCount).toBe(2);
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('throws when returning is empty (DB invariant)', async () => {
    mockReturning.mockResolvedValueOnce([]);
    await expect(openOrTouchOperatorIncident(baseInput)).rejects.toThrow(/empty returning/);
  });
});
