import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import {
  canonicalCalendarMapKey,
  mapCanonicalAppointmentToGoogleEvent,
  syncCanonicalAppointmentToCalendar,
} from './sync.js';
import {
  getGoogleEventIdByAppointmentKey,
  upsertBookingCalendarMap,
} from '../../infra/db/repos/bookingCalendarMap.js';

vi.mock('../../infra/db/repos/bookingCalendarMap.js', () => ({
  getGoogleEventIdByAppointmentKey: vi.fn().mockResolvedValue('gcal-existing'),
  upsertBookingCalendarMap: vi.fn(),
  deleteBookingCalendarMap: vi.fn(),
}));

vi.mock('./calendarDescription.js', () => ({
  buildGoogleCalendarDescriptionForSync: vi.fn().mockResolvedValue('#+79991234567'),
}));

vi.mock('./resolvePackageCalendarContext.js', () => ({
  resolvePackageCalendarContext: vi.fn().mockResolvedValue({
    packageLinked: false,
    packageSessionLine: null,
  }),
}));

describe('syncCanonicalAppointmentToCalendar', () => {
  it('uses a canonical appointment map key', () => {
    expect(canonicalCalendarMapKey('appt-1')).toBe('be:appt-1');
  });

  it('maps and updates an existing Google Calendar event', async () => {
    const db = {} as DbPort;
    const input = {
      action: 'updated' as const,
      appointmentId: 'appt-1',
      organizationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      startAt: '2026-04-01T10:00:00.000Z',
      endAt: '2026-04-01T11:00:00.000Z',
      clientName: 'Иванов Иван',
      serviceTitle: 'Консультация',
      phoneNormalized: '+79991234567',
    };
    const mapped = await mapCanonicalAppointmentToGoogleEvent(input, db);
    expect(mapped).toMatchObject({
      startDateTime: input.startAt,
      endDateTime: input.endAt,
      description: '#+79991234567',
    });

    const client = {
      upsertEvent: vi.fn().mockResolvedValue('gcal-existing'),
      deleteEvent: vi.fn(),
    };
    await syncCanonicalAppointmentToCalendar(input, {
      db,
      client,
      config: {
        enabled: true,
        clientId: 'id',
        clientSecret: 'secret',
        redirectUri: 'http://localhost/oauth',
        calendarId: 'cal',
        refreshToken: 'rt',
      },
    });

    expect(getGoogleEventIdByAppointmentKey).toHaveBeenCalledWith(db, 'be:appt-1');
    expect(client.upsertEvent).toHaveBeenCalledWith('gcal-existing', expect.any(Object));
    expect(upsertBookingCalendarMap).toHaveBeenCalledWith(db, {
      appointmentKey: 'be:appt-1',
      gcalEventId: 'gcal-existing',
    });
  });
});
