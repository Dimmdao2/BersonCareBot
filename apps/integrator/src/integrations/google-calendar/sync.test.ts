import { describe, expect, it, vi } from 'vitest';
import nock from 'nock';
import { formatPhoneHashtag } from './calendarDescription.js';
import { mapRubitimeEventToGoogleEvent, syncAppointmentToCalendar } from './sync.js';

vi.mock('../../infra/db/repos/bookingCalendarMap.js', () => ({
  getGoogleEventIdByRubitimeRecordId: vi.fn().mockResolvedValue('gcal-existing'),
  deleteBookingCalendarMap: vi.fn().mockResolvedValue(undefined),
  upsertBookingCalendarMap: vi.fn().mockResolvedValue(undefined),
}));

describe('google calendar description (exported helpers)', () => {
  it('formats phone hashtag', () => {
    expect(formatPhoneHashtag('+79189000792')).toBe('#+79189000792');
  });
});

describe('google calendar sync', () => {
  it('maps rubitime event to google event fields (naive datetime = business offset MSK default)', async () => {
    const mapped = await mapRubitimeEventToGoogleEvent(
      {
        action: 'created',
        rubRecordId: 'rec-1',
        recordAt: '2026-04-01 10:00:00',
        clientName: 'Иванов Иван',
        record: {
          service_title: 'ЛФК',
          duration_minutes: 45,
          phone: '+79991234567',
        },
      },
      { displayTimeZone: 'Europe/Moscow' },
    );

    expect(mapped).toEqual({
      summary: 'Иванов Иван',
      startDateTime: '2026-04-01T07:00:00.000Z',
      endDateTime: '2026-04-01T07:45:00.000Z',
      description: '#+79991234567',
    });
  });

  it('prefixes summary with cancel marker when titleMarker is cancelled', async () => {
    const mapped = await mapRubitimeEventToGoogleEvent(
      {
        action: 'updated',
        rubRecordId: 'rec-x',
        recordAt: '2026-04-01T10:00:00.000Z',
        clientName: 'Иванов Иван',
        titleMarker: 'cancelled',
      },
      { displayTimeZone: 'Europe/Moscow' },
    );
    expect(mapped?.summary).toBe('❌ Иванов Иван');
  });

  it('puts client comment in calendar description when present', async () => {
    const mapped = await mapRubitimeEventToGoogleEvent(
      {
        action: 'created',
        rubRecordId: 'rec-comments',
        recordAt: '2026-04-01 10:00:00',
        clientName: 'Иванов Иван',
        record: {
          service_title: 'ЛФК',
          duration_minutes: 45,
          comment: 'Нужна раскладка',
          phone: '+79991234567',
        },
      },
      { displayTimeZone: 'Europe/Moscow' },
    );
    expect(mapped?.description).toBe('#+79991234567\n\nНужна раскладка');
  });

  it('preserves explicit Zulu ISO without shifting', async () => {
    const mapped = await mapRubitimeEventToGoogleEvent(
      {
        action: 'created',
        rubRecordId: 'rec-z',
        recordAt: '2026-04-01T10:00:00.000Z',
      },
      { displayTimeZone: 'Europe/Moscow' },
    );
    expect(mapped?.startDateTime).toBe('2026-04-01T10:00:00.000Z');
  });

  it('respects numeric timezone offset in ISO string', async () => {
    const mapped = await mapRubitimeEventToGoogleEvent(
      {
        action: 'created',
        rubRecordId: 'rec-o',
        recordAt: '2026-04-01T10:00:00+03:00',
      },
      { displayTimeZone: 'Europe/Moscow' },
    );
    expect(mapped?.startDateTime).toBe('2026-04-01T07:00:00.000Z');
  });

  it('does not call google client when feature flag is disabled', async () => {
    const client = {
      upsertEvent: vi.fn(),
      deleteEvent: vi.fn(),
    };
    nock.disableNetConnect();
    try {
      await syncAppointmentToCalendar(
        {
          action: 'created',
          rubRecordId: 'rec-2',
          recordAt: '2026-04-01 10:00:00',
        },
        {
          client,
          config: {
            enabled: false,
            clientId: '',
            clientSecret: '',
            redirectUri: '',
            calendarId: '',
            refreshToken: '',
          },
        },
      );
    } finally {
      nock.enableNetConnect();
    }
    expect(client.upsertEvent).not.toHaveBeenCalled();
    expect(client.deleteEvent).not.toHaveBeenCalled();
  });

  it('canceled action deletes mapped event idempotently (410 handled in client)', async () => {
    const deleteEvent = vi.fn().mockResolvedValue(undefined);
    const client = { upsertEvent: vi.fn(), deleteEvent };
    await syncAppointmentToCalendar(
      { action: 'canceled', rubRecordId: 'rec-cancel-410' },
      {
        client,
        config: {
          enabled: true,
          clientId: 'id',
          clientSecret: 'secret',
          redirectUri: 'http://localhost/oauth',
          calendarId: 'cal',
          refreshToken: 'rt',
        },
      },
    );
    expect(deleteEvent).toHaveBeenCalledWith('gcal-existing');
  });
});

describe('syncCanonicalAppointmentToCalendar', () => {
  it('uses be: map key helper', async () => {
    const { canonicalCalendarMapKey } = await import('./sync.js');
    expect(canonicalCalendarMapKey('appt-1')).toBe('be:appt-1');
  });
});
