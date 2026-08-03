import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type StartResult =
  | {
      ok: true;
      challengeId: string;
      retryAfterSeconds?: number;
      deliveryFailed?: true;
    }
  | { ok: false; code: 'invalid_email' | 'rate_limited'; retryAfterSeconds?: number };

const fakes = vi.hoisted(() => ({
  stampBootstrapPrincipal: vi.fn(),
  loggerWarn: vi.fn(),
  ensureAuthModulePortsBound: vi.fn(),
  buildAppDeps: vi.fn(),
  isEmailOtpStartRateLimitedByKey: vi.fn(),
  isAuthChannelEnabled: vi.fn(),
  startPublicEmailOtpChallenge: vi.fn<
    (email: string, db: object) => Promise<StartResult>
  >(),
  resolveRealIpRateLimitClientKey: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: fakes.stampBootstrapPrincipal,
}));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { warn: fakes.loggerWarn } }));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: fakes.ensureAuthModulePortsBound,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/modules/auth/authRateLimits', () => ({
  isEmailOtpStartRateLimitedByKey: fakes.isEmailOtpStartRateLimitedByKey,
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  AUTH_CHANNEL_DISABLED_ERROR: 'auth_channel_disabled',
  isAuthChannelEnabled: fakes.isAuthChannelEnabled,
}));
vi.mock('@/modules/auth/emailOtpPublic', () => ({
  startPublicEmailOtpChallenge: fakes.startPublicEmailOtpChallenge,
}));
vi.mock('@/modules/auth/realIpRateLimitClientKey', () => ({
  resolveRealIpRateLimitClientKey: fakes.resolveRealIpRateLimitClientKey,
}));

import { POST } from './route';

function request(email = 'person@example.test'): Request {
  return new Request('https://app.example.test/api/auth/email-otp/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.12' },
    body: JSON.stringify({ email }),
  });
}

async function resolveAfterPublicFloor(promise: Promise<Response>): Promise<Response> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(500);
  return promise;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-03T09:00:00.000Z'));
  fakes.isAuthChannelEnabled.mockResolvedValue(true);
  fakes.resolveRealIpRateLimitClientKey.mockReturnValue({ ok: true, key: '203.0.113.12' });
  fakes.isEmailOtpStartRateLimitedByKey.mockResolvedValue(false);
  fakes.buildAppDeps.mockReturnValue({ emailOtpPublicDb: {} });
  fakes.startPublicEmailOtpChallenge.mockResolvedValue({
    ok: true,
    challengeId: '00000000-0000-4000-8000-000000000101',
    retryAfterSeconds: 60,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('public email OTP start anti-enumeration', () => {
  it('returns the same neutral public schema for known, unknown, provider-success, and provider-failure paths', async () => {
    const results: StartResult[] = [
      { ok: true, challengeId: '00000000-0000-4000-8000-000000000101', retryAfterSeconds: 60 },
      { ok: true, challengeId: '00000000-0000-4000-8000-000000000102', retryAfterSeconds: 60 },
      { ok: true, challengeId: '00000000-0000-4000-8000-000000000103', retryAfterSeconds: 60 },
      {
        ok: true,
        challengeId: '00000000-0000-4000-8000-000000000104',
        retryAfterSeconds: 60,
        deliveryFailed: true,
      },
    ];
    const publicResponses: Array<{ status: number; body: Record<string, unknown> }> = [];

    for (const result of results) {
      fakes.startPublicEmailOtpChallenge.mockResolvedValueOnce(result);
      const response = await resolveAfterPublicFloor(POST(request()));
      publicResponses.push({
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
      });
    }

    expect(publicResponses.map(({ status }) => status)).toEqual([200, 200, 200, 200]);
    for (const { body } of publicResponses) {
      expect(Object.keys(body).sort()).toEqual(['challengeId', 'ok', 'retryAfterSeconds']);
      expect(body).toMatchObject({ ok: true, retryAfterSeconds: 60 });
      expect(body).not.toHaveProperty('error');
      expect(body).not.toHaveProperty('deliveryFailed');
    }
    expect(fakes.loggerWarn).toHaveBeenCalledWith(
      { route: 'auth/email-otp/start', outcome: 'email_delivery_failed' },
      'auth/email-otp/start delivery failed',
    );
  });

  it('does not resolve a valid non-rate-limited request before the public response floor', async () => {
    let settled = false;
    const responsePromise = POST(request()).then((response) => {
      settled = true;
      return response;
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect((await responsePromise).status).toBe(200);
  });

  it('keeps invalid-email and IP rate-limit semantics unchanged', async () => {
    vi.useRealTimers();
    fakes.startPublicEmailOtpChallenge.mockResolvedValueOnce({ ok: false, code: 'invalid_email' });
    const invalid = await POST(request('not-an-email'));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({ ok: false, error: 'invalid_email' });
    expect(fakes.startPublicEmailOtpChallenge).toHaveBeenCalledTimes(1);

    fakes.isEmailOtpStartRateLimitedByKey.mockResolvedValueOnce(true);
    const limited = await POST(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('60');
    await expect(limited.json()).resolves.toMatchObject({
      ok: false,
      error: 'rate_limited',
      retryAfterSeconds: 60,
    });
    expect(fakes.startPublicEmailOtpChallenge).toHaveBeenCalledTimes(1);
  });
});
