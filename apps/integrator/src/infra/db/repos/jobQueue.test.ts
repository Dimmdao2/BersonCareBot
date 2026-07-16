import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { cancelPendingBookingReminderJobsByBookingId, claimDueMessageRetryJobs } from './jobQueue.js';

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

  it('claims only from the schema-qualified operational queue', async () => {
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ execute } as never);

    await claimDueMessageRetryJobs({} as DbPort, 3);

    const fragment = execute.mock.calls[0]?.[0] as { queryChunks?: unknown[] };
    const text = JSON.stringify(fragment);
    expect(text).toContain('integrator.rubitime_create_retry_jobs');
  });
});
