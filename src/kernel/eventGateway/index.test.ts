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
  it('returns duplicate when idempotency denies', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ reads: [], writes: [], outgoing: [] });
    const { createEventGateway } = await import('./index.js');
    const gateway = createEventGateway({
      orchestrator: { orchestrate },
      idempotencyPort: { tryAcquire: vi.fn().mockResolvedValue(false) },
    });

    const result = await gateway.handleIncomingEvent(baseEvent);
    expect(result.status).toBe('duplicate');
    expect(orchestrate).not.toHaveBeenCalled();
  });

  it('applies writes and dispatches outgoing', async () => {
    const orchestrate = vi.fn().mockResolvedValue({
      reads: [],
      writes: [{ type: 'event.log', params: { foo: 'bar' } }],
      outgoing: [{
        type: 'message.send',
        meta: { eventId: 'evt-1', occurredAt: '2026-03-03T00:00:00.000Z', source: 'telegram' },
        payload: { message: { text: 'hi' } },
      }],
    });
    const writeDb = vi.fn().mockResolvedValue(undefined);
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);

    const { createEventGateway } = await import('./index.js');
    const gateway = createEventGateway({
      orchestrator: { orchestrate },
      writePort: { writeDb },
      dispatchPort: { dispatchOutgoing },
      idempotencyPort: { tryAcquire: vi.fn().mockResolvedValue(true) },
    });

    const result = await gateway.handleIncomingEvent(baseEvent);
    expect(result.status).toBe('processed');
    if (result.status === 'processed') {
      expect(result.writesApplied).toBe(1);
      expect(result.outgoingDispatched).toBe(1);
    }
    expect(writeDb).toHaveBeenCalledTimes(1);
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
  });

  it('forwards debug event to admin when enabled', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ reads: [], writes: [], outgoing: [] });
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const { createEventGateway } = await import('./index.js');
    const gateway = createEventGateway({
      orchestrator: { orchestrate },
      dispatchPort: { dispatchOutgoing },
      idempotencyPort: { tryAcquire: vi.fn().mockResolvedValue(true) },
      debugForwardAllEvents: true,
      debugAdminChatId: 777,
    });

    const result = await gateway.handleIncomingEvent(baseEvent);
    expect(result.status).toBe('processed');
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
    const forwarded = dispatchOutgoing.mock.calls[0]?.[0] as {
      payload?: { recipient?: { chatId?: number }; delivery?: { channels?: string[] } };
    };
    expect(forwarded.payload?.recipient?.chatId).toBe(777);
    expect(forwarded.payload?.delivery?.channels).toEqual(['telegram']);
  });

  it('does not forward debug event for incoming admin chat messages', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ reads: [], writes: [], outgoing: [] });
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const { createEventGateway } = await import('./index.js');
    const gateway = createEventGateway({
      orchestrator: { orchestrate },
      dispatchPort: { dispatchOutgoing },
      idempotencyPort: { tryAcquire: vi.fn().mockResolvedValue(true) },
      debugForwardAllEvents: true,
      debugAdminChatId: 777,
    });
    const adminEvent: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-admin-1',
        occurredAt: '2026-03-03T00:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          kind: 'message',
          chatId: 777,
          telegramId: '777',
          text: 'admin says hi',
          userRow: null,
          userState: 'idle',
        },
      },
    };

    const result = await gateway.handleIncomingEvent(adminEvent);
    expect(result.status).toBe('processed');
    expect(dispatchOutgoing).toHaveBeenCalledTimes(0);
  });

  it('does not forward schedule.tick events to admin debug chat', async () => {
    const orchestrate = vi.fn().mockResolvedValue({ reads: [], writes: [], outgoing: [] });
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const { createEventGateway } = await import('./index.js');
    const gateway = createEventGateway({
      orchestrator: { orchestrate },
      dispatchPort: { dispatchOutgoing },
      idempotencyPort: { tryAcquire: vi.fn().mockResolvedValue(true) },
      debugForwardAllEvents: true,
      debugAdminChatId: 777,
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
    expect(result.status).toBe('processed');
    expect(dispatchOutgoing).toHaveBeenCalledTimes(0);
  });

  it('returns failed when rate limited', async () => {
    vi.resetModules();
    vi.doMock('./rateLimit.js', () => ({
      checkGatewayRateLimit: async () => ({ allowed: false, reason: 'RATE_LIMIT' }),
    }));
    const orchestrate = vi.fn().mockResolvedValue({ reads: [], writes: [], outgoing: [] });
    const { createEventGateway } = await import('./index.js');
    const gateway = createEventGateway({ orchestrator: { orchestrate } });

    const result = await gateway.handleIncomingEvent(baseEvent);
    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error).toBe('RATE_LIMIT');
    }
    expect(orchestrate).not.toHaveBeenCalled();
    vi.doUnmock('./rateLimit.js');
  });
});
