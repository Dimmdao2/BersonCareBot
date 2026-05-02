import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncAppointmentToCalendarMock = vi.hoisted(() => vi.fn());

vi.mock('../google-calendar/sync.js', () => ({
  syncAppointmentToCalendar: (...args: unknown[]) => syncAppointmentToCalendarMock(...args),
}));

import {
  buildUserEmailAutobindWebappEvent,
  rubitimeIncomingToEvent,
  syncRubitimeWebhookBodyToGoogleCalendar,
  toRubitimeIncoming,
} from './connector.js';

describe('Rubitime email autobind webapp event', () => {
  it('emits user.email.autobind for event-create-record with phone+email', () => {
    const body = {
      from: 'rubitime',
      event: 'event-create-record' as const,
      data: {
        record: { id: '1', phone: '+79990001122', email: 'ivan@example.com' },
      },
    };
    const ev = buildUserEmailAutobindWebappEvent(body);
    expect(ev?.eventType).toBe('user.email.autobind');
    expect(ev?.payload).toEqual({ phoneNormalized: '+79990001122', email: 'ivan@example.com' });
    expect(ev?.idempotencyKey).toContain('rubitime:email-autobind:');
  });

  it('returns null for event-update-record', () => {
    const body = {
      from: 'rubitime',
      event: 'event-update-record' as const,
      data: {
        record: { id: '1', phone: '+79990001122', email: 'ivan@example.com' },
      },
    };
    expect(buildUserEmailAutobindWebappEvent(body)).toBeNull();
  });
});

describe('rubitime Google Calendar sync (connector)', () => {
  beforeEach(() => {
    syncAppointmentToCalendarMock.mockReset();
  });

  it('invokes calendar sync from validated webhook body (connector layer)', async () => {
    const body = {
      from: 'rubitime',
      event: 'event-create-record' as const,
      data: {
        record: {
          id: '99',
          record: '2026-01-01 10:00:00',
          name: 'Test',
        },
      },
    };
    await syncRubitimeWebhookBodyToGoogleCalendar(toRubitimeIncoming(body));
    expect(syncAppointmentToCalendarMock).toHaveBeenCalledTimes(1);
    expect(syncAppointmentToCalendarMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'created',
        rubRecordId: '99',
        recordAt: '2026-01-01 10:00:00',
      }),
    );
  });

  it('does not call sync when record id is missing', async () => {
    const body = {
      from: 'rubitime',
      event: 'event-create-record' as const,
      data: { record: { record: '2026-01-01 10:00:00' } },
    };
    await syncRubitimeWebhookBodyToGoogleCalendar(toRubitimeIncoming(body));
    expect(syncAppointmentToCalendarMock).not.toHaveBeenCalled();
  });
});

describe('rubitimeIncomingToEvent', () => {
  it('maps validated body into normalized incoming payload for orchestrator', () => {
    const body = {
      from: 'rubitime',
      event: 'event-update-record' as const,
      data: {
        record: {
          id: 'rec-1',
          phone: '+79990001122',
          datetime: '2026-03-06T12:00:00.000Z',
          updated_at: '2026-03-06T12:05:00.000Z',
          status_name: 'Записан',
          status: 'custom',
        },
      },
    };

    const event = rubitimeIncomingToEvent({
      body,
      correlationId: 'corr-1',
      eventId: 'evt-1',
    });

    expect(event.type).toBe('webhook.received');
    expect(event.meta.source).toBe('rubitime');
    expect(event.meta.correlationId).toBe('corr-1');
    expect(event.meta.eventId).toBe('evt-1');
    expect(event.meta.dedupFingerprint).toEqual({
      entity: 'record',
      action: 'updated',
      recordId: 'rec-1',
      status: 'recorded',
      recordAt: '2026-03-06T12:00:00.000Z',
      updatedAt: '2026-03-06T12:05:00.000Z',
    });
    expect(event.payload).toMatchObject({
      body,
      incoming: {
        entity: 'record',
        action: 'updated',
        status: 'recorded',
        statusCode: 'custom',
        recordId: 'rec-1',
        phone: '+79990001122',
        recordAt: '2026-03-06T12:00:00.000Z',
        updatedAt: '2026-03-06T12:05:00.000Z',
      },
    });
  });

  it('parses name, email, branch_id from record into client and branch fields', () => {
    const body = {
      from: 'rubitime',
      event: 'event-create-record' as const,
      data: {
        record: {
          id: '42',
          phone: '+79991234567',
          record: '2026-04-01 10:00:00',
          name: 'Иванов Иван Петрович',
          email: 'ivan@example.com',
          branch_id: 101,
          branch_name: 'Филиал Центр',
        },
      },
    };

    const event = rubitimeIncomingToEvent({
      body,
      correlationId: 'c1',
      eventId: 'e1',
    });

    const incoming = event.payload.incoming as Record<string, unknown>;
    expect(incoming).toMatchObject({
      clientName: 'Иванов Иван Петрович',
      clientEmail: 'ivan@example.com',
      integratorBranchId: '101',
      branchName: 'Филиал Центр',
    });
    expect(incoming.clientFirstName).toBeUndefined();
    expect(incoming.clientLastName).toBeUndefined();
  });

  it('splits two-word name into first/last', () => {
    const body = {
      from: 'rubitime',
      event: 'event-create-record' as const,
      data: {
        record: {
          id: '44',
          phone: '+79990001122',
          record: '2026-04-01 10:00:00',
          name: 'Иванов Иван',
        },
      },
    };

    const event = rubitimeIncomingToEvent({
      body,
      correlationId: 'c3',
      eventId: 'e3',
    });

    const incoming = event.payload.incoming as Record<string, unknown>;
    expect(incoming.clientName).toBe('Иванов Иван');
    expect(incoming.clientLastName).toBe('Иванов');
    expect(incoming.clientFirstName).toBe('Иван');
  });

  it('handles single-word name and numeric branch_id', () => {
    const body = {
      from: 'rubitime',
      event: 'event-update-record' as const,
      data: {
        record: {
          id: '43',
          phone: '+79990000000',
          name: 'Мария',
          branch_id: 2,
        },
      },
    };

    const event = rubitimeIncomingToEvent({
      body,
      correlationId: 'c2',
      eventId: 'e2',
    });

    const incoming = event.payload.incoming as Record<string, unknown>;
    expect(incoming.clientName).toBe('Мария');
    expect(incoming.clientFirstName).toBe('Мария');
    expect(incoming.clientLastName).toBeUndefined();
    expect(incoming.integratorBranchId).toBe('2');
  });
});

