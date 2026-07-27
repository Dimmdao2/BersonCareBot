import { createHmac } from 'node:crypto';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerOperatorHealthProbeRoute } from './operatorHealthProbeRoute.js';

const mockRunOperatorHealthProbes = vi.hoisted(() => vi.fn());
const mockGetOperatorHealthProbeConfig = vi.hoisted(() => vi.fn());

vi.mock('../../app/operatorHealthProbeRunner.js', () => ({
  runOperatorHealthProbes: mockRunOperatorHealthProbes,
}));
vi.mock('../../app/operatorHealthProbeSettings.js', () => ({
  getOperatorHealthProbeConfig: mockGetOperatorHealthProbeConfig,
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
    mockGetOperatorHealthProbeConfig.mockReset();
    mockGetOperatorHealthProbeConfig.mockResolvedValue({
      max: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 4 },
      telegram: { enabled: false, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 4 },
      google_calendar: { enabled: false, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 4 },
      email: { intervalMs: 900_000, timeoutMs: 60_000, roundTripDeadlineMs: 300_000, retentionMs: 604_800_000, cleanupIntervalMs: 86_400_000 },
      quietWindowMaxDurationMs: 86_400_000,
      quietUntil: null,
    });
    mockRunOperatorHealthProbes.mockResolvedValue({
      max: 'ok',
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
    const principals: unknown[] = [];
    mockGetOperatorHealthProbeConfig.mockImplementationOnce(async () => {
      principals.push(getCurrentDbPrincipal());
      return {
        max: { enabled: true, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 4 },
        telegram: { enabled: false, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 4 },
        google_calendar: { enabled: false, intervalMs: 600_000, timeoutMs: 5_000, consecutiveFailures: 4 },
        email: { intervalMs: 900_000, timeoutMs: 60_000, roundTripDeadlineMs: 300_000, retentionMs: 604_800_000, cleanupIntervalMs: 86_400_000 },
        quietWindowMaxDurationMs: 86_400_000,
        quietUntil: null,
      };
    });
    mockRunOperatorHealthProbes.mockImplementationOnce(async () => {
      principals.push(getCurrentDbPrincipal());
      return {
        max: 'ok',
        telegram: 'skipped_not_configured',
        google_calendar: 'skipped_not_configured',
        details: {},
      };
    });
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
    expect(mockRunOperatorHealthProbes).toHaveBeenCalledWith({
      dispatchPort,
      config: expect.objectContaining({
        max: expect.objectContaining({ consecutiveFailures: 4 }),
      }),
    });
    expect(principals).toEqual([
      { kind: 'infra', source: 'scheduler:handle-tick-event' },
      { kind: 'infra', source: 'scheduler:handle-tick-event' },
    ]);
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
