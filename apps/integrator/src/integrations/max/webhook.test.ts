import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerMaxWebhookRoutes } from './webhook.js';

vi.mock('./config.js', () => ({ maxConfig: { webhookSecret: '' } }));

/** Real MAX payload: message.body.text, recipient, sender. */
describe('max webhook', () => {
  it('returns 200 with ok:false for invalid body (always 200 to avoid provider retries)', async () => {
    const eventGateway = { handleIncomingEvent: vi.fn() };
    const app = Fastify();
    await registerMaxWebhookRoutes(app, { eventGateway });
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
    await registerMaxWebhookRoutes(app, { eventGateway: { handleIncomingEvent: eventGateway } });
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
    await registerMaxWebhookRoutes(app, { eventGateway: { handleIncomingEvent: eventGateway } });
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
});
