import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerOperatorHealthProbeRoute } from './operatorHealthProbeRoute.js';

const mockRunOperatorHealthProbes = vi.hoisted(() => vi.fn());

vi.mock('../../app/operatorHealthProbeRunner.js', () => ({
  runOperatorHealthProbes: mockRunOperatorHealthProbes,
}));

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

describe('POST /internal/operator-health-probe', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockRunOperatorHealthProbes.mockReset();
    mockRunOperatorHealthProbes.mockResolvedValue({
      max: 'ok',
      rubitime: 'skipped_not_configured',
      details: {},
    });
  });

  it('returns 400 when signature headers are missing', async () => {
    const app = Fastify();
    await registerOperatorHealthProbeRoute(app, {
      sharedSecret: TEST_SECRET,
      dispatchPort: { dispatchOutgoing: vi.fn() },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/internal/operator-health-probe',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 for invalid signature', async () => {
    const app = Fastify();
    await registerOperatorHealthProbeRoute(app, {
      sharedSecret: TEST_SECRET,
      dispatchPort: { dispatchOutgoing: vi.fn() },
    });
    const raw = '{}';
    const res = await app.inject({
      method: 'POST',
      url: '/internal/operator-health-probe',
      headers: { ...makeHeaders(raw), 'x-bersoncare-signature': 'bad' },
      body: raw,
    });
    expect(res.statusCode).toBe(401);
  });

  it('runs probes when signature is valid', async () => {
    const dispatchPort = { dispatchOutgoing: vi.fn() };
    const app = Fastify();
    await registerOperatorHealthProbeRoute(app, {
      sharedSecret: TEST_SECRET,
      dispatchPort,
    });
    const raw = JSON.stringify({ trigger: 'test' });
    const res = await app.inject({
      method: 'POST',
      url: '/internal/operator-health-probe',
      headers: makeHeaders(raw),
      body: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(mockRunOperatorHealthProbes).toHaveBeenCalledWith({ dispatchPort });
    const json = JSON.parse(res.body) as { ok: boolean; max: string };
    expect(json.ok).toBe(true);
    expect(json.max).toBe('ok');
  });

  it('returns 503 when shared secret is too short', async () => {
    const app = Fastify();
    await registerOperatorHealthProbeRoute(app, {
      sharedSecret: 'short',
      dispatchPort: { dispatchOutgoing: vi.fn() },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/internal/operator-health-probe',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': '0',
        'x-bersoncare-signature': 'sig',
      },
      body: '{}',
    });
    expect(res.statusCode).toBe(503);
  });
});
