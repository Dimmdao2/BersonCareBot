import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { buildMaxFacts, registerMaxWebhookRoutes } from './webhook.js';
import type { MaxUpdateValidated } from './schema.js';

vi.mock('./config.js', () => ({
  maxConfig: { enabled: true, webhookSecret: '', adminUserId: 888001 },
}));

describe('buildMaxFacts', () => {
  const messageUpdate = (senderUserId: number): MaxUpdateValidated => ({
    update_type: 'message_created',
    timestamp: 1,
    message: {
      recipient: { chat_id: 100, user_id: senderUserId },
      body: { text: 'Hi' },
      sender: { user_id: senderUserId },
    },
  });

  it('isAdmin true for env admin user id', async () => {
    const facts = await buildMaxFacts(messageUpdate(888001), undefined, undefined);
    expect(facts.isAdmin).toBe(true);
  });

  it('isAdmin true when sender id is in doctor list from resolver', async () => {
    const resolve = vi.fn(async () => true);
    const facts = await buildMaxFacts(messageUpdate(777666), undefined, undefined, resolve);
    expect(facts.isAdmin).toBe(true);
    expect(resolve).toHaveBeenCalledWith('max', '777666');
  });
});

/** Real MAX payload: message.body.text, recipient, sender. */
describe('max webhook', () => {
  it('returns 200 with ok:false for invalid body (always 200 to avoid provider retries)', async () => {
    const eventGateway = { handleIncomingEvent: vi.fn() };
    const app = Fastify();
    await registerMaxWebhookRoutes(app, {
      eventGateway,
      resolveIntegratorUserIdForMessenger: async () => undefined,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/max',
      payload: { update_type: 'invalid', timestamp: 0 },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toMatchObject({ ok: false, error: 'Invalid webhook body' });
    expect(eventGateway.handleIncomingEvent).not.toHaveBeenCalled();
  });

  it('returns 200 and calls eventGateway for valid message_created (real payload)', async () => {
    const eventGateway = vi.fn().mockResolvedValue({ status: 'accepted' });
    const app = Fastify();
    await registerMaxWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent: eventGateway },
      resolveIntegratorUserIdForMessenger: async () => undefined,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/max',
      payload: {
        update_type: 'message_created',
        timestamp: 1739184000000,
        message: {
          recipient: { chat_id: 100, user_id: 12345 },
          body: { text: 'Hi' },
          sender: { user_id: 100 },
        },
        user_locale: 'ru',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(eventGateway).toHaveBeenCalledTimes(1);
    const calls = eventGateway.mock.calls;
    const call = calls[0] as [unknown] | undefined;
    expect(call).toBeDefined();
    const event = call![0] as { type: string; meta: { source: string } };
    expect(event.type).toBe('message.received');
    expect(event.meta.source).toBe('max');
  });

  it('maps link payload to start.link action', async () => {
    const eventGateway = vi.fn().mockResolvedValue({ status: 'accepted' });
    const app = Fastify();
    await registerMaxWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent: eventGateway },
      resolveIntegratorUserIdForMessenger: async () => undefined,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/max',
      payload: {
        update_type: 'message_created',
        timestamp: 1739184000000,
        message: {
          recipient: { chat_id: 100 },
          body: { text: '/start link_abC123-_' },
          sender: { user_id: 100 },
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const calls = eventGateway.mock.calls;
    const call = calls[0] as [unknown] | undefined;
    expect(call).toBeDefined();
    const event = call![0] as { payload?: { incoming?: { action?: string; linkSecret?: string } } };
    expect(event.payload?.incoming?.action).toBe('start.link');
    expect(event.payload?.incoming?.linkSecret).toBe('link_abC123-_');
  });

  it('returns 200 ok:true and skips eventGateway when body parses but fromMax is null (message_edited)', async () => {
    const eventGateway = { handleIncomingEvent: vi.fn() };
    const app = Fastify();
    await registerMaxWebhookRoutes(app, {
      eventGateway,
      resolveIntegratorUserIdForMessenger: async () => undefined,
    });
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/max',
      payload: {
        update_type: 'message_edited',
        timestamp: 1,
        message: {
          recipient: { chat_id: 601 },
          body: { mid: 'mid-ed', text: 'edited' },
          sender: { user_id: 601 },
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload)).toEqual({ ok: true });
    expect(eventGateway.handleIncomingEvent).not.toHaveBeenCalled();
  });
});
