import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getAdminStats } from './adminStats.js';

function makeDb(query: ReturnType<typeof vi.fn>): DbPort {
  return { query, tx: vi.fn() } as unknown as DbPort;
}

describe('getAdminStats', () => {
  it('aggregates active bookings and per-integration counts', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ cnt: 12 }] })
      .mockResolvedValueOnce({ rows: [{ total: 50, with_phone: 30 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 40 }] });
    const db = makeDb(query);

    const stats = await getAdminStats(db);
    expect(stats.activeBookings).toBe(12);
    expect(stats.userCountsByIntegration.telegram).toEqual({ total: 50, withPhone: 30 });
    expect(stats.userCountsByIntegration.rubitime).toEqual({ total: 40 });
    expect(query).toHaveBeenCalledTimes(3);
    expect(String(query.mock.calls[0]?.[0])).toContain('public.appointment_records');
    expect(String(query.mock.calls[1]?.[0])).toContain('identities');
    expect(String(query.mock.calls[2]?.[0])).toContain('public.appointment_records');
  });

  it('returns zero active bookings when query fails', async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce({ rows: [{ total: 1, with_phone: 0 }] })
      .mockResolvedValueOnce({ rows: [{ cnt: 2 }] });
    const db = makeDb(query);

    const stats = await getAdminStats(db);
    expect(stats.activeBookings).toBe(0);
    expect(stats.userCountsByIntegration.telegram?.total).toBe(1);
    expect(stats.userCountsByIntegration.rubitime?.total).toBe(2);
  });
});
