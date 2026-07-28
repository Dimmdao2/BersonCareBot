import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getCurrentDbPrincipal } from '@bersoncare/db-principal';

const resolveLoginChallengeMock = vi.hoisted(() => vi.fn());
const confirmPhoneAuthMock = vi.hoisted(() => vi.fn());
const setSessionFromUserMock = vi.hoisted(() => vi.fn());
const trySetInitialIfEmptyMock = vi.hoisted(() => vi.fn());
const getCurrentSessionMock = vi.hoisted(() => vi.fn());
const findByUserIdMock = vi.hoisted(() => vi.fn());
const getSecurityStatusMock = vi.hoisted(() => vi.fn());
const beginLoginMock = vi.hoisted(() => vi.fn());
const readContinuationMock = vi.hoisted(() => vi.fn());
const issueContinuationMock = vi.hoisted(() => vi.fn());

const getPhoneChallengeMock = vi.hoisted(() => vi.fn());
const checkAuthConfirmRateLimitMock = vi.hoisted(() => vi.fn());

vi.mock('@/modules/auth/authConfirmRateLimit', () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 600,
  checkAuthConfirmRateLimit: (...args: unknown[]) => checkAuthConfirmRateLimitMock(...args),
}));

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    phoneMessengerBind: {
      resolveLoginChallenge: (...args: unknown[]) => resolveLoginChallengeMock(...args),
    },
    auth: {
      getPhoneChallenge: (...args: unknown[]) => getPhoneChallengeMock(...args),
      confirmPhoneAuth: (...args: unknown[]) => confirmPhoneAuthMock(...args),
      setSessionFromUser: (...args: unknown[]) => setSessionFromUserMock(...args),
    },
    userByPhone: { findByUserId: (...args: unknown[]) => findByUserIdMock(...args) },
    staffSecurity: {
      getStatus: (...args: unknown[]) => getSecurityStatusMock(...args),
      beginLogin: (...args: unknown[]) => beginLoginMock(...args),
    },
    patientCalendarTimezone: {
      trySetInitialIfEmpty: (...args: unknown[]) => trySetInitialIfEmptyMock(...args),
    },
  }),
}));

vi.mock('@/modules/auth/service', () => ({
  getCurrentSession: (...args: unknown[]) => getCurrentSessionMock(...args),
}));

vi.mock('@/modules/auth/staffLoginContinuation', () => ({
  readStaffLoginContinuation: (...args: unknown[]) => readContinuationMock(...args),
  issueStaffLoginContinuation: (...args: unknown[]) => issueContinuationMock(...args),
}));

import { POST } from './route';

