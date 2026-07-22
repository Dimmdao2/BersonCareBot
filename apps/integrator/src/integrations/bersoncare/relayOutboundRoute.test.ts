import { describe, expect, it, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { DispatchPort } from '../../kernel/contracts/index.js';
import { createDefaultDispatchPort } from '../../infra/adapters/dispatchPort.js';

const recordNotificationAttemptMock = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../infra/db/repos/notificationDeliveryAttempts.js', () => ({
  recordNotificationDeliveryAttemptBestEffort: recordNotificationAttemptMock,
}));
import {
  registerBersoncareRelayOutboundRoute,
  signRelayRequest,
  makeRelayBody,
} from './relayOutboundRoute.js';
import { getCurrentOrganizationPrincipalId } from '../../infra/principal/organizationPrincipal.js';

const TEST_SECRET = 'test-shared-secret-16chars';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const PUSH_USER_ID = '33333333-3333-4333-8333-333333333333';

function makeDispatchPort(overrides: Partial<DispatchPort> = {}): DispatchPort {
  return {
    dispatchOutgoing: vi.fn(async () => ({})),
    ...overrides,
  };
}

async function buildTestApp(
  dispatchPort: DispatchPort,
  secret = TEST_SECRET,
  isSmsProviderConnected?: () => Promise<boolean>,
) {
  const app = Fastify();

  // Replicate the raw-body content type parser from sendSmsRoute
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const raw: string = typeof body === 'string' ? body : (body as Buffer).toString('utf8');
    (req as typeof req & { rawBody?: string }).rawBody = raw;
    try {
      done(null, JSON.parse(raw) as unknown);
    } catch (e) {
      done(e as Error, undefined);
    }
  });

  await registerBersoncareRelayOutboundRoute(app, {
    db: {} as never,
    dispatchPort,
    sharedSecret: secret,
    ...(isSmsProviderConnected ? { isSmsProviderConnected } : {}),
  });
  return app;
}

function makeHeaders(body: string, secret = TEST_SECRET) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signRelayRequest(timestamp, body, secret);
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': signature,
  };
}

