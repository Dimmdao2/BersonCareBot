import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerVkWebhookRoutes } from './webhook.js';

const configured = {
  enabled: true,
  communityAccessToken: 'token',
  callbackSecret: 'callback-secret',
  confirmationToken: 'confirmation-token',
};

describe('VK Callback API route', () => {
  it('rejects an unauthenticated callback before the gateway', async () => {
    const app = Fastify();
    const handleIncomingEvent = vi.fn();
    await registerVkWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as never,
      getRuntimeConfig: async () => configured,
    });

    for (const secret of [undefined, 'wrong']) {
      const reply = await app.inject({
        method: 'POST',
        url: '/webhook/vk',
        payload: { type: 'message_new', secret, object: { message: { from_id: 17, peer_id: 17 } } },
      });
      expect(reply.statusCode).toBe(403);
      expect(reply.body).toBe('forbidden');
    }
    expect(handleIncomingEvent).not.toHaveBeenCalled();
  });

  it('rejects unsupported Callback API event types before the gateway', async () => {
    const app = Fastify();
    const handleIncomingEvent = vi.fn();
    await registerVkWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as never,
      getRuntimeConfig: async () => configured,
    });

    const reply = await app.inject({
      method: 'POST',
      url: '/webhook/vk',
      payload: { type: 'wall_post_new', secret: 'callback-secret', object: {} },
    });

    expect(reply.statusCode).toBe(400);
    expect(reply.body).toBe('invalid');
    expect(handleIncomingEvent).not.toHaveBeenCalled();
  });

  it('returns the confirmation token and routes a verified callback once', async () => {
    const app = Fastify();
    const handleIncomingEvent = vi.fn(async () => ({ status: 'accepted' as const }));
    await registerVkWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as never,
      getRuntimeConfig: async () => configured,
    });

    const confirmation = await app.inject({
      method: 'POST',
      url: '/webhook/vk',
      payload: { type: 'confirmation', secret: 'callback-secret' },
    });
    expect(confirmation.statusCode).toBe(200);
    expect(confirmation.body).toBe('confirmation-token');

    const callback = await app.inject({
      method: 'POST',
      url: '/webhook/vk',
      payload: {
        type: 'message_event',
        secret: 'callback-secret',
        event_id: 'provider-1',
        object: { event_id: 'callback-1', user_id: 17, peer_id: 17, payload: 'booking.open' },
      },
    });
    expect(callback.statusCode).toBe(200);
    expect(callback.body).toBe('ok');
    expect(handleIncomingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'callback.received',
        meta: expect.objectContaining({
          source: 'vk',
          dedupFingerprint: { callbackId: 'callback-1:17:17' },
        }),
        payload: expect.objectContaining({
          incoming: expect.objectContaining({
            kind: 'callback',
            chatId: 17,
            channelUserId: 17,
            action: 'booking.open',
            callbackQueryId: 'callback-1:17:17',
          }),
        }),
      }),
    );
  });

  it('accepts the documented message_new envelope and sends it through the common gateway', async () => {
    const app = Fastify();
    const handleIncomingEvent = vi.fn(async () => ({ status: 'accepted' as const }));
    await registerVkWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as never,
      getRuntimeConfig: async () => configured,
    });

    const reply = await app.inject({
      method: 'POST',
      url: '/webhook/vk',
      payload: {
        type: 'message_new',
        group_id: 101,
        event_id: 'provider-message-1',
        v: '5.199',
        secret: 'callback-secret',
        object: {
          message: {
            id: 9,
            conversation_message_id: 4,
            from_id: 17,
            peer_id: 17,
            date: 1_787_286_400,
            text: 'Привет',
          },
          client_info: {},
        },
      },
    });

    expect(reply.statusCode).toBe(200);
    expect(reply.body).toBe('ok');
    expect(handleIncomingEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message.received',
        meta: expect.objectContaining({
          source: 'vk',
          dedupFingerprint: { eventId: 'provider-message-1' },
        }),
        payload: expect.objectContaining({
          incoming: expect.objectContaining({
            kind: 'message',
            channelId: '17',
            chatId: 17,
            text: 'Привет',
          }),
        }),
      }),
    );
  });
});
