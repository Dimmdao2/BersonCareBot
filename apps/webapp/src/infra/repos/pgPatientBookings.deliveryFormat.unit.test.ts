import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drizzleSqlFragmentToPgQuery } from '@/infra/db/drizzleSqlDebugText';

const fakes = vi.hoisted(() => ({ runWebappSql: vi.fn() }));

vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipal: () => ({ kind: 'staff' as const }),
}));
vi.mock('@/app-layer/db/drizzle', () => ({ getDrizzle: vi.fn() }));
vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
  runWebappSql: fakes.runWebappSql,
}));

import { pgPatientBookingsPort } from './pgPatientBookings';

describe('staff booking projection delivery format', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakes.runWebappSql.mockResolvedValue({ rows: [] });
  });

  /**
   * Owner oracle UI-06 / Flow G: patient_bookings.booking_type is a projection of the canonical
   * appointment format. If an existing online appointment remains projected as in_person, the
   * patient and staff receive contradictory booking semantics after an otherwise successful edit.
   */
  it('sends the canonical online format across the existing-projection write boundary', async () => {
    await pgPatientBookingsPort.updateStaffProjection({
      bookingId: 'booking-1',
      bookingType: 'online',
      slotStart: '2026-09-10T09:00:00.000Z',
      slotEnd: '2026-09-10T09:30:00.000Z',
      city: 'spb',
      cityCodeSnapshot: 'spb',
      branchTitleSnapshot: 'Санкт-Петербург',
      serviceTitleSnapshot: 'Консультация',
      durationMinutesSnapshot: 30,
    });

    expect(fakes.runWebappSql).toHaveBeenCalledOnce();
    const call = fakes.runWebappSql.mock.calls[0];
    if (!call) throw new Error('expected projection write');
    const { values } = drizzleSqlFragmentToPgQuery(call[1]);
    expect(values).toContain('online');
  });
});
