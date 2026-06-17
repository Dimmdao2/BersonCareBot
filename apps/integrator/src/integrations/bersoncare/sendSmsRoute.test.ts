/**
 * Tests for the S6-migrated sendSmsRoute: verifies it dispatches via dispatchPort
 * with channel 'smsc' instead of calling smsClient directly. (PLAN S6)
 */
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerBersoncareSendSmsRoute } from './sendSmsRoute.js';

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

describe('POST /api/bersoncare/send-sms', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 and dispatches via dispatchPort with smsc channel', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue({});
    const app = Fastify();
    await registerBersoncareSendSmsRoute(app, {
      dispatchPort: { dispatchOutgoing },
      sharedSecret: TEST_SECRET,
    });

    const body = JSON.stringify({ phone: '+79991234567', code: '123456', idempotencyKey: 'key-abc' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/send-sms',
      headers: makeHeaders(body),
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(dispatchOutgoing).toHaveBeenCalledTimes(1);

    // Must dispatch with channel 'smsc' (D3: SMS channel tag is 'smsc', not 'sms').
    const intent = dispatchOutgoing.mock.calls[0]![0] as Record<string, unknown>;
    expect(intent.type).toBe('message.send');

    // The canonical channel lives in payload.delivery.channels[0] (D2 / channelRouting).
    const payload = intent.payload as Record<string, unknown>;
    const delivery = payload.delivery as Record<string, unknown>;
    expect(delivery.channels).toEqual(['smsc']);

    // Recipient is phoneNormalized (not chatId/userId).
    const recipient = payload.recipient as Record<string, unknown>;
    expect(recipient.phoneNormalized).toBe('+79991234567');

    // The SMS text is correct.
    const message = payload.message as Record<string, unknown>;
    expect(message.text).toBe('Ваш код BersonCare: 123456');
  });

  it('OTP code is NOT logged — eventId must start with "otp:"', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue({});
    const app = Fastify();
    await registerBersoncareSendSmsRoute(app, {
      dispatchPort: { dispatchOutgoing },
      sharedSecret: TEST_SECRET,
    });

    const body = JSON.stringify({ phone: '+79991234567', code: '999888', idempotencyKey: 'idem-xyz' });
    await app.inject({
      method: 'POST',
      url: '/api/bersoncare/send-sms',
      headers: makeHeaders(body),
      body,
    });

    const intent = dispatchOutgoing.mock.calls[0]![0] as { meta: { eventId: string } };
    // eventId must start with 'otp:' so dispatchPort::isOtpIntent triggers redaction.
    expect(intent.meta.eventId).toMatch(/^otp:/);
    // The OTP code must NOT appear in the eventId (it's not logged in redacted form).
    expect(intent.meta.eventId).not.toContain('999888');
  });

  it('returns 502 when dispatchPort throws', async () => {
    const dispatchOutgoing = vi.fn().mockRejectedValue(new Error('CHANNEL_NOT_SUPPORTED:smsc'));
    const app = Fastify();
    await registerBersoncareSendSmsRoute(app, {
      dispatchPort: { dispatchOutgoing },
      sharedSecret: TEST_SECRET,
    });

    const body = JSON.stringify({ phone: '+79991234567', code: '111222' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/send-sms',
      headers: makeHeaders(body),
      body,
    });

    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'sms_failed' });
  });

  it('returns 401 for invalid signature', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue({});
    const app = Fastify();
    await registerBersoncareSendSmsRoute(app, {
      dispatchPort: { dispatchOutgoing },
      sharedSecret: TEST_SECRET,
    });

    const body = JSON.stringify({ phone: '+79991234567', code: '111222' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/send-sms',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-bersoncare-signature': 'bad-sig',
      },
      body,
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'invalid_signature' });
    expect(dispatchOutgoing).not.toHaveBeenCalled();
  });

  it('returns 400 when phone or code is missing', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue({});
    const app = Fastify();
    await registerBersoncareSendSmsRoute(app, {
      dispatchPort: { dispatchOutgoing },
      sharedSecret: TEST_SECRET,
    });

    const body = JSON.stringify({ phone: '+79991234567' }); // missing code
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/send-sms',
      headers: makeHeaders(body),
      body,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'phone and code required' });
    expect(dispatchOutgoing).not.toHaveBeenCalled();
  });

  it('returns 503 when sharedSecret is not set', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue({});
    const app = Fastify();
    await registerBersoncareSendSmsRoute(app, {
      dispatchPort: { dispatchOutgoing },
      sharedSecret: '',
    });

    const body = JSON.stringify({ phone: '+79991234567', code: '111222' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/send-sms',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-bersoncare-signature': 'any',
      },
      body,
    });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'service_unconfigured' });
    expect(dispatchOutgoing).not.toHaveBeenCalled();
  });
});
