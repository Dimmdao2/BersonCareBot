import { describe, expect, it, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import type { DispatchPort } from '../../kernel/contracts/index.js';
import {
  registerBersoncareRelayOutboundRoute,
  signRelayRequest,
  makeRelayBody,
} from './relayOutboundRoute.js';

const TEST_SECRET = 'test-shared-secret-16chars';

function makeDispatchPort(overrides: Partial<DispatchPort> = {}): DispatchPort {
  return {
    dispatchOutgoing: vi.fn(async () => ({})),
    ...overrides,
  };
}

async function buildTestApp(dispatchPort: DispatchPort, secret = TEST_SECRET) {
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

  await registerBersoncareRelayOutboundRoute(app, { dispatchPort, sharedSecret: secret });
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

  it('dispatches with correct chatId payload for max channel', async () => {
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
          recipient: { chatId: '5551234' },
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
});
