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
  startPublicEmailOtpChallenge: vi.fn<(email: string, db: object) => Promise<StartResult>>(),
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

  // Deferred: arbitrary provider latency remains a timing oracle until delivery leaves public request latency.
  // This is the acceptance test for the D27-C/D30 durable auth delivery queue slice; do not "fix" it with a fixed
  // sleep, because a constant delay only moves the delta and does not remove the timing class.
  it.skip('keeps a known address out of a slower response-time class when its provider exceeds the floor', async () => {
    const knownEmail = 'known@example.test';
    const unknownEmail = 'unknown@example.test';
    fakes.startPublicEmailOtpChallenge.mockImplementation((email) => {
      if (email === knownEmail) {
        return new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                ok: true,
                challengeId: '00000000-0000-4000-8000-000000000201',
                retryAfterSeconds: 60,
              }),
            1_500,
          );
        });
      }
      return Promise.resolve({
        ok: true,
        challengeId: '00000000-0000-4000-8000-000000000202',
        retryAfterSeconds: 60,
      });
    });

    let knownResolvedAt: number | null = null;
    let unknownResolvedAt: number | null = null;
    const knownResponsePromise = POST(request(knownEmail)).then((response) => {
      knownResolvedAt = Date.now();
      return response;
    });
    const unknownResponsePromise = POST(request(unknownEmail)).then((response) => {
      unknownResolvedAt = Date.now();
      return response;
    });

    await vi.advanceTimersByTimeAsync(2_000);
    const [knownResponse, unknownResponse] = await Promise.all([
      knownResponsePromise,
      unknownResponsePromise,
    ]);

    expect(knownResponse.status).toBe(200);
    expect(unknownResponse.status).toBe(200);
    expect(knownResolvedAt).not.toBeNull();
    expect(unknownResolvedAt).not.toBeNull();
    expect(Math.abs((knownResolvedAt ?? 0) - (unknownResolvedAt ?? 0))).toBeLessThanOrEqual(50);
    expect(Object.keys((await knownResponse.json()) as Record<string, unknown>).sort()).toEqual(
      Object.keys((await unknownResponse.json()) as Record<string, unknown>).sort(),
    );
  });

  it('contains a thrown provider failure with safe operator evidence and a neutral public response', async () => {
    const submittedEmail = 'known-secret@example.test';
    const submittedOtp = '654321';
    fakes.startPublicEmailOtpChallenge.mockRejectedValueOnce(
      new Error(`provider rejected ${submittedEmail} with OTP ${submittedOtp}`),
    );

    const outcomePromise = POST(request(submittedEmail)).then(
      (response) => ({ kind: 'response' as const, response }),
      (error: unknown) => ({ kind: 'error' as const, error }),
    );
    await vi.advanceTimersByTimeAsync(500);
    const outcome = await outcomePromise;

    expect(outcome.kind).toBe('response');
    if (outcome.kind !== 'response') throw outcome.error;
    expect(outcome.response.status).toBe(200);
    const body = (await outcome.response.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['challengeId', 'ok', 'retryAfterSeconds']);
    expect(body).toMatchObject({ ok: true, retryAfterSeconds: 60 });
    expect(body.challengeId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(fakes.loggerWarn).toHaveBeenCalledTimes(1);
    const capturedLogs = JSON.stringify(fakes.loggerWarn.mock.calls);
    expect(capturedLogs).not.toContain(submittedEmail);
    expect(capturedLogs).not.toContain(submittedOtp);
  });

  it('does not expose a known address through its existing resend cooldown state', async () => {
    const knownEmail = 'known@example.test';
    const unknownEmail = 'unknown@example.test';
    const requestCount = new Map<string, number>();
    fakes.startPublicEmailOtpChallenge.mockImplementation((email) => {
      const count = (requestCount.get(email) ?? 0) + 1;
      requestCount.set(email, count);
      if (email === knownEmail && count === 2) {
        return Promise.resolve({ ok: false, code: 'rate_limited', retryAfterSeconds: 55 });
      }
      return Promise.resolve({
        ok: true,
        challengeId:
          email === knownEmail
            ? '00000000-0000-4000-8000-000000000203'
            : '00000000-0000-4000-8000-000000000204',
        retryAfterSeconds: 60,
      });
    });

    const firstKnown = await resolveAfterPublicFloor(POST(request(knownEmail)));
    const firstUnknown = await resolveAfterPublicFloor(POST(request(unknownEmail)));
    expect([firstKnown.status, firstUnknown.status]).toEqual([200, 200]);

    const publicResponses: Array<{ status: number; body: Record<string, unknown> }> = [];
    for (const email of [knownEmail, unknownEmail]) {
      const response = await resolveAfterPublicFloor(POST(request(email)));
      publicResponses.push({
        status: response.status,
        body: (await response.json()) as Record<string, unknown>,
      });
    }

    expect(publicResponses.map(({ status }) => status)).toEqual([200, 200]);
    for (const { body } of publicResponses) {
      expect(Object.keys(body).sort()).toEqual(['challengeId', 'ok', 'retryAfterSeconds']);
      expect(body).toMatchObject({ ok: true, retryAfterSeconds: 60 });
      expect(body.challengeId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
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
