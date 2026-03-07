import { describe, expect, it, vi } from 'vitest';
import type { ActionResult, BaseContext, DomainContext, IncomingEvent, Step } from '../contracts/index.js';
import { handleIncomingEvent } from './handleIncomingEvent.js';

describe('handleIncomingEvent (v3)', () => {
  it('builds context, resolves script, executes actions and aggregates outputs', async () => {
    const event: IncomingEvent = {
      type: 'webhook.received',
      meta: {
        eventId: 'evt-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'source-a',
      },
      payload: { body: { event: 'event-create-record' } },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
    };

    const context: DomainContext = {
      event,
      nowIso: '2026-03-05T12:00:00.000Z',
      values: {},
      base: baseContext,
    };

    const buildBaseContext = vi.fn().mockResolvedValue(baseContext);
    const buildPlan = vi.fn().mockResolvedValue([
      { id: 's1', kind: 'booking.upsert', mode: 'sync', payload: { externalRecordId: 'rec-1' } },
      { id: 's2', kind: 'message.compose', mode: 'async', payload: { text: 'hello' } },
    ]) as unknown as () => Promise<Step[]>;

    const executeAction = vi.fn<
      (action: { id: string }, context: DomainContext) => Promise<ActionResult>
    >().mockImplementation(async (action) => {
      if (action.id === 's1') {
        return {
          actionId: 's1',
          status: 'success',
          writes: [{ type: 'booking.upsert', params: { externalRecordId: 'rec-1' } }],
        };
      }
      return {
        actionId: 's2',
        status: 'success',
        intents: [{
          type: 'message.send',
          meta: {
            eventId: 'out-1',
            occurredAt: '2026-03-05T12:00:00.000Z',
            source: 'source-a',
          },
          payload: { message: { text: 'hello' } },
        }],
      };
    });

    const result = await handleIncomingEvent(event, {
      buildBaseContext,
      buildPlan,
      executeAction,
    });

    expect(buildBaseContext).toHaveBeenCalledTimes(1);
    expect(buildPlan).toHaveBeenCalledTimes(1);
    expect(executeAction).toHaveBeenCalledTimes(2);
    expect(result.writes.length).toBe(1);
    expect(result.intents.length).toBe(1);
  });

  it('loads conversation context from read port and passes it into buildPlan', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-ctx-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          channelId: '123',
        },
      },
    };

    const readPort = {
      readDb: vi.fn().mockResolvedValue({
        channelId: '123',
        phoneNormalized: '+79990001122',
        userState: 'waiting_for_question',
      }),
    };

    const buildPlan = vi.fn().mockResolvedValue([]);

    await handleIncomingEvent(event, {
      readPort,
      buildPlan,
      executeAction: vi.fn().mockResolvedValue({ actionId: 'none', status: 'success' }),
    });

    expect(readPort.readDb).toHaveBeenCalledWith({
      type: 'user.byChannelId',
      params: { channelId: '123' },
    });
    expect(buildPlan).toHaveBeenCalledWith({
      event,
      context: expect.objectContaining({
        conversationState: 'waiting_for_question',
        linkedPhone: true,
      }),
    });
  });

  it('passes generic facts through base context without interpreting them', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-facts-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: {
          channelId: '123',
        },
      },
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
      facts: {
        menu: {
          target: 'bookings',
        },
      },
    };

    const buildPlan = vi.fn().mockResolvedValue([]);

    await handleIncomingEvent(event, {
      buildBaseContext: vi.fn().mockResolvedValue(baseContext),
      buildPlan,
      executeAction: vi.fn().mockResolvedValue({ actionId: 'none', status: 'success' }),
    });

    expect(buildPlan).toHaveBeenCalledWith({
      event,
      context: expect.objectContaining({
        facts: {
          menu: {
            target: 'bookings',
          },
        },
      }),
    });
  });

  it('loads generic facts from the event payload into base context', async () => {
    const event: IncomingEvent = {
      type: 'message.received',
      meta: {
        eventId: 'evt-facts-2',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {
        incoming: { channelId: '123' },
        facts: {
          links: {
            bookingUrl: 'https://example.test/open',
          },
        },
      },
    };

    const buildPlan = vi.fn().mockResolvedValue([]);

    await handleIncomingEvent(event, {
      buildPlan,
      executeAction: vi.fn().mockResolvedValue({ actionId: 'none', status: 'success' }),
    });

    expect(buildPlan).toHaveBeenCalledWith({
      event,
      context: expect.objectContaining({
        facts: {
          links: {
            bookingUrl: 'https://example.test/open',
          },
        },
      }),
    });
  });

  it('carries execution values forward between scenario steps', async () => {
    const event: IncomingEvent = {
      type: 'callback.received',
      meta: {
        eventId: 'evt-values-1',
        occurredAt: '2026-03-05T12:00:00.000Z',
        source: 'telegram',
      },
      payload: {},
    };

    const baseContext: BaseContext = {
      actor: { isAdmin: false },
      identityLinks: [],
    };

    const buildPlan = vi.fn().mockResolvedValue([
      { id: 's1', kind: 'notifications.toggle', mode: 'sync', payload: {} },
      { id: 's2', kind: 'message.edit', mode: 'async', payload: {} },
    ]) as unknown as () => Promise<Step[]>;

    const executeAction = vi.fn<
      (action: { id: string }, context: DomainContext) => Promise<ActionResult>
    >().mockImplementation(async (action, context) => {
      if (action.id === 's1') {
        return {
          actionId: 's1',
          status: 'success',
          values: {
            notifications: {
              notify_spb: true,
              notify_msk: false,
              notify_online: false,
            },
          },
        };
      }

      expect(context.values).toMatchObject({
        notifications: {
          notify_spb: true,
          notify_msk: false,
          notify_online: false,
        },
      });

      return {
        actionId: 's2',
        status: 'success',
      };
    });

    const result = await handleIncomingEvent(event, {
      buildBaseContext: vi.fn().mockResolvedValue(baseContext),
      buildPlan,
      executeAction,
    });

    expect(executeAction).toHaveBeenCalledTimes(2);
    expect(result.context.values).toMatchObject({
      notifications: {
        notify_spb: true,
        notify_msk: false,
        notify_online: false,
      },
    });
  });
});
