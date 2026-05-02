import { describe, expect, it, vi } from 'vitest';
import nock from 'nock';
import {
  buildGoogleCalendarDescriptionFromRubitimeRecord,
  mapRubitimeEventToGoogleEvent,
  syncAppointmentToCalendar,
} from './sync.js';

describe('Google Calendar event description (Rubitime comments)', () => {
  it('formats client and admin lines when both present', () => {
    expect(
      buildGoogleCalendarDescriptionFromRubitimeRecord(
        { comment: 'От клиента', admin_comment: 'От админа' },
        '99',
      ),
    ).toBe('Клиент: От клиента\n\nАдминистратор: От админа');
  });

  it('uses only client line when admin fields empty', () => {
    expect(
      buildGoogleCalendarDescriptionFromRubitimeRecord({ comment: 'Только клиент' }, '1'),
    ).toBe('Клиент: Только клиент');
  });

  it('uses first matching admin key by priority', () => {
    expect(
      buildGoogleCalendarDescriptionFromRubitimeRecord(
        { admin_comment: 'Первый', staff_comment: 'Второй' },
        '2',
      ),
    ).toBe('Администратор: Первый');
    expect(
      buildGoogleCalendarDescriptionFromRubitimeRecord({ staff_comment: 'Только staff' }, '3'),
    ).toBe('Администратор: Только staff');
  });

  it('falls back to Rubitime id when no comments', () => {
    expect(buildGoogleCalendarDescriptionFromRubitimeRecord({}, '42')).toBe('Rubitime #42');
    expect(buildGoogleCalendarDescriptionFromRubitimeRecord(undefined, '42')).toBe('Rubitime #42');
  });

  it('trims whitespace on comment values', () => {
    expect(
      buildGoogleCalendarDescriptionFromRubitimeRecord({ comment: '  x  ', comment_admin: '  y  ' }, '0'),
    ).toBe('Клиент: x\n\nАдминистратор: y');
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
        },
      },
      { displayTimeZone: 'Europe/Moscow' },
    );

    expect(mapped).toEqual({
      summary: 'Иванов Иван — ЛФК',
      startDateTime: '2026-04-01T07:00:00.000Z',
      endDateTime: '2026-04-01T07:45:00.000Z',
      description: 'Rubitime #rec-1',
    });
  });

  it('puts client and admin comments in calendar description when present', async () => {
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
          admin_comment: 'Перенесли окно',
        },
      },
      { displayTimeZone: 'Europe/Moscow' },
    );
    expect(mapped?.description).toBe('Клиент: Нужна раскладка\n\nАдминистратор: Перенесли окно');
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
});
