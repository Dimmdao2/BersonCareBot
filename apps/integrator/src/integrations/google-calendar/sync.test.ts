import { describe, expect, it, vi } from 'vitest';
import nock from 'nock';
import { mapRubitimeEventToGoogleEvent, syncAppointmentToCalendar } from './sync.js';

describe('google calendar sync', () => {
  it('maps rubitime event to google event fields (naive datetime = business offset MSK default)', () => {
    const mapped = mapRubitimeEventToGoogleEvent({
      action: 'created',
      rubRecordId: 'rec-1',
      recordAt: '2026-04-01 10:00:00',
      clientName: 'Иванов Иван',
      record: {
        service_title: 'ЛФК',
        duration_minutes: 45,
      },
    });

    expect(mapped).toEqual({
      summary: 'Иванов Иван — ЛФК',
      startDateTime: '2026-04-01T07:00:00.000Z',
      endDateTime: '2026-04-01T07:45:00.000Z',
      description: 'Rubitime record: rec-1',
    });
  });

  it('preserves explicit Zulu ISO without shifting', () => {
    const mapped = mapRubitimeEventToGoogleEvent({
      action: 'created',
      rubRecordId: 'rec-z',
      recordAt: '2026-04-01T10:00:00.000Z',
    });
    expect(mapped?.startDateTime).toBe('2026-04-01T10:00:00.000Z');
  });

  it('respects numeric timezone offset in ISO string', () => {
    const mapped = mapRubitimeEventToGoogleEvent({
      action: 'created',
      rubRecordId: 'rec-o',
      recordAt: '2026-04-01T10:00:00+03:00',
    });
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
});