describe('POST /api/auth/phone/messenger-bind/finish', () => {
  beforeEach(() => {
    resolveLoginChallengeMock.mockReset();
    confirmPhoneAuthMock.mockReset();
    setSessionFromUserMock.mockReset();
    trySetInitialIfEmptyMock.mockReset();
    getCurrentSessionMock.mockReset();
    getPhoneChallengeMock.mockReset();
    findByUserIdMock.mockReset();
    getSecurityStatusMock.mockReset();
    beginLoginMock.mockReset();
    readContinuationMock.mockReset();
    issueContinuationMock.mockReset();
    checkAuthConfirmRateLimitMock.mockReset();
    checkAuthConfirmRateLimitMock.mockResolvedValue({ limited: false });
    getCurrentSessionMock.mockResolvedValue(null);
    readContinuationMock.mockResolvedValue(null);
    getPhoneChallengeMock.mockResolvedValue({ isRegistrationIntent: false, phone: '+79991234567' });
    findByUserIdMock.mockResolvedValue({
      userId: 'u-1',
      role: 'client',
      displayName: '+79991234567',
      phone: '+79991234567',
      bindings: {},
    });
    getSecurityStatusMock.mockResolvedValue(null);
  });

  it('returns 429 rate_limited (same shape as an ordinary failure) when the per-IP limit trips, before resolving the challenge', async () => {
    checkAuthConfirmRateLimitMock.mockResolvedValueOnce({ limited: true, reason: 'rate_limited' });
    const res = await POST(
      new Request('http://localhost/api/auth/phone/messenger-bind/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupToken: 'some-token' }),
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('600');
    const data = await res.json();
    expect(data).toEqual({
      ok: false,
      error: 'rate_limited',
      retryAfterSeconds: 600,
      message: expect.any(String),
    });
    expect(resolveLoginChallengeMock).not.toHaveBeenCalled();
  });

  it('returns 503 proxy_configuration when the per-IP key cannot be resolved', async () => {
    checkAuthConfirmRateLimitMock.mockResolvedValueOnce({
      limited: true,
      reason: 'proxy_configuration',
    });
    const res = await POST(
      new Request('http://localhost/api/auth/phone/messenger-bind/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupToken: 'some-token' }),
      }),
    );
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'proxy_configuration' });
    expect(resolveLoginChallengeMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid body', async () => {
    const res = await POST(
      new Request('http://localhost/api/auth/phone/messenger-bind/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 when OTP code is sent in body', async () => {
    const res = await POST(
      new Request('http://localhost/api/auth/phone/messenger-bind/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupToken: 'auth_abc', code: '123456' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(resolveLoginChallengeMock).not.toHaveBeenCalled();
  });

  it('returns 404 when secret not found', async () => {
    resolveLoginChallengeMock.mockResolvedValue({ ok: false, code: 'not_found' });
    const res = await POST(
      new Request('http://localhost/api/auth/phone/messenger-bind/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupToken: 'auth_missing' }),
      }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 409 when challenge_expired', async () => {
    resolveLoginChallengeMock.mockResolvedValue({ ok: false, code: 'challenge_expired' });
    const res = await POST(
      new Request('http://localhost/api/auth/phone/messenger-bind/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupToken: 'auth_abc' }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it('returns 400 when wrong_purpose', async () => {
    resolveLoginChallengeMock.mockResolvedValue({ ok: false, code: 'wrong_purpose' });
    const res = await POST(
      new Request('http://localhost/api/auth/phone/messenger-bind/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupToken: 'auth_abc' }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 409 when not_ready', async () => {
    resolveLoginChallengeMock.mockResolvedValue({ ok: false, code: 'not_ready' });
    const res = await POST(
      new Request('http://localhost/api/auth/phone/messenger-bind/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupToken: 'auth_abc' }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it('returns 200 with redirect when already_consumed and session exists', async () => {
    resolveLoginChallengeMock.mockResolvedValue({ ok: false, code: 'already_consumed' });
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: 'u-1', role: 'client', phone: '+79991234567' },
    });
    const res = await POST(
      new Request('http://localhost/api/auth/phone/messenger-bind/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupToken: 'auth_abc' }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok?: boolean; redirectTo?: string };
    expect(data.ok).toBe(true);
    expect(data.redirectTo).toBeTruthy();
    expect(confirmPhoneAuthMock).not.toHaveBeenCalled();
  });

  it('returns 409 when already_consumed without session', async () => {
    resolveLoginChallengeMock.mockResolvedValue({ ok: false, code: 'already_consumed' });
    const res = await POST(
      new Request('http://localhost/api/auth/phone/messenger-bind/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupToken: 'auth_abc' }),
      }),
    );
    expect(res.status).toBe(409);
  });

  it('creates session on successful finish', async () => {
    resolveLoginChallengeMock.mockResolvedValue({
      ok: true,
      challengeId: 'ch-1',
      code: '654321',
    });
    confirmPhoneAuthMock.mockResolvedValue({
      ok: true,
      user: { userId: 'u-1', role: 'client', phone: '+79991234567' },
      redirectTo: '/app/patient/home',
      deliveryChannel: 'telegram',
    });
    setSessionFromUserMock.mockResolvedValue(undefined);
    trySetInitialIfEmptyMock.mockResolvedValue(undefined);

    const res = await POST(
      new Request('http://localhost/api/auth/phone/messenger-bind/finish', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ setupToken: 'auth_abc', browserCalendarIana: 'Europe/Moscow' }),
      }),
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as { ok?: boolean; redirectTo?: string; role?: string };
    expect(data).toMatchObject({ ok: true, redirectTo: '/app/patient/home', role: 'client' });
    expect(confirmPhoneAuthMock).toHaveBeenCalledWith('ch-1', '654321');
    expect(findByUserIdMock).toHaveBeenCalledWith('u-1');
    expect(setSessionFromUserMock).toHaveBeenCalled();
    expect(trySetInitialIfEmptyMock).toHaveBeenCalledWith('u-1', 'Europe/Moscow');
  });

  it('second finish is idempotent after first consumed the challenge', async () => {
    let confirmCalls = 0;
    confirmPhoneAuthMock.mockImplementation(async () => {
      confirmCalls += 1;
      return {
        ok: true,
        user: { userId: 'u-1', role: 'client', phone: '+79991234567' },
        redirectTo: '/app/patient/home',
        deliveryChannel: 'telegram',
      };
    });
    resolveLoginChallengeMock.mockImplementation(async () => {
      if (confirmCalls > 0) {
        return { ok: false, code: 'already_consumed' };
      }
      return { ok: true, challengeId: 'ch-1', code: '654321' };
    });
    setSessionFromUserMock.mockResolvedValue(undefined);
    getCurrentSessionMock.mockResolvedValue({
      user: { userId: 'u-1', role: 'client', phone: '+79991234567' },
    });

    const req = () =>
      POST(
        new Request('http://localhost/api/auth/phone/messenger-bind/finish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ setupToken: 'auth_abc' }),
        }),
      );

    const first = await req();
    const second = await req();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(confirmPhoneAuthMock).toHaveBeenCalledTimes(1);
  });

  it('requires the enrolled staff factor and keeps messenger finish idempotent', async () => {
    const userId = '22222222-2222-4222-8222-222222222222';
    const doctor = {
      userId,
      role: 'doctor' as const,
      displayName: 'Clinic Doctor',
      phone: '+79991234567',
      bindings: { telegramId: '42' },
      securityVersion: 4,
      securityFactorRequired: true,
    };
    let consumed = false;
    resolveLoginChallengeMock.mockImplementation(async () =>
      consumed
        ? { ok: false, code: 'already_consumed' }
        : { ok: true, challengeId: 'ch-staff', code: '654321' },
    );
    confirmPhoneAuthMock.mockImplementation(async () => {
      consumed = true;
      return {
        ok: true,
        user: { ...doctor, securityVersion: undefined, securityFactorRequired: undefined },
        redirectTo: '/app/doctor',
        deliveryChannel: 'telegram',
      };
    });
    findByUserIdMock.mockImplementationOnce(async () => {
      expect(getCurrentDbPrincipal()).toMatchObject({ kind: 'patient', platformUserId: userId });
      return doctor;
    });
    getSecurityStatusMock.mockResolvedValue({ enrolled: true });
    beginLoginMock.mockResolvedValue({
      required: true,
      token: 'factor-token',
      expiresAt: '2030-01-01T00:00:00.000Z',
    });
    readContinuationMock.mockResolvedValue({ userId, token: 'factor-token' });

    const request = () =>
      POST(
        new Request('http://localhost/api/auth/phone/messenger-bind/finish', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ setupToken: 'auth_staff' }),
        }),
      );
    const first = await request();
    const second = await request();

    await expect(first.json()).resolves.toEqual({ ok: true, factorRequired: true });
    await expect(second.json()).resolves.toEqual({ ok: true, factorRequired: true });
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
    expect(confirmPhoneAuthMock).toHaveBeenCalledTimes(1);
    expect(issueContinuationMock).toHaveBeenCalledWith({
      userId,
      token: 'factor-token',
      expiresAt: '2030-01-01T00:00:00.000Z',
      postLoginHints: { phoneOtpChannel: 'telegram' },
    });
  });
});