describe('POST /api/bersoncare/relay-outbound', () => {
  let dispatchPort: DispatchPort;
  let app: Awaited<ReturnType<typeof buildTestApp>>;

  beforeEach(async () => {
    recordNotificationAttemptMock.mockClear();
    dispatchPort = makeDispatchPort();
    app = await buildTestApp(dispatchPort);
  });

  it('returns 200 accepted for valid signature and payload', async () => {
    const body = makeRelayBody();
    const rawBody = JSON.stringify(body);
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body) as { ok: boolean; status: string };
    expect(json).toEqual({ ok: true, status: 'accepted' });
    expect(dispatchPort.dispatchOutgoing).toHaveBeenCalledTimes(1);
  });

  it('denies a generic messenger relay even when messageId and metadata imitate auth', async () => {
    const adapterSend = vi.fn().mockResolvedValue({});
    const policyDispatch = createDefaultDispatchPort({
      adapters: [{ canHandle: () => true, send: adapterSend }],
    });
    const policyApp = await buildTestApp(policyDispatch);
    const body = makeRelayBody({
      messageId: 'otp:telegram:forged',
      channel: 'telegram',
      metadata: { outboundMessageClass: 'auth_code', outboundCapability: 'auth_code' },
    });
    const rawBody = JSON.stringify(body);

    const response = await policyApp.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body)).toEqual({ ok: false, error: 'egress_policy_denied' });
    expect(adapterSend).not.toHaveBeenCalled();
    await policyApp.close();
  });

  it('returns 401 for invalid signature', async () => {
    const body = makeRelayBody();
    const rawBody = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': timestamp,
        'x-bersoncare-signature': 'invalid-signature',
      },
      body: rawBody,
    });

    expect(res.statusCode).toBe(401);
    const json = JSON.parse(res.body) as { ok: boolean; error: string };
    expect(json.error).toBe('invalid_signature');
    expect(dispatchPort.dispatchOutgoing).not.toHaveBeenCalled();
  });

  it('returns 200 duplicate for repeated idempotencyKey', async () => {
    const body = makeRelayBody();
    const rawBody = JSON.stringify(body);
    const headers = makeHeaders(rawBody);

    // First request
    const res1 = await app.inject({ method: 'POST', url: '/api/bersoncare/relay-outbound', headers, body: rawBody });
    expect(res1.statusCode).toBe(200);
    expect(JSON.parse(res1.body)).toEqual({ ok: true, status: 'accepted' });

    // Second request with same idempotencyKey
    const res2 = await app.inject({ method: 'POST', url: '/api/bersoncare/relay-outbound', headers, body: rawBody });
    expect(res2.statusCode).toBe(200);
    expect(JSON.parse(res2.body)).toEqual({ ok: true, status: 'duplicate' });

    // dispatchOutgoing only called once
    expect(dispatchPort.dispatchOutgoing).toHaveBeenCalledTimes(1);
  });

  it('returns 400 for invalid payload', async () => {
    const body = { messageId: 'id', channel: 'unsupported_channel', recipient: 'r', text: 't', idempotencyKey: 'k' };
    const rawBody = JSON.stringify(body);
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(res.statusCode).toBe(400);
    expect(dispatchPort.dispatchOutgoing).not.toHaveBeenCalled();
  });

  it('requires organizationId for web_push', async () => {
    const body = makeRelayBody({ channel: 'web_push', recipient: 'user-id' });
    const rawBody = JSON.stringify(body);
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(res.statusCode).toBe(400);
    expect(dispatchPort.dispatchOutgoing).not.toHaveBeenCalled();
  });

  it('rejects a non-UUID web_push recipient in the real relay schema', async () => {
    const body = makeRelayBody({ organizationId: ORGANIZATION_ID, channel: 'web_push', recipient: 'not-a-uuid' });
    const rawBody = JSON.stringify(body);
    const response = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });
    expect(response.statusCode).toBe(400);
    expect(dispatchPort.dispatchOutgoing).not.toHaveBeenCalled();
  });

  it('dispatches web_push inside the verified organization principal', async () => {
    let observedOrganizationId: string | undefined;
    vi.mocked(dispatchPort.dispatchOutgoing).mockImplementationOnce(async () => {
      observedOrganizationId = getCurrentOrganizationPrincipalId();
      return { webPushOutcome: { status: 'success', delivered: 1, errors: 0, deactivated: 0 } };
    });
    const body = makeRelayBody({
      organizationId: ORGANIZATION_ID,
      channel: 'web_push',
      recipient: PUSH_USER_ID,
    });
    const rawBody = JSON.stringify(body);
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(res.statusCode).toBe(200);
    expect(observedOrganizationId).toBe(ORGANIZATION_ID);
    const intent = vi.mocked(dispatchPort.dispatchOutgoing).mock.calls[0]![0];
    expect(intent.meta).toMatchObject({
      outboundMessageClass: 'routine_product',
      outboundCapability: 'app_push',
    });
    expect(recordNotificationAttemptMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        userId: PUSH_USER_ID,
        channel: 'web_push',
        status: 'success',
      }),
    );
  });

  it('projects the actual VAPID-missing outcome as skipped, never success', async () => {
    vi.mocked(dispatchPort.dispatchOutgoing).mockResolvedValueOnce({
      webPushOutcome: { status: 'skipped', reason: 'vapid_missing', delivered: 0, errors: 0, deactivated: 0 },
    });
    const body = makeRelayBody({ organizationId: ORGANIZATION_ID, channel: 'web_push', recipient: PUSH_USER_ID });
    const rawBody = JSON.stringify(body);
    const response = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });
    expect(response.statusCode).toBe(200);
    expect(recordNotificationAttemptMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'skipped', reason: 'vapid_missing' }),
    );
  });

  it('persists safe provider status and reason from an Apple-style 403 outcome', async () => {
    vi.mocked(dispatchPort.dispatchOutgoing).mockResolvedValueOnce({
      webPushOutcome: {
        status: 'failed',
        reason: 'provider_error',
        delivered: 0,
        errors: 1,
        deactivated: 0,
        providerStatusCode: 403,
        providerErrorCode: 'BadJwtToken',
      },
    });
    const body = makeRelayBody({ organizationId: ORGANIZATION_ID, channel: 'web_push', recipient: PUSH_USER_ID });
    const rawBody = JSON.stringify(body);
    const response = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(recordNotificationAttemptMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'failed',
        reason: 'provider_error',
        providerStatusCode: 403,
        errorMessage: 'BadJwtToken',
      }),
    );
  });

  it('reserves an in-flight org-scoped key so concurrent duplicates send once', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(dispatchPort.dispatchOutgoing).mockImplementationOnce(() => blocked.then(() => ({})));
    const body = makeRelayBody({
      organizationId: ORGANIZATION_ID,
      channel: 'web_push',
      recipient: PUSH_USER_ID,
    });
    const rawBody = JSON.stringify(body);
    const request = () => app.inject({
      method: 'POST' as const,
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    const first = request();
    await vi.waitFor(() => expect(dispatchPort.dispatchOutgoing).toHaveBeenCalledTimes(1));
    const duplicate = await request();
    expect(duplicate.statusCode).toBe(503);
    expect(JSON.parse(duplicate.body)).toEqual({ ok: false, error: 'dispatch_in_flight' });
    release();
    expect((await first).statusCode).toBe(200);
    expect(dispatchPort.dispatchOutgoing).toHaveBeenCalledTimes(1);
  });

  it('does not collide identical idempotency keys across organizations', async () => {
    for (const organizationId of [ORGANIZATION_ID, '22222222-2222-4222-8222-222222222222']) {
      const body = makeRelayBody({ organizationId, channel: 'web_push', recipient: PUSH_USER_ID });
      const rawBody = JSON.stringify(body);
      const response = await app.inject({
        method: 'POST',
        url: '/api/bersoncare/relay-outbound',
        headers: makeHeaders(rawBody),
        body: rawBody,
      });
      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual({ ok: true, status: 'accepted' });
    }
    expect(dispatchPort.dispatchOutgoing).toHaveBeenCalledTimes(2);
  });

  it('returns 400 for missing required fields', async () => {
    const body = { channel: 'telegram', text: 'hello' }; // missing messageId, recipient, idempotencyKey
    const rawBody = JSON.stringify(body);
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(res.statusCode).toBe(400);
  });

  it('calls dispatchOutgoing with correct intent for telegram channel', async () => {
    const body = makeRelayBody({ channel: 'telegram', recipient: '987654321', text: 'Test message' });
    const rawBody = JSON.stringify(body);
    await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(dispatchPort.dispatchOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message.send',
        payload: expect.objectContaining({
          recipient: { chatId: '987654321' },
          message: { text: 'Test message' },
          delivery: { channels: ['telegram'] },
        }),
      }),
    );
  });

  it('returns 502 when dispatchOutgoing throws', async () => {
    vi.mocked(dispatchPort.dispatchOutgoing).mockRejectedValueOnce(new Error('network error'));
    const body = makeRelayBody();
    const rawBody = JSON.stringify(body);
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(res.statusCode).toBe(502);
  });

  it('returns 400 for missing x-bersoncare-timestamp header', async () => {
    const body = makeRelayBody();
    const rawBody = JSON.stringify(body);
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: {
        'content-type': 'application/json',
        // no timestamp, no signature
      },
      body: rawBody,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, error: 'missing_headers' });
    expect(dispatchPort.dispatchOutgoing).not.toHaveBeenCalled();
  });

  it('returns 400 for missing x-bersoncare-signature header', async () => {
    const body = makeRelayBody();
    const rawBody = JSON.stringify(body);
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': String(Math.floor(Date.now() / 1000)),
        // no signature
      },
      body: rawBody,
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toMatchObject({ ok: false, error: 'missing_headers' });
  });

  it('dispatches with userId payload for max channel (binding platform user id)', async () => {
    const body = makeRelayBody({ channel: 'max', recipient: '5551234', text: 'max message' });
    const rawBody = JSON.stringify(body);
    await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(dispatchPort.dispatchOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message.send',
        payload: expect.objectContaining({
          recipient: { userId: '5551234' },
          message: { text: 'max message' },
          delivery: { channels: ['max'] },
        }),
      }),
    );
  });

  it('dispatches with phoneNormalized payload for sms channel', async () => {
    const body = makeRelayBody({ channel: 'sms', recipient: '+79990001122', text: 'sms text' });
    const rawBody = JSON.stringify(body);
    await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(dispatchPort.dispatchOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message.send',
        payload: expect.objectContaining({
          recipient: { phoneNormalized: '+79990001122' },
          delivery: { channels: ['smsc'] },
        }),
      }),
    );
  });

  it('skips SMS before dispatch when the provider is not connected', async () => {
    const disconnectedApp = await buildTestApp(dispatchPort, TEST_SECRET, async () => false);
    const body = makeRelayBody({
      channel: 'sms',
      recipient: '+79990001122',
      text: 'operator alert',
      purpose: 'operator_alert',
    });
    const rawBody = JSON.stringify(body);
    const response = await disconnectedApp.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ ok: true, status: 'skipped' });
    expect(dispatchPort.dispatchOutgoing).not.toHaveBeenCalled();
    await disconnectedApp.close();
  });

  it('creates the trusted operator marker for an operator SMS relay', async () => {
    const body = makeRelayBody({
      channel: 'sms',
      recipient: '+79990001122',
      text: 'operator alert',
      purpose: 'operator_alert',
    });
    const rawBody = JSON.stringify(body);
    await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(dispatchPort.dispatchOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({
        meta: expect.objectContaining({
          outboundMessageClass: 'operator_security',
          outboundCapability: 'operator_alert',
        }),
      }),
    );
  });

  // S10 / D-S10: email branch dispatches channel:'email' intent with recipient.email + subject
  it('dispatches email intent with recipient.email and subject from metadata (D-S10)', async () => {
    const body = makeRelayBody({
      channel: 'email',
      recipient: 'patient@example.com',
      text: 'Напоминание о визите',
      metadata: { subject: 'Напоминание' },
    });
    const rawBody = JSON.stringify(body);
    await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(dispatchPort.dispatchOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'message.send',
        payload: expect.objectContaining({
          recipient: { email: 'patient@example.com' },
          subject: 'Напоминание',
          message: { text: 'Напоминание о визите' },
          delivery: { channels: ['email'] },
        }),
      }),
    );
  });

  it('email channel falls back to BersonCare subject when metadata.subject absent', async () => {
    const body = makeRelayBody({
      channel: 'email',
      recipient: 'patient@example.com',
      text: 'Some text',
    });
    const rawBody = JSON.stringify(body);
    await app.inject({
      method: 'POST',
      url: '/api/bersoncare/relay-outbound',
      headers: makeHeaders(rawBody),
      body: rawBody,
    });

    expect(dispatchPort.dispatchOutgoing).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          subject: 'BersonCare',
        }),
      }),
    );
  });
});
