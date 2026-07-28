import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireStaffSecurityApiSessionMock,
  getVerifiedEmailForUserMock,
  startTotpEnrollmentMock,
  loggerErrorMock,
} = vi.hoisted(() => ({
  requireStaffSecurityApiSessionMock: vi.fn(),
  getVerifiedEmailForUserMock: vi.fn(),
  startTotpEnrollmentMock: vi.fn(),
  loggerErrorMock: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requireStaffSecurityApiSession: () => requireStaffSecurityApiSessionMock(),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    userByPhone: { getVerifiedEmailForUser: getVerifiedEmailForUserMock },
    staffSecurity: { startTotpEnrollment: startTotpEnrollmentMock },
  }),
}));
vi.mock('@/app-layer/logging/logger', () => ({
  logger: { error: (...args: unknown[]) => loggerErrorMock(...args) },
}));

import { POST } from './route';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('POST /api/account/security/totp/start', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedEmailForUserMock.mockResolvedValue('owner@example.test');
    startTotpEnrollmentMock.mockResolvedValue({
      ok: true,
      secret: 'fixture',
      uri: 'fixture-uri',
    });
  });

  it.each([
    ['doctor', { role: 'doctor' as const, adminMode: false }],
    ['global admin without a clinic', { role: 'admin' as const, adminMode: true }],
  ])('starts enrollment for the exact self identity of a %s', async (_label, actor) => {
    requireStaffSecurityApiSessionMock.mockResolvedValue({
      ok: true,
      session: {
        user: {
          userId: USER_ID,
          role: actor.role,
          displayName: 'Account owner',
          bindings: {},
        },
        adminMode: actor.adminMode,
      },
    });

    const response = await POST();

    expect(response.status).toBe(200);
    expect(getVerifiedEmailForUserMock).toHaveBeenCalledWith(USER_ID);
    expect(startTotpEnrollmentMock).toHaveBeenCalledWith({ email: 'owner@example.test' });
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it('returns a JSON error and records the PostgreSQL error class instead of leaking a non-JSON 500', async () => {
    requireStaffSecurityApiSessionMock.mockResolvedValue({
      ok: true,
      session: {
        user: {
          userId: USER_ID,
          role: 'doctor',
          displayName: 'Doctor',
          bindings: {},
        },
        staffSecurity: { assurance: 'pending_enrollment' },
      },
    });
    const databaseError = Object.assign(
      new Error('permission denied for function ensure_staff_security_profile'),
      { code: '42501' },
    );
    startTotpEnrollmentMock.mockRejectedValueOnce(databaseError);

    const response = await POST();

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'totp_enrollment_start_failed',
    });
    expect(loggerErrorMock).toHaveBeenCalledWith(
      {
        err: databaseError,
        errorMessage: 'permission denied for function ensure_staff_security_profile',
        errorCode: '42501',
      },
      '[account/security/totp/start] enrollment start failed',
    );
  });

  it('never accepts an account or clinic id from the request and scopes the lookup to the session user', async () => {
    requireStaffSecurityApiSessionMock.mockResolvedValue({
      ok: true,
      session: {
        user: {
          userId: USER_ID,
          role: 'doctor',
          displayName: 'Doctor',
          bindings: {},
        },
      },
    });

    await POST();

    expect(getVerifiedEmailForUserMock).toHaveBeenCalledTimes(1);
    expect(getVerifiedEmailForUserMock).toHaveBeenCalledWith(USER_ID);
    expect(startTotpEnrollmentMock).toHaveBeenCalledTimes(1);
  });
});
