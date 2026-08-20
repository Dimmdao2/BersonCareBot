import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  DbPort,
  DispatchPort,
  IdempotencyPort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import { registerBersoncareSendEmailRoute } from './sendEmailRoute.js';

const SHARED_SECRET = 'send-email-route-test-secret';
const ROUTE = '/api/bersoncare/send-email';

const apps: FastifyInstance[] = [];

const smtpOutboundValueJson = {
  value: {
    host: 'smtp.example.test',
    user: 'sender@example.test',
    password: 'super-secret-password',
    from: 'BersonCare <no-reply@example.test>',
    port: 587,
    secure: false,
  },
};

/** Mocks the single SMTP capability call `resolveSmtpOutboundConfig` makes through the DB port. */
function configuredSmtpDb(): DbPort {
  return {
    query: vi.fn().mockResolvedValue({ rows: [{ value_json: smtpOutboundValueJson }] }),
    tx: vi.fn(),
  } as unknown as DbPort;
}

function protocolHeaders(
  rawBody: string,
  options: { timestamp?: string; signature?: string } = {},
): Record<string, string> {
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature =
    options.signature ??
    createHmac('sha256', SHARED_SECRET).update(`${timestamp}.${rawBody}`).digest('base64url');
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': signature,
  };
}

async function buildApp(deps: {
  dispatchOutgoing: DispatchPort['dispatchOutgoing'];
  isAuthChannelEnabled: (channel: 'email') => Promise<boolean>;
  db?: DbPort;
}): Promise<FastifyInstance> {
  const keys = new Set<string>();
  const idempotencyPort: IdempotencyPort = {
    tryAcquire: async (key) => {
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    },
    release: async (key) => void keys.delete(key),
  };
  const app = Fastify({ logger: false });
  apps.push(app);
  await registerBersoncareSendEmailRoute(app, {
    sharedSecret: SHARED_SECRET,
    db: deps.db ?? configuredSmtpDb(),
    dispatchPort: { dispatchOutgoing: deps.dispatchOutgoing },
    isAuthChannelEnabled: deps.isAuthChannelEnabled,
    recordProviderFailure: async () => {},
    idempotencyPort,
  });
  return app;
}

async function injectSigned(app: FastifyInstance, payload: Record<string, unknown>) {
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

describe('POST /api/bersoncare/send-email — auth-channel gate', () => {
  it('дано: auth_email_enabled выключен → тогда OTP-код не доходит до dispatchPort, ответ 403', async () => {
    const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const app = await buildApp({
      dispatchOutgoing,
      isAuthChannelEnabled: async () => false,
    });

    const response = await injectSigned(app, {
      to: 'patient@example.test',
      code: '123456',
      idempotencyKey: 'otp:email:disabled',
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toMatchObject({ error: 'auth_channel_disabled' });
    expect(dispatchOutgoing).not.toHaveBeenCalled();
  });

  it('дано: auth_email_enabled включён и SMTP настроен → тогда OTP-код доходит до dispatchPort ровно один раз', async () => {
    const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const app = await buildApp({
      dispatchOutgoing,
      isAuthChannelEnabled: async () => true,
    });

    const response = await injectSigned(app, {
      to: 'patient@example.test',
      code: '123456',
      idempotencyKey: 'otp:email:one',
    });

    expect(response.statusCode).toBe(200);
    expect(dispatchOutgoing).toHaveBeenCalledOnce();
  });

  it('same email OTP request is a no-op, while a new resend key sends another code', async () => {
    const dispatchOutgoing = vi.fn(async (_intent: OutgoingIntent) => ({}));
    const app = await buildApp({ dispatchOutgoing, isAuthChannelEnabled: async () => true });
    const first = { to: 'patient@example.test', code: '123456', idempotencyKey: 'otp:email:1' };

    expect((await injectSigned(app, first)).json()).toEqual({ ok: true });
    expect((await injectSigned(app, first)).json()).toEqual({ ok: true, status: 'duplicate' });
    expect(
      (await injectSigned(app, { ...first, code: '654321', idempotencyKey: 'otp:email:2' })).json(),
    ).toEqual({ ok: true });
    expect(dispatchOutgoing).toHaveBeenCalledTimes(2);
  });
});
