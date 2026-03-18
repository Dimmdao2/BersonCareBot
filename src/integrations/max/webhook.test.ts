import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerMaxWebhookRoutes } from './webhook.js';

vi.mock('./config.js', () => ({ maxConfig: { webhookSecret: '' } }));

/** Real MAX payload: message.body.text, recipient, sender. */
describe('max webhook', () => {
  it('returns 400 for invalid body', async () => {
    const eventGateway = { handleIncomingEvent: vi.fn() };
    const app = Fastify();
    await registerMaxWebhookRoutes(app, { eventGateway });
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/max',
      payload: { update_type: 'invalid', timestamp: 0 },
    });
    expect(res.statusCode).toBe(400);
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
});
