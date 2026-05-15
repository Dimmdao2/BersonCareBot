import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { cancelPendingBookingReminderJobsByBookingId } from './jobQueue.js';

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzleSession: vi.fn(),
}));

describe('jobQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancelPendingBookingReminderJobsByBookingId updates rows for booking id', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ update } as never);

    const db = {} as DbPort;
    await cancelPendingBookingReminderJobsByBookingId(db, 'booking-uuid-1');

    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'dead',
        lastError: 'booking_cancelled',
      }),
    );
    expect(where).toHaveBeenCalledTimes(1);
  });
});
