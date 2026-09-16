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
  syncFromDevice: vi.fn(),
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
vi.mock('@/modules/auth/emailAuth', () => ({
  isVerifiedEmailGlobalAdminAsync: fakes.isVerifiedEmailGlobalAdminAsync,
}));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: fakes.enterStaffSecuritySelfPrincipal,
}));

import { POST } from './route';

function request(roleLoginPortal?: 'doctor' | 'patient' | 'admin'): Request {
  return new Request('http://localhost/api/auth/email-otp/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'payer@example.test',
      code: '123456',
      ...(roleLoginPortal ? { roleLoginPortal } : {}),
    }),
  });
}

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
    patientCalendarTimezone: { syncFromDevice: fakes.syncFromDevice },
  });
  fakes.findByUserId.mockResolvedValue(user);
  fakes.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(false);
});

describe('B1.2 email confirmation', () => {
  it('uses the explicit patient portal policy before issuing a compatible client session', async () => {
    fakes.isAuthChannelEnabled.mockImplementation(
      async (_channel: string, policy: string | undefined) => policy === 'patient',
    );

    const response = await POST(request('patient'));

    expect(response.status).toBe(200);
    expect(fakes.isAuthChannelEnabled).toHaveBeenCalledWith('email', 'patient');
    expect(fakes.setSessionFromUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'client' }),
      'email_code',
    );
  });

  /**
   * Владелец 13.09.2026, `bf1982c8d`. Голая пара «почта + код» доказывает владение почтовым ящиком
   * и больше ничего, поэтому её НЕ ДОЛЖНО хватать для входа в учётку `doctor`/`admin`: у такой
   * учётки обязан быть пароль, а у персонала ещё и второй фактор. Раньше портальный гейт срабатывал
   * только если вызывающий сам прислал `roleLoginPortal`, и достаточно было это поле опустить.
   *
   * До этого правила набор здесь утверждал ОБРАТНОЕ — что учётка `admin` по такому запросу получает
   * сессию с кодом 200. Проверка переписана на закрытую границу. Решение владельца С9 от 16.09 сняло
   * последнее исключение по `PLATFORM_OWNER_IDENTITY`: email-код не меняет сохранённую роль.
   */
  it('refuses a bare email+code session for a staff/admin DB role even without an explicit portal', async () => {
    fakes.findByUserId.mockResolvedValue({ ...user, role: 'admin' });

    const response = await POST(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'portal_access_denied' });
    expect(fakes.setSessionFromUser).not.toHaveBeenCalled();
  });

  it('keeps a listed email at its persisted client role after OTP confirmation', async () => {
    fakes.isVerifiedEmailGlobalAdminAsync.mockResolvedValue(true);

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, role: 'client' });
    expect(fakes.setSessionFromUser).toHaveBeenCalledWith(user, 'email_code');
  });

  it('denies an OTP-confirmed credential on an incompatible explicit portal before session minting', async () => {
    fakes.findByUserId.mockResolvedValue({ ...user, role: 'doctor' });

    const response = await POST(request('patient'));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'portal_access_denied' });
    expect(fakes.setSessionFromUser).not.toHaveBeenCalled();
  });

  it('establishes the normal patient session for the OTP-confirmed canonical owner', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, role: 'client' });
    expect(fakes.setSessionFromUser).toHaveBeenCalledWith(user, 'email_code');
  });
});
