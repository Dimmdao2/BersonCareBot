import { beforeEach, describe, expect, it, vi } from 'vitest';

const setSessionFromUserMock = vi.fn().mockResolvedValue(undefined);
const trySetInitialIfEmptyMock = vi.fn().mockResolvedValue(undefined);
const confirmPublicEmailOtpChallengeMock = vi.fn();
const findByUserIdMock = vi.fn();
const isVerifiedEmailGlobalAdminAsyncMock = vi.fn();
const isAuthChannelEnabledMock = vi.hoisted(() => vi.fn());
const checkAuthConfirmRateLimitMock = vi.hoisted(() => vi.fn());
const ensureAuthModulePortsBoundMock = vi.hoisted(() => vi.fn());

vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: () => ensureAuthModulePortsBoundMock(),
}));

vi.mock('@/modules/auth/authChannelPolicy', () => ({
  AUTH_CHANNEL_DISABLED_ERROR: 'auth_channel_disabled',
  isAuthChannelEnabled: (...args: unknown[]) => isAuthChannelEnabledMock(...args),
}));

vi.mock('@/modules/auth/authConfirmRateLimit', () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 600,
  checkAuthConfirmRateLimit: (...args: unknown[]) => checkAuthConfirmRateLimitMock(...args),
}));

const testUser = {
  userId: 'user-uuid-1',
  role: 'client' as const,
  displayName: 'Test User',
  phone: null,
  bindings: {},
};

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    emailOtpPublicDb: {},
    userByPhone: {
      findByUserId: (...args: unknown[]) => findByUserIdMock(...args),
    },
    patientCalendarTimezone: {
      trySetInitialIfEmpty: trySetInitialIfEmptyMock,
    },
  }),
}));

vi.mock('@/modules/auth/emailOtpPublic', () => ({
  confirmPublicEmailOtpChallenge: (...args: unknown[]) =>
    confirmPublicEmailOtpChallengeMock(...args),
}));

vi.mock('@/modules/auth/service', () => ({
  setSessionFromUser: (...args: unknown[]) => setSessionFromUserMock(...args),
}));

vi.mock('@/modules/auth/envRole', () => ({
  isVerifiedEmailGlobalAdminAsync: (...args: unknown[]) =>
    isVerifiedEmailGlobalAdminAsyncMock(...args),
}));

import { POST } from './route';
import * as authChannelPolicy from '@/modules/auth/authChannelPolicy';

