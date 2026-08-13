import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IdempotencyPort, OutgoingIntent } from '../../kernel/contracts/index.js';
import { registerBersoncareRequestContactRoute } from './requestContactRoute.js';

const SHARED_SECRET = 'request-contact-route-test-secret';
const ROUTE = '/api/bersoncare/request-contact';
const apps: FastifyInstance[] = [];

function protocolHeaders(rawBody: string): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac('sha256', SHARED_SECRET)
    .update(`${timestamp}.${rawBody}`)
    .digest('base64url');
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': signature,
  };
}

function idempotencyPort(): IdempotencyPort {
  const acquired = new Set<string>();
  return {
    tryAcquire: async (key: string) => {
      if (acquired.has(key)) return false;
      acquired.add(key);
      return true;
    },
    release: async (key: string) => {
      acquired.delete(key);
    },
  };
}

async function injectSigned(app: FastifyInstance, payload: unknown) {
  const rawBody = JSON.stringify(payload);
  return app.inject({
    method: 'POST',
    url: ROUTE,
    headers: protocolHeaders(rawBody),
    payload: rawBody,
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('POST /api/bersoncare/request-contact', () => {
  it('dispatches the global pre-login handshake without organization or identity writes', async () => {
    const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const app = Fastify({ logger: false });
    apps.push(app);
    await registerBersoncareRequestContactRoute(app, {
      dispatchPort: { dispatchOutgoing },
      sharedSecret: SHARED_SECRET,
      isAuthChannelEnabled: async () => true,
      idempotencyPort: idempotencyPort(),
    });

    const payload = {
      channel: 'telegram',
      recipientId: '123456789',
      idempotencyKey: 'request-contact-1',
    };
    const first = await injectSigned(app, payload);
    const duplicate = await injectSigned(app, payload);

    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ ok: true, status: 'accepted' });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toEqual({ ok: true, status: 'duplicate' });
    expect(dispatchOutgoing).toHaveBeenCalledOnce();
    expect(dispatchOutgoing.mock.calls[0]?.[0]).toMatchObject({
      meta: { outboundCapability: 'contact_handshake' },
      payload: {
        recipient: { chatId: '123456789' },
        delivery: { channels: ['telegram'] },
      },
    });
  });
});
