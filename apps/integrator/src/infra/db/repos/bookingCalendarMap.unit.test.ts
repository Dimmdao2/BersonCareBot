import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';

const runNamedRoot = vi.hoisted(() => vi.fn());

vi.mock('../runIntegratorSql.js', () => ({
  runIntegratorNamedRoot: runNamedRoot,
}));

import {
  deleteBookingCalendarEventId,
  getGoogleEventIdByAppointmentId,
  upsertBookingCalendarEventId,
} from './bookingCalendarMap.js';

const APPOINTMENT_ID = '11111111-1111-4111-8111-111111111111';
const db = {} as DbPort;

beforeEach(() => {
  runNamedRoot.mockReset();
});

describe('booking calendar map named roots', () => {
  it('reads by canonical appointment id through the exact get root', async () => {
    runNamedRoot.mockResolvedValue({ rows: [{ gcal_event_id: 'gcal-1' }] });

    await expect(getGoogleEventIdByAppointmentId(db, APPOINTMENT_ID)).resolves.toBe('gcal-1');
    expect(runNamedRoot).toHaveBeenCalledOnce();
    expect(runNamedRoot.mock.calls[0]?.slice(0, 3)).toEqual([
      db,
      'app.get_google_calendar_event_id(uuid)',
      [APPOINTMENT_ID],
    ]);
  });

  it('upserts both map and booking mirror through one exact root', async () => {
    runNamedRoot.mockResolvedValue({ rows: [] });

    await upsertBookingCalendarEventId(db, {
      appointmentId: APPOINTMENT_ID,
      gcalEventId: 'gcal-2',
    });

    expect(runNamedRoot.mock.calls[0]?.slice(0, 3)).toEqual([
      db,
      'app.upsert_google_calendar_event_id(uuid,text)',
      [APPOINTMENT_ID, 'gcal-2'],
    ]);
  });

  it('deletes both map and booking mirror through one exact root', async () => {
    runNamedRoot.mockResolvedValue({ rows: [] });

    await deleteBookingCalendarEventId(db, APPOINTMENT_ID);

    expect(runNamedRoot.mock.calls[0]?.slice(0, 3)).toEqual([
      db,
      'app.delete_google_calendar_event_id(uuid)',
      [APPOINTMENT_ID],
    ]);
  });
});
