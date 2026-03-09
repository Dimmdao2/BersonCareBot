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
          status_name: 'accepted',
          status: 'confirmed',
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
    expect(event.payload).toMatchObject({
      body,
      incoming: {
        entity: 'record',
        action: 'updated',
        status: 'recorded',
        statusCode: 'confirmed',
        recordId: 'rec-1',
        phone: '+79990001122',
        recordAt: '2026-03-06T12:00:00.000Z',
      },
    });
  });
});
