import { describe, expect, it, vi } from 'vitest';
import type { IncomingEvent } from '../contracts/events.js';

const baseEvent: IncomingEvent = {
  type: 'message.received',
  meta: {
    eventId: 'evt-1',
    occurredAt: '2026-03-03T00:00:00.000Z',
    source: 'telegram',
  },
  payload: {},
};

describe('eventGateway', () => {
  it('returns dropped when idempotency denies', async () => {
    const { createEventGateway } = await import('./index.js');
    const gateway = createEventGateway({
      idempotencyPort: { tryAcquire: vi.fn().mockResolvedValue(false) },
    });

    const result = await gateway.handleIncomingEvent(baseEvent);
    expect(result.status).toBe('dropped');
    if (result.status === 'dropped') {
      expect(result.reason).toBe('DUPLICATE');
    }
  });

  it('returns accepted for valid non-duplicate event', async () => {
    const { createEventGateway } = await import('./index.js');
    const gateway = createEventGateway({
      idempotencyPort: { tryAcquire: vi.fn().mockResolvedValue(true) },
    });

    const result = await gateway.handleIncomingEvent(baseEvent);
    expect(result.status).toBe('accepted');
    if (result.status === 'accepted') {
      expect(result.event.meta.eventId).toBe('evt-1');
    }
  });

  it('returns accepted for schedule.tick events', async () => {
    const { createEventGateway } = await import('./index.js');
    const gateway = createEventGateway({
      idempotencyPort: { tryAcquire: vi.fn().mockResolvedValue(true) },
    });
    const tickEvent: IncomingEvent = {
      type: 'schedule.tick',
      meta: {
        eventId: 'wrk:tick-1',
        occurredAt: '2026-03-03T00:00:00.000Z',
        source: 'worker',
      },
      payload: { trigger: 'schedule.tick' },
    };

    const result = await gateway.handleIncomingEvent(tickEvent);
    expect(result.status).toBe('accepted');
  });

  it('returns rejected for invalid envelope', async () => {
    const { createEventGateway } = await import('./index.js');
    const gateway = createEventGateway();
    const invalidEvent = {
      type: 'message.received',
      meta: { occurredAt: 'invalid-iso', source: 'telegram' },
      payload: {},
    } as unknown as IncomingEvent;

    const result = await gateway.handleIncomingEvent(invalidEvent);
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason).toBe('INVALID_ENVELOPE');
    }
  });

  it('returns rejected when rate limited', async () => {
    vi.resetModules();
    vi.doMock('./rateLimit.js', () => ({
      checkGatewayRateLimit: async () => ({ allowed: false, reason: 'RATE_LIMIT' }),
    }));
    const { createEventGateway } = await import('./index.js');
    const gateway = createEventGateway();

    const result = await gateway.handleIncomingEvent(baseEvent);
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason).toBe('RATE_LIMIT');
    }
    vi.doUnmock('./rateLimit.js');
  });
});
