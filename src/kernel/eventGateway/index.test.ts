import { describe, expect, it, vi } from 'vitest';
import type { IncomingEvent } from '../contracts/events.js';

const baseEvent: IncomingEvent = {
  type: 'message.received',
  meta: {
    eventId: 'evt-1',
    occurredAt: '2026-03-03T00:00:00.000Z',
    source: 'source-a',
  },
  payload: {},
};

describe('eventGateway', () => {
  it('runs pipeline once for accepted event', async () => {
    const { createEventGateway } = await import('./index.js');
    const run = vi.fn().mockResolvedValue(undefined);
    const gateway = createEventGateway({
      idempotencyPort: { tryAcquire: vi.fn().mockResolvedValue(true) },
      pipeline: { run },
    });

    const result = await gateway.handleIncomingEvent(baseEvent);
    expect(result.status).toBe('accepted');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not run pipeline when event is dropped', async () => {
    const { createEventGateway } = await import('./index.js');
    const run = vi.fn().mockResolvedValue(undefined);
    const gateway = createEventGateway({
      idempotencyPort: { tryAcquire: vi.fn().mockResolvedValue(false) },
      pipeline: { run },
    });

    const result = await gateway.handleIncomingEvent(baseEvent);
    expect(result.status).toBe('dropped');
    expect(run).not.toHaveBeenCalled();
  });

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
      meta: { occurredAt: 'invalid-iso', source: 'source-a' },
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
    const run = vi.fn().mockResolvedValue(undefined);
    const gateway = createEventGateway();
    const gatewayWithPipeline = createEventGateway({ pipeline: { run } });

    const result = await gateway.handleIncomingEvent(baseEvent);
    expect(result.status).toBe('rejected');
    if (result.status === 'rejected') {
      expect(result.reason).toBe('RATE_LIMIT');
    }

    const resultWithPipeline = await gatewayWithPipeline.handleIncomingEvent(baseEvent);
    expect(resultWithPipeline.status).toBe('rejected');
    expect(run).not.toHaveBeenCalled();
    vi.doUnmock('./rateLimit.js');
  });
});
