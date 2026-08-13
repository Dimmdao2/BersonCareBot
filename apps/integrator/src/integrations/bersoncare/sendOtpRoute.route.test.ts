import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OutgoingIntent } from '../../kernel/contracts/index.js';
import { registerBersoncareSendOtpRoute } from './sendOtpRoute.js';

const SHARED_SECRET = 'send-otp-route-test-secret';
const ROUTE = '/api/bersoncare/send-otp';
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

async function buildApp(dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => ({}))) {
  const app = Fastify({ logger: false });
  apps.push(app);
  await registerBersoncareSendOtpRoute(app, {
    dispatchPort: { dispatchOutgoing },
    sharedSecret: SHARED_SECRET,
    isAuthChannelEnabled: async () => true,
  });
  return { app, dispatchOutgoing };
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

describe('POST /api/bersoncare/send-otp MAX recipient contract', () => {
  it('rejects a non-numeric MAX platform user id as invalid payload before dispatch', async () => {
    const { app, dispatchOutgoing } = await buildApp();

    const response = await injectSigned(app, {
      channel: 'max',
      recipientId: 'not-a-platform-user-id',
      code: '123456',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ ok: false, error: 'invalid_payload' });
    expect(dispatchOutgoing).not.toHaveBeenCalled();
  });

  it('dispatches a positive numeric MAX platform user id', async () => {
    const { app, dispatchOutgoing } = await buildApp();

    const response = await injectSigned(app, {
      channel: 'max',
      recipientId: '123456789',
      code: '123456',
    });

    expect(response.statusCode).toBe(200);
    expect(dispatchOutgoing).toHaveBeenCalledOnce();
    expect(dispatchOutgoing.mock.calls[0]?.[0].payload).toMatchObject({
      recipient: { userId: 123456789 },
      delivery: { channels: ['max'] },
    });
  });
});
