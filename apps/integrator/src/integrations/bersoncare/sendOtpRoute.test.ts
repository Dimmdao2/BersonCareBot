import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerBersoncareSendOtpRoute } from './sendOtpRoute.js';

const TEST_SECRET = 'test-shared-secret-16chars';

function sign(timestamp: string, rawBody: string, secret = TEST_SECRET): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('base64url');
}

function makeHeaders(rawBody: string, secret = TEST_SECRET) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': sign(timestamp, rawBody, secret),
  };
}

describe('POST /api/bersoncare/send-otp', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 and dispatches OTP intent', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const app = Fastify();
    await registerBersoncareSendOtpRoute(app, { dispatchPort: { dispatchOutgoing }, sharedSecret: TEST_SECRET });

    const body = JSON.stringify({ channel: 'telegram', recipientId: '123456789', code: '654321' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/send-otp',
      headers: makeHeaders(body),
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);
    expect(dispatchOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message.send',
        meta: expect.objectContaining({
          source: 'telegram',
        }),
        payload: expect.objectContaining({
          recipient: { chatId: '123456789' },
          message: { text: 'Код для входа в BersonCare: 654321' },
        }),
      }),
    );
    const firstCall = dispatchOutgoing.mock.calls[0];
    expect(firstCall).toBeDefined();
    const sent = firstCall![0] as { meta: { correlationId?: string } };
    expect(sent.meta.correlationId ?? '').not.toContain('654321');
    expect(sent.meta.correlationId ?? '').not.toContain('123456789');
  });

  it('returns 401 for invalid signature', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const app = Fastify();
    await registerBersoncareSendOtpRoute(app, { dispatchPort: { dispatchOutgoing }, sharedSecret: TEST_SECRET });

    const body = JSON.stringify({ channel: 'telegram', recipientId: '123456789', code: '654321' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/send-otp',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-bersoncare-signature': 'bad-signature',
      },
      body,
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'invalid_signature' });
    expect(dispatchOutgoing).not.toHaveBeenCalled();
  });
});
