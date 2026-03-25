import { beforeEach, describe, expect, it, vi } from 'vitest';

const syncAppointmentToCalendarMock = vi.hoisted(() => vi.fn());

vi.mock('../google-calendar/sync.js', () => ({
  syncAppointmentToCalendar: (...args: unknown[]) => syncAppointmentToCalendarMock(...args),
}));

import {
  buildUserEmailAutobindWebappEvent,
  rubitimeIncomingToEvent,
  syncRubitimeWebhookBodyToGoogleCalendar,
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
    await syncRubitimeWebhookBodyToGoogleCalendar(body);
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
    await syncRubitimeWebhookBodyToGoogleCalendar(body);
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
      clientFirstName: 'Иван Петрович',
      clientLastName: 'Иванов',
    });
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
