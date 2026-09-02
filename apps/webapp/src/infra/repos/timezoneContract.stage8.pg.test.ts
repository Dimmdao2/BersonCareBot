/**
 * Stage 8: SQL bind contract for the surviving canonical patient booking path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/infra/db/runWebappSql')>();
  return {
    ...actual,
    getWebappSqlDb: () => ({}),
    runWebappSql: queryMock,
  };
});

import { drizzleSqlFragmentToPgQuery } from '@/infra/db/drizzleSqlDebugText';
import { pgPatientBookingsPort } from './pgPatientBookings';

/** Moscow wall 11:00 → UTC (STAGE_8 / MASTER_PLAN). */
const STAGE8_EXPECTED_MOSCOW_UTC_ISO = '2026-04-07T08:00:00.000Z';

describe('Stage 8 timezone contract (webapp PG repos)', () => {
  beforeEach(() => {
    queryMock.mockReset();
  });

  it('S8.T02: patient_bookings — createPending binds slot_start to the canonical ISO', async () => {
    const slotEnd = '2026-04-07T09:00:00.000Z';
    queryMock
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({ rowCount: 0 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'pb-stage8',
            platform_user_id: 'u-stage8',
            booking_type: 'in_person',
            city: 'moscow',
            category: 'general',
            slot_start: new Date(STAGE8_EXPECTED_MOSCOW_UTC_ISO),
            slot_end: new Date(slotEnd),
            status: 'creating',
            cancelled_at: null,
            cancel_reason: null,
            rubitime_id: null,
            gcal_event_id: null,
            contact_phone: '+7000',
            contact_email: null,
            contact_name: 'T',
            reminder_24h_sent: false,
            reminder_2h_sent: false,
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
      });
    await pgPatientBookingsPort.createPending({
      organizationId: '00000000-0000-4000-8000-000000000001',
      userId: 'u-stage8',
      bookingType: 'in_person',
      city: 'moscow',
      category: 'general',
      slotStart: STAGE8_EXPECTED_MOSCOW_UTC_ISO,
      slotEnd,
      contactName: 'T',
      contactPhone: '+7000',
      contactEmail: null,
      branchId: null,
      serviceId: null,
      branchServiceId: null,
      cityCodeSnapshot: null,
      branchTitleSnapshot: null,
      serviceTitleSnapshot: null,
      durationMinutesSnapshot: null,
      priceMinorSnapshot: null,
    });
    expect(queryMock).toHaveBeenCalledTimes(4);
    const insert = drizzleSqlFragmentToPgQuery(queryMock.mock.calls[3]![1]);
    expect(insert.sql).toContain('patient_bookings');
    expect(insert.sql).toContain('slot_start');
    // The canonical instant travels as a bound value, never spliced into the statement text.
    expect(insert.values).toContain(STAGE8_EXPECTED_MOSCOW_UTC_ISO);
    expect(insert.sql).not.toContain(STAGE8_EXPECTED_MOSCOW_UTC_ISO);
  });
});
