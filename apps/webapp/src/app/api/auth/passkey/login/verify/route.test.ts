import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/shared/types/session';

const fakes = vi.hoisted(() => ({
  finishAuthentication: vi.fn(),
  findUserById: vi.fn(),
  setSession: vi.fn(),
  recordAuthLogin: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: vi.fn() }));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isIndependentAuthMethodEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/modules/auth/authConfirmRateLimit', () => ({
  checkAuthConfirmRateLimit: vi.fn().mockResolvedValue({ limited: false }),
}));
vi.mock('@/app-layer/product-analytics/recordAuthLogin', () => ({
  recordAuthLogin: fakes.recordAuthLogin,
}));
vi.mock('@/modules/auth/service', () => ({ setSessionFromUser: fakes.setSession }));
vi.mock('@/shared/platform-user/isPlatformUserUuid', () => ({
  isPlatformUserUuid: vi.fn(() => true),
}));
vi.mock('@/app-layer/auth/passkeyRuntime', () => ({
  finishPatientPasskeyAuthentication: fakes.finishAuthentication,
  findPasskeyUserById: fakes.findUserById,
}));

import { POST as verifyPasskeyLogin } from '@/app/api/auth/passkey/login/verify/route';

const userId = '00000000-0000-4000-8000-000000000401';

function loginRequest(): Request {
  return new Request('https://app.example.test/api/auth/passkey/login/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      challengeId: '00000000-0000-4000-8000-000000000402',
      response: {
        id: 'a'.repeat(20),
        rawId: 'a'.repeat(20),
        type: 'public-key',
        response: {
          clientDataJSON: 'c'.repeat(20),
          authenticatorData: 'd'.repeat(20),
          signature: 's'.repeat(20),
          userHandle: 'h'.repeat(20),
        },
        clientExtensionResults: {},
      },
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.finishAuthentication.mockResolvedValue(userId);
});

describe('passkey login verify — second factor', () => {
  it('issues a factor_verified staff session directly, without a staff-security continuation', async () => {
    const doctor: SessionUser = {
      userId,
      role: 'doctor',
      displayName: 'Passkey doctor',
      bindings: {},
      sessionEpoch: 1,
    };
    fakes.findUserById.mockResolvedValue(doctor);

    const response = await verifyPasskeyLogin(loginRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, role: 'doctor' });
    expect(fakes.setSession).toHaveBeenCalledOnce();
    const [sessionUser, opts] = fakes.setSession.mock.calls[0];
    expect(sessionUser).toEqual(doctor);
    expect(opts).toEqual({
      staffSecurity: { assurance: 'factor_verified', verifiedAt: expect.any(Number) },
    });
  });

  it('issues a plain session for a patient, with no staffSecurity field at all', async () => {
    const patient: SessionUser = {
      userId,
      role: 'client',
      displayName: 'Passkey patient',
      bindings: {},
      sessionEpoch: 1,
    };
    fakes.findUserById.mockResolvedValue(patient);

    const response = await verifyPasskeyLogin(loginRequest());

    expect(response.status).toBe(200);
    expect(fakes.setSession).toHaveBeenCalledWith(patient, {});
  });
});