describe('POST /api/auth/email-otp/confirm', () => {
  beforeEach(() => {
    confirmPublicEmailOtpChallengeMock.mockReset();
    findByUserIdMock.mockReset();
    setSessionFromUserMock.mockClear();
    isVerifiedEmailGlobalAdminAsyncMock.mockReset().mockResolvedValue(false);
    trySetInitialIfEmptyMock.mockClear();
    isAuthChannelEnabledMock.mockReset();
    isAuthChannelEnabledMock.mockResolvedValue(true);
    checkAuthConfirmRateLimitMock.mockReset();
    checkAuthConfirmRateLimitMock.mockResolvedValue({ limited: false });
    ensureAuthModulePortsBoundMock.mockReset();

    findByUserIdMock.mockResolvedValue(testUser);
    confirmPublicEmailOtpChallengeMock.mockResolvedValue({
      ok: true as const,
      userId: testUser.userId,
    });
  });

  it('returns 429 rate_limited (same shape as too_many_attempts) when the per-IP limit trips, before touching the challenge', async () => {
    checkAuthConfirmRateLimitMock.mockResolvedValueOnce({ limited: true, reason: 'rate_limited' });
    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', code: '123456' }),
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('600');
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe('rate_limited');
    expect(data.retryAfterSeconds).toBe(600);
    expect(confirmPublicEmailOtpChallengeMock).not.toHaveBeenCalled();
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
    expect(ensureAuthModulePortsBoundMock).toHaveBeenCalledOnce();
    expect(ensureAuthModulePortsBoundMock.mock.invocationCallOrder[0]).toBeLessThan(
      checkAuthConfirmRateLimitMock.mock.invocationCallOrder[0]!,
    );
  });

  it('returns 503 proxy_configuration when the per-IP key cannot be resolved', async () => {
    checkAuthConfirmRateLimitMock.mockResolvedValueOnce({
      limited: true,
      reason: 'proxy_configuration',
    });
    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', code: '123456' }),
      }),
    );
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ ok: false, error: 'proxy_configuration' });
    expect(confirmPublicEmailOtpChallengeMock).not.toHaveBeenCalled();
  });

  it('rejects a disabled email channel before challenge consumption or session work', async () => {
    const policy = vi.spyOn(authChannelPolicy, 'isAuthChannelEnabled').mockResolvedValue(false);
    try {
      const res = await POST(
        new Request('http://localhost/api/auth/email-otp/confirm', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'known@example.com', code: '123456' }),
        }),
      );

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({ ok: false, error: 'auth_channel_disabled' });
      expect(confirmPublicEmailOtpChallengeMock).not.toHaveBeenCalled();
      expect(findByUserIdMock).not.toHaveBeenCalled();
      expect(setSessionFromUserMock).not.toHaveBeenCalled();
    } finally {
      policy.mockRestore();
    }
  });

  it('returns 400 when email or code is missing', async () => {
    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(false);
  });

  it('returns 200 and sets session on correct code', async () => {
    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', code: '123456' }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.redirectTo).toBe('/app/patient');
    expect(data.role).toBe('client');
    expect(setSessionFromUserMock).toHaveBeenCalledWith(testUser);
  });

  it('derives an email-allowlisted admin role only after successful OTP confirmation', async () => {
    isVerifiedEmailGlobalAdminAsyncMock.mockResolvedValueOnce(true);
    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'dimmdao@gmail.com', code: '123456' }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ role: 'admin', redirectTo: '/app/doctor' });
    expect(isVerifiedEmailGlobalAdminAsyncMock).toHaveBeenCalledWith('dimmdao@gmail.com');
    expect(setSessionFromUserMock).toHaveBeenCalledWith({ ...testUser, role: 'admin' });
  });

  it('does not elevate an email OTP session when policy resolves a non-admin role', async () => {
    isVerifiedEmailGlobalAdminAsyncMock.mockResolvedValueOnce(false);
    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'dimmdao@gmail.com', code: '123456' }),
      }),
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      role: 'client',
      redirectTo: '/app/patient',
    });
    expect(setSessionFromUserMock).toHaveBeenCalledWith(testUser);
  });

  it('uses the migrated base role when the fresh email-admin policy fails closed', async () => {
    // isVerifiedEmailGlobalAdminAsync converts a DB-policy failure to false; this
    // is the post-0233 owner-email artifact's actual DB role.
    isVerifiedEmailGlobalAdminAsyncMock.mockResolvedValueOnce(false);
    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'dimmdao@gmail.com', code: '123456' }),
      }),
    );

    await expect(res.json()).resolves.toMatchObject({ role: 'client', redirectTo: '/app/patient' });
    expect(setSessionFromUserMock).toHaveBeenCalledWith(testUser);
  });

  it('preserves an independent persisted admin role when email policy is negative', async () => {
    const independentAdmin = { ...testUser, role: 'admin' as const, phone: '+75550000003' };
    findByUserIdMock.mockResolvedValueOnce(independentAdmin);
    isVerifiedEmailGlobalAdminAsyncMock.mockResolvedValueOnce(false);
    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'independent-admin@example.com', code: '123456' }),
      }),
    );

    await expect(res.json()).resolves.toMatchObject({ role: 'admin', redirectTo: '/app/doctor' });
    expect(setSessionFromUserMock).toHaveBeenCalledWith(independentAdmin);
  });

  it('does not consume a challenge or issue a session when email auth is disabled', async () => {
    isAuthChannelEnabledMock.mockResolvedValue(false);

    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', code: '123456' }),
      }),
    );

    expect(res.status).toBe(503);
    expect(confirmPublicEmailOtpChallengeMock).not.toHaveBeenCalled();
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
  });

  it('returns 400 on invalid code', async () => {
    confirmPublicEmailOtpChallengeMock.mockResolvedValueOnce({ ok: false, code: 'invalid_code' });
    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', code: '000000' }),
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe('invalid_code');
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
  });

  it('returns 400 on expired code', async () => {
    confirmPublicEmailOtpChallengeMock.mockResolvedValueOnce({ ok: false, code: 'expired_code' });
    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', code: '123456' }),
      }),
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe('expired_code');
  });

  it('returns 429 on too_many_attempts', async () => {
    confirmPublicEmailOtpChallengeMock.mockResolvedValueOnce({
      ok: false,
      code: 'too_many_attempts',
      retryAfterSeconds: 300,
    });
    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'user@example.com', code: '999999' }),
      }),
    );
    expect(res.status).toBe(429);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(false);
    expect(data.error).toBe('too_many_attempts');
    expect(data.retryAfterSeconds).toBe(300);
  });

  it('existing user with email (doctor needs_email_setup) logs in, not creates duplicate', async () => {
    const doctorUser = {
      userId: 'doctor-uuid-99',
      role: 'doctor' as const,
      displayName: 'Dr. Smith',
      phone: '+79991234567',
      bindings: {},
    };
    confirmPublicEmailOtpChallengeMock.mockResolvedValueOnce({
      ok: true as const,
      userId: doctorUser.userId,
    });
    findByUserIdMock.mockResolvedValueOnce(doctorUser);

    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'doctor@example.com', code: '654321' }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(data.role).toBe('doctor');
    expect(setSessionFromUserMock).toHaveBeenCalledWith(doctorUser);
  });

  it('new user created on the fly and logged in', async () => {
    // The service creates user at start time (findOrCreate); by confirm time the user exists.
    // From route perspective: confirmPublicEmailOtpChallenge returns a userId (could be newly created)
    const newUser = {
      userId: 'new-user-uuid-42',
      role: 'client' as const,
      displayName: 'user42',
      phone: null,
      bindings: {},
    };
    confirmPublicEmailOtpChallengeMock.mockResolvedValueOnce({
      ok: true as const,
      userId: newUser.userId,
    });
    findByUserIdMock.mockResolvedValueOnce(newUser);

    const res = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'newbie@example.com', code: '111222' }),
      }),
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok).toBe(true);
    expect(setSessionFromUserMock).toHaveBeenCalledWith(newUser);
  });
});
