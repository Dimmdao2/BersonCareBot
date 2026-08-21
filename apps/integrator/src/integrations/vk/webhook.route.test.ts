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

    const reply = await app.inject({ method: 'POST', url: '/webhook/vk', payload: { type: 'message_new', secret: 'wrong', object: { from_id: 17, peer_id: 17 } } });
    expect(reply.statusCode).toBe(403);
    expect(reply.body).toBe('forbidden');
    expect(handleIncomingEvent).not.toHaveBeenCalled();
  });

  it('returns the confirmation token and routes a verified callback once', async () => {
    const app = Fastify();
    const handleIncomingEvent = vi.fn(async () => ({ status: 'accepted' as const }));
    await registerVkWebhookRoutes(app, {
      eventGateway: { handleIncomingEvent } as never,
      getRuntimeConfig: async () => configured,
    });

    const confirmation = await app.inject({ method: 'POST', url: '/webhook/vk', payload: { type: 'confirmation', secret: 'callback-secret' } });
    expect(confirmation.statusCode).toBe(200);
    expect(confirmation.body).toBe('confirmation-token');

    const callback = await app.inject({ method: 'POST', url: '/webhook/vk', payload: { type: 'message_event', secret: 'callback-secret', event_id: 'provider-1', object: { event_id: 'callback-1', user_id: 17, peer_id: 17, payload: 'booking.open' } } });
    expect(callback.statusCode).toBe(200);
    expect(callback.body).toBe('ok');
    expect(handleIncomingEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'callback.received', meta: expect.objectContaining({ source: 'vk', dedupFingerprint: { callbackId: 'callback-1:17:17' } }) }));
  });
});
