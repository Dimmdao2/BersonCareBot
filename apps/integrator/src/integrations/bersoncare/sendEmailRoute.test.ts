import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerBersoncareSendEmailRoute } from './sendEmailRoute.js';
import * as mailer from '../email/mailer.js';

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

async function buildTestApp(secret = TEST_SECRET) {
  const app = Fastify();
  await registerBersoncareSendEmailRoute(app, { sharedSecret: secret });
  return app;
}

describe('POST /api/bersoncare/send-email', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 200 for valid signature and payload', async () => {
    vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(true);
    const sendMailMock = vi.spyOn(mailer, 'sendMail').mockResolvedValue({
      accepted: ['user@example.com'],
      rejected: [],
      messageId: 'm1',
    });

    const app = await buildTestApp();
    const body = JSON.stringify({
      to: 'user@example.com',
      code: '123456',
      subject: 'Ваш OTP',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/send-email',
      headers: makeHeaders(body),
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Ваш OTP',
        text: 'Ваш код BersonCare: 123456',
      }),
    );
  });

  it('returns 401 for invalid signature', async () => {
    vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(true);
    const sendMailMock = vi.spyOn(mailer, 'sendMail').mockResolvedValue({
      accepted: [],
      rejected: [],
    });

    const app = await buildTestApp();
    const body = JSON.stringify({
      to: 'user@example.com',
      code: '123456',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/send-email',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-bersoncare-signature': 'invalid-signature',
      },
      body,
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'invalid_signature' });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('returns 503 when mailer is not configured', async () => {
    vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(false);
    const sendMailMock = vi.spyOn(mailer, 'sendMail').mockResolvedValue({
      accepted: [],
      rejected: [],
    });

    const app = await buildTestApp();
    const body = JSON.stringify({
      to: 'user@example.com',
      code: '123456',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/send-email',
      headers: makeHeaders(body),
      body,
    });

    expect(res.statusCode).toBe(503);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'email_not_configured' });
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid email payload', async () => {
    vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(true);
    const sendMailMock = vi.spyOn(mailer, 'sendMail').mockResolvedValue({
      accepted: [],
      rejected: [],
    });

    const app = await buildTestApp();
    const body = JSON.stringify({
      to: 'not-an-email',
      code: '123456',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/send-email',
      headers: makeHeaders(body),
      body,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, error: 'invalid_payload' });
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
