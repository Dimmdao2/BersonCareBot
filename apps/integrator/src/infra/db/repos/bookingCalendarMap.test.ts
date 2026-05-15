import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getIntegratorDrizzleSession } from '../drizzle.js';
import { drizzleSqlFragmentToApproximateSql } from '../drizzleSqlDebugText.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import {
  deleteBookingCalendarMap,
  getGoogleEventIdByRubitimeRecordId,
  upsertBookingCalendarMap,
} from './bookingCalendarMap.js';

vi.mock('../drizzle.js', () => ({
  getIntegratorDrizzleSession: vi.fn(),
}));

vi.mock('../runIntegratorSql.js', () => ({
  runIntegratorSql: vi.fn().mockResolvedValue({ rows: [] }),
}));

describe('bookingCalendarMap (Drizzle + public.patient_bookings sync)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns Google calendar event id from first map row", async () => {
    const limit = vi.fn().mockResolvedValue([{ gcalEventId: 'gcal-99' }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ select } as never);

    const id = await getGoogleEventIdByRubitimeRecordId({} as DbPort, 'rub-1');
    expect(id).toBe('gcal-99');
    expect(select).toHaveBeenCalledTimes(1);
  });

  it("returns null when rubitime record has no calendar map row", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    const select = vi.fn().mockReturnValue({ from });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({ select } as never);

    const id = await getGoogleEventIdByRubitimeRecordId({} as DbPort, 'missing');
    expect(id).toBeNull();
  });

  it('upsertBookingCalendarMap writes map then updates public.patient_bookings by rubitime_id', async () => {
    const onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoUpdate });
    const insert = vi.fn().mockReturnValue({ values });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({
      insert,
      execute: vi.fn(),
    } as never);

    const db = {} as DbPort;
    await upsertBookingCalendarMap(db, { rubitimeRecordId: 'r-1', gcalEventId: 'g-1' });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledWith({
      rubitimeRecordId: 'r-1',
      gcalEventId: 'g-1',
    });
    expect(runIntegratorSql).toHaveBeenCalledTimes(1);
    const frag = vi.mocked(runIntegratorSql).mock.calls[0]?.[1];
    const flat = drizzleSqlFragmentToApproximateSql(frag);
    expect(flat).toContain('public.patient_bookings');
    expect(flat).toContain('gcal_event_id');
    expect(flat).toContain('rubitime_id');
  });

  it('deleteBookingCalendarMap clears map and nulls patient_bookings.gcal_event_id', async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const del = vi.fn().mockReturnValue({ where });
    vi.mocked(getIntegratorDrizzleSession).mockReturnValue({
      delete: del,
      execute: vi.fn(),
    } as never);

    const db = {} as DbPort;
    await deleteBookingCalendarMap(db, 'r-del');

    expect(del).toHaveBeenCalledTimes(1);
    expect(runIntegratorSql).toHaveBeenCalledTimes(1);
    const frag = vi.mocked(runIntegratorSql).mock.calls[0]?.[1];
    const flat = drizzleSqlFragmentToApproximateSql(frag);
    expect(flat).toContain('public.patient_bookings');
    expect(flat).toMatch(/gcal_event_id\s*=\s*NULL/i);
  });
});
