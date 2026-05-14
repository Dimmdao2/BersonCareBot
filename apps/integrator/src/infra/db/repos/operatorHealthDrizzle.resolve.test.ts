/* eslint-disable no-secrets/no-secrets -- test titles and mock keys reference exported symbols, not secrets */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveOpenOperatorIncidentsByDedupKeyPrefix } from './operatorHealthDrizzle.js';

const mockReturning = vi.fn();
const mockWhere = vi.fn(() => ({ returning: mockReturning }));
const mockSet = vi.fn(() => ({ where: mockWhere }));
const mockUpdate = vi.fn(() => ({ set: mockSet }));

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzle: vi.fn(() => ({
    update: mockUpdate,
  })),
}));

describe('resolveOpenOperatorIncidentsByDedupKeyPrefix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReturning.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
  });

  it('returns count of rows updated', async () => {
    const n = await resolveOpenOperatorIncidentsByDedupKeyPrefix('outbound:max:');
    expect(n).toBe(2);
    expect(mockUpdate).toHaveBeenCalledTimes(1);
  });
});