describe('toRubitimeIncoming webhook comment merge', () => {
  it('merges top-level comment into record when nested record omits it', () => {
    const body = {
      from: 'rubitime',
      event: 'event-create-record' as const,
      data: {
        comment: 'Из родителя',
        record: {
          id: '1',
          record: '2026-01-01 10:00:00',
          name: 'Test',
        },
      },
    };
    const inc = toRubitimeIncoming(body);
    expect((inc.record as Record<string, unknown>).comment).toBe('Из родителя');
  });

  it('keeps nested comment when both parent and nested record have comment', () => {
    const body = {
      from: 'rubitime',
      event: 'event-create-record' as const,
      data: {
        comment: 'Parent',
        record: {
          id: '1',
          record: '2026-01-01 10:00:00',
          comment: 'Nested',
        },
      },
    };
    expect((toRubitimeIncoming(body).record as Record<string, unknown>).comment).toBe('Nested');
  });

  it('merges top-level admin_comment into record when nested record omits it', () => {
    const body = {
      from: 'rubitime',
      event: 'event-create-record' as const,
      data: {
        admin_comment: 'Заметка админа с родителя',
        record: {
          id: '1',
          record: '2026-01-01 10:00:00',
          name: 'Test',
        },
      },
    };
    expect((toRubitimeIncoming(body).record as Record<string, unknown>).admin_comment).toBe(
      'Заметка админа с родителя',
    );
  });
});

describe('normalizeRubitimeStatus via toRubitimeIncoming', () => {
  function statusFor(code: number | string, title?: string) {
    const body = {
      from: 'rubitime',
      event: 'event-update-record' as const,
      data: {
        record: { id: '1', status: code, ...(title ? { status_title: title } : {}) },
      },
    };
    return (toRubitimeIncoming(body) as Record<string, unknown>).status;
  }

  it.each([
    [0, 'recorded'],
    ['0', 'recorded'],
    [1, 'in_service'],
    [2, 'completed'],
    [3, 'awaiting_prepayment'],
    [4, 'canceled'],
    [5, 'awaiting_confirmation'],
    [6, 'in_cart'],
    [7, 'moved_awaiting'],
  ])('numeric status %s -> %s', (code, expected) => {
    expect(statusFor(code)).toBe(expected);
  });

  it('falls back to status_title text matching', () => {
    expect(statusFor('custom', 'Записан')).toBe('recorded');
    expect(statusFor('custom', 'Отменен клиентом')).toBe('canceled');
    expect(statusFor('custom', 'Ожидает подтверждения')).toBe('awaiting_confirmation');
    expect(statusFor('custom', 'Перенос записи')).toBe('moved_awaiting');
  });

  it('returns undefined for unknown status', () => {
    expect(statusFor('custom', 'Что-то новое')).toBeUndefined();
  });
});
