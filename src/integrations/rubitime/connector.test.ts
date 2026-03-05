import { describe, expect, it } from 'vitest';
import { rubitimeIncomingToEvent, rubitimeReqSuccessToEvent } from './connector.js';

describe('rubitimeIncomingToEvent', () => {
  it('wraps validated body into IncomingEvent', () => {
    const body = {
      from: 'rubitime',
      event: 'event-update-record' as const,
      data: { id: 'rec-1', phone: '+79990001122' },
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
    expect(event.payload).toMatchObject({ body });
  });

  it('maps reqSuccess iframe request to IncomingEvent', () => {
    const event = rubitimeReqSuccessToEvent({
      recordSuccess: 'rec-7',
      clientIp: '127.0.0.1',
      correlationId: 'corr-iframe',
      eventId: 'evt-iframe',
    });

    expect(event.type).toBe('webhook.received');
    expect(event.meta.source).toBe('rubitime');
    expect(event.payload).toMatchObject({
      kind: 'reqsuccess.iframe',
      recordSuccess: 'rec-7',
      clientIp: '127.0.0.1',
    });
  });
});
