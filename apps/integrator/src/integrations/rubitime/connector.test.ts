import { describe, expect, it } from 'vitest';
import { rubitimeIncomingToEvent } from './connector.js';

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
