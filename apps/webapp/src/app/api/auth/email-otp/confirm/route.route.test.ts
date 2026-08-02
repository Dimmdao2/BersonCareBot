import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  stampBootstrapPrincipal: vi.fn(),
  ensureAuthModulePortsBound: vi.fn(),
  checkAuthConfirmRateLimit: vi.fn(),
  isAuthChannelEnabled: vi.fn(),
  buildAppDeps: vi.fn(),
  confirmPublicEmailOtpChallenge: vi.fn(),
  setSessionFromUser: vi.fn(),
  isVerifiedEmailGlobalAdminAsync: vi.fn(),
  enterStaffSecuritySelfPrincipal: vi.fn(),
  findByUserId: vi.fn(),
  trySetInitialIfEmpty: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: fakes.stampBootstrapPrincipal,
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: fakes.ensureAuthModulePortsBound,
}));
vi.mock('@/modules/auth/authConfirmRateLimit', () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 60,
  checkAuthConfirmRateLimit: fakes.checkAuthConfirmRateLimit,
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  AUTH_CHANNEL_DISABLED_ERROR: 'auth_channel_disabled',
  isAuthChannelEnabled: fakes.isAuthChannelEnabled,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/modules/auth/emailOtpPublic', () => ({
  confirmPublicEmailOtpChallenge: fakes.confirmPublicEmailOtpChallenge,
}));
vi.mock('@/modules/auth/service', () => ({ setSessionFromUser: fakes.setSessionFromUser }));
vi.mock('@/modules/auth/envRole', () => ({
  isVerifiedEmailGlobalAdminAsync: fakes.isVerifiedEmailGlobalAdminAsync,
}));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: fakes.enterStaffSecuritySelfPrincipal,
}));

import { POST } from './route';

const user = {
  userId: '00000000-0000-4000-8000-000000000101',
  role: 'client' as const,
  phone: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.checkAuthConfirmRateLimit.mockResolvedValue({ limited: false });
  fakes.isAuthChannelEnabled.mockResolvedValue(true);
  fakes.confirmPublicEmailOtpChallenge.mockResolvedValue({ ok: true, userId: user.userId });
  fakes.buildAppDeps.mockReturnValue({
    emailOtpPublicDb: {},
    userByPhone: { findByUserId: fakes.findByUserId },
    patientCalendarTimezone: { trySetInitialIfEmpty: fakes.trySetInitialIfEmpty },
  });
  fakes.findByUserId.mockResolvedValue(user);
  fakes.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(false);
});

describe('B1.2 email confirmation', () => {
  it('establishes the normal patient session for the OTP-confirmed canonical owner', async () => {
    const response = await POST(
      new Request('http://localhost/api/auth/email-otp/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'payer@example.test', code: '123456' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, role: 'client' });
    expect(fakes.setSessionFromUser).toHaveBeenCalledWith(user);
  });
});
