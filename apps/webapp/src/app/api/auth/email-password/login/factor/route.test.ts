import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  readContinuationMock,
  clearContinuationMock,
  completeLoginMock,
  findByUserIdMock,
  setSessionFromUserMock,
  checkAuthConfirmRateLimitMock,
} = vi.hoisted(() => ({
  readContinuationMock: vi.fn(),
  clearContinuationMock: vi.fn(),
  completeLoginMock: vi.fn(),
  findByUserIdMock: vi.fn(),
  setSessionFromUserMock: vi.fn(),
  checkAuthConfirmRateLimitMock: vi.fn(),
}));

vi.mock('@/modules/auth/staffLoginContinuation', () => ({
  readStaffLoginContinuation: readContinuationMock,
  clearStaffLoginContinuation: clearContinuationMock,
}));
vi.mock('@/modules/auth/service', () => ({ setSessionFromUser: setSessionFromUserMock }));
vi.mock('@/modules/auth/redirectPolicy', () => ({ getRedirectPathForRole: () => '/app/doctor' }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    staffSecurity: { completeLogin: completeLoginMock },
    userByPhone: { findByUserId: findByUserIdMock },
  }),
}));
vi.mock('@/modules/auth/authConfirmRateLimit', () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 600,
  checkAuthConfirmRateLimit: (...args: unknown[]) => checkAuthConfirmRateLimitMock(...args),
}));

import { POST } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const user = { userId: USER_ID, role: 'doctor' as const, displayName: 'Owner', bindings: {} };

function request() {
  return new Request('http://localhost/api/auth/email-password/login/factor', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code: '123456' }),
  });
}

describe('POST /api/auth/email-password/login/factor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkAuthConfirmRateLimitMock.mockResolvedValue({ limited: false });
    readContinuationMock.mockResolvedValue({ userId: USER_ID, token: 'signed-continuation-token' });
    findByUserIdMock.mockResolvedValue(user);
  });

  // C-2 remainder: proves the refusal path, not just the happy path -- this route previously had
  // zero route-level rate limiting (confirmed: no RateLimit reference anywhere in it), so a
  // per-account-only lockout could be circumvented by spreading TOTP/recovery-code guesses across
  // many source IPs.
  it('returns 429 rate_limited before reading the login continuation, when the per-IP limit trips', async () => {
    checkAuthConfirmRateLimitMock.mockResolvedValueOnce({ limited: true, reason: 'rate_limited' });

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('600');
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'rate_limited',
      retryAfterSeconds: 600,
    });
    expect(readContinuationMock).not.toHaveBeenCalled();
    expect(completeLoginMock).not.toHaveBeenCalled();
  });

  it('returns 503 proxy_configuration when the per-IP key cannot be resolved, without touching completeLogin', async () => {
    checkAuthConfirmRateLimitMock.mockResolvedValueOnce({
      limited: true,
      reason: 'proxy_configuration',
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'proxy_configuration' });
    expect(completeLoginMock).not.toHaveBeenCalled();
  });

  it('keeps logout/relogin before recovery-code acknowledgement in recovery_confirmation', async () => {
    completeLoginMock.mockResolvedValue({
      ok: true,
      recoveryMode: false,
      recoveryConfirmed: false,
      sessionVersion: 1,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(setSessionFromUserMock).toHaveBeenCalledWith(user, {
      staffSecurity: { assurance: 'recovery_confirmation', verifiedAt: expect.any(Number) },
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      redirectTo: '/app/account?tab=security',
      recoveryMode: false,
    });
  });

  it('issues factor_verified only from confirmed DB profile truth', async () => {
    completeLoginMock.mockResolvedValue({
      ok: true,
      recoveryMode: false,
      recoveryConfirmed: true,
      sessionVersion: 1,
    });

    const response = await POST(request());

    expect(setSessionFromUserMock).toHaveBeenCalledWith(user, {
      staffSecurity: { assurance: 'factor_verified', verifiedAt: expect.any(Number) },
    });
    await expect(response.json()).resolves.toMatchObject({ redirectTo: '/app/doctor' });
  });

  it('keeps a one-time recovery-code login in replacement mode', async () => {
    completeLoginMock.mockResolvedValue({
      ok: true,
      recoveryMode: true,
      sessionVersion: 2,
    });

    await POST(request());

    expect(setSessionFromUserMock).toHaveBeenCalledWith(user, {
      staffSecurity: { assurance: 'recovery', verifiedAt: expect.any(Number) },
    });
  });

  it('carries phone OTP post-login hints through the signed factor continuation', async () => {
    readContinuationMock.mockResolvedValue({
      userId: USER_ID,
      token: 'signed-continuation-token',
      postLoginHints: { phoneOtpChannel: 'telegram' },
    });
    completeLoginMock.mockResolvedValue({
      ok: true,
      recoveryMode: false,
      recoveryConfirmed: true,
      sessionVersion: 1,
    });

    await POST(request());

    expect(setSessionFromUserMock).toHaveBeenCalledWith(user, {
      postLoginHints: { phoneOtpChannel: 'telegram' },
      staffSecurity: { assurance: 'factor_verified', verifiedAt: expect.any(Number) },
    });
  });
});
