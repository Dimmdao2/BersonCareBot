import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmPhoneAuthResult } from '@/modules/auth/phoneAuth';
import type { PhoneChallengePayload } from '@/modules/auth/phoneChallengeStore';
import type { SessionUser } from '@/shared/types/session';
import type { PhoneOtpDelivery } from '@/modules/auth/smsPort';

type StartPhoneAuth = (
  phone: string,
  context: { channel: 'web'; chatId: string; displayName?: string },
  options?: { delivery?: PhoneOtpDelivery },
) => Promise<
  | { ok: true; challengeId: string; retryAfterSeconds?: number }
  | { ok: false; code: string; retryAfterSeconds?: number }
>;

const fakes = vi.hoisted(() => ({
  findByPhone: vi.fn<(phone: string) => Promise<SessionUser | null>>(),
  getVerifiedEmail: vi.fn<(userId: string) => Promise<string | null>>(),
  startPhoneAuth: vi.fn<StartPhoneAuth>(),
  isChannelEnabled: vi.fn<(channel: string) => Promise<boolean>>(),
  assertCanStart:
    vi.fn<
      (
        phone: string,
      ) => Promise<{ ok: true } | { ok: false; code: string; retryAfterSeconds?: number }>
    >(),
  registerSend: vi.fn<(phone: string) => Promise<void>>(),
  getPhoneChallenge: vi.fn<(challengeId: string) => Promise<PhoneChallengePayload | null>>(),
  confirmPhoneAuth: vi.fn<(challengeId: string, code: string) => Promise<ConfirmPhoneAuthResult>>(),
  checkConfirmRateLimit:
    vi.fn<
      () => Promise<
        | { limited: false }
        | { limited: true; reason?: 'proxy_configuration'; retryAfterSeconds?: number }
      >
    >(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/app-layer/product-analytics/recordAuthRegistration', () => ({
  newRegistrationAttemptId: () => 'registration-attempt',
  recordAuthRegistrationAttempt: vi.fn(),
  recordAuthRegistrationFailure: vi.fn(),
  recordAuthRegistrationSuccess: vi.fn(),
}));
vi.mock('@/modules/auth/service', () => ({ getCurrentSession: vi.fn() }));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: vi.fn(),
}));
vi.mock('@/modules/auth/authConfirmRateLimit', () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 600,
  checkAuthConfirmRateLimit: fakes.checkConfirmRateLimit,
}));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
}));
vi.mock('@/modules/auth/verifiedStaffPrimaryLogin', () => ({
  prepareVerifiedPrimaryLogin: vi.fn(),
}));
vi.mock('@/shared/platform-user/isPlatformUserUuid', () => ({
  isPlatformUserUuid: vi.fn().mockReturnValue(false),
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isAuthChannelEnabled: fakes.isChannelEnabled,
}));
vi.mock('@/modules/auth/phoneOtpLimits', () => ({
  assertPhoneCanStartChallenge: fakes.assertCanStart,
  registerPhoneSend: fakes.registerSend,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    userByPhone: {
      findByPhone: fakes.findByPhone,
      getVerifiedEmailForUser: fakes.getVerifiedEmail,
    },
    auth: {
      startPhoneAuth: fakes.startPhoneAuth,
      getPhoneChallenge: fakes.getPhoneChallenge,
      confirmPhoneAuth: fakes.confirmPhoneAuth,
    },
  }),
}));

import { POST as startPhone } from '@/app/api/auth/phone/start/route';
import { POST as confirmPhone } from '@/app/api/auth/phone/confirm/route';

const user: SessionUser = {
  userId: '00000000-0000-4000-8000-000000001005',
  role: 'client',
  displayName: 'Fallback test user',
  bindings: {},
  sessionEpoch: 0,
};

function request(body: object): Request {
  return new Request('https://app.example.test/api/auth/phone/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function finishResponse(promise: Promise<Response>): Promise<Response> {
  await vi.advanceTimersByTimeAsync(500);
  return promise;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-07-30T05:00:00.000Z'));
  vi.clearAllMocks();
  fakes.assertCanStart.mockResolvedValue({ ok: true });
  fakes.registerSend.mockResolvedValue(undefined);
  fakes.startPhoneAuth.mockResolvedValue({
    ok: true,
    challengeId: 'real-challenge-id-1005',
    retryAfterSeconds: 60,
  });
  fakes.isChannelEnabled.mockResolvedValue(true);
  fakes.findByPhone.mockResolvedValue(user);
  fakes.getVerifiedEmail.mockResolvedValue('verified@example.test');
  fakes.getPhoneChallenge.mockResolvedValue(null);
  fakes.confirmPhoneAuth.mockResolvedValue({ ok: false, code: 'expired_code' });
  fakes.checkConfirmRateLimit.mockResolvedValue({ limited: false });
});

describe('phone login decoy confirmation', () => {
  it('keeps a missing decoy challenge indistinguishable from a wrong real code', async () => {
    const decoy = await confirmPhone(
      request({
        challengeId: 'decoy-challenge-1005',
        code: '000000',
      }),
    );

    fakes.getPhoneChallenge.mockResolvedValueOnce({
      phone: '+79991234567',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      deliveryChannel: 'email',
    });
    fakes.confirmPhoneAuth.mockResolvedValueOnce({ ok: false, code: 'invalid_code' });
    const realWrongCode = await confirmPhone(
      request({
        challengeId: 'real-challenge-1005',
        code: '000000',
      }),
    );

    expect(decoy.status).toBe(400);
    expect(realWrongCode.status).toBe(400);
    await expect(decoy.json()).resolves.toEqual(await realWrongCode.json());
    expect(fakes.isChannelEnabled).toHaveBeenCalledTimes(1);
    expect(fakes.isChannelEnabled).toHaveBeenCalledWith('email');
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('phone login automatic delivery fallback', () => {
  it('uses SMS first when the platform channel and the entered number allow it', async () => {
    const response = await finishResponse(
      startPhone(
        request({
          phone: '+79991234567',
          channel: 'web',
          chatId: 'browser-1005',
          purpose: 'login',
        }),
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      challengeId: 'real-challenge-id-1005',
      retryAfterSeconds: 60,
      deliveryChannel: 'automatic',
    });
    expect(fakes.startPhoneAuth).toHaveBeenCalledWith(
      '+79991234567',
      { channel: 'web', chatId: 'browser-1005', displayName: undefined },
      expect.objectContaining({ delivery: { channel: 'sms' } }),
    );
    expect(fakes.getVerifiedEmail).not.toHaveBeenCalled();
  });

  it('falls back to a verified email without exposing whether the phone has an account', async () => {
    fakes.isChannelEnabled.mockImplementation(async (channel) => channel === 'email');
    const delivered = await finishResponse(
      startPhone(
        request({
          phone: '+79991234567',
          channel: 'web',
          chatId: 'browser-1005',
          purpose: 'login',
        }),
      ),
    );
    const deliveredBody = (await delivered.json()) as Record<string, unknown>;

    expect(fakes.startPhoneAuth).toHaveBeenCalledWith(
      '+79991234567',
      { channel: 'web', chatId: 'browser-1005', displayName: undefined },
      expect.objectContaining({
        delivery: { channel: 'email', email: 'verified@example.test' },
      }),
    );

    fakes.findByPhone.mockResolvedValueOnce(null);
    fakes.startPhoneAuth.mockClear();
    const noAccount = await finishResponse(
      startPhone(
        request({
          phone: '+79991234567',
          channel: 'web',
          chatId: 'browser-1005',
          purpose: 'login',
        }),
      ),
    );
    const noAccountBody = (await noAccount.json()) as Record<string, unknown>;

    expect(noAccount.status).toBe(delivered.status);
    expect(Object.keys(noAccountBody).sort()).toEqual(Object.keys(deliveredBody).sort());
    expect(noAccountBody).toMatchObject({
      ok: true,
      retryAfterSeconds: 60,
      deliveryChannel: 'automatic',
    });
    expect(String(noAccountBody.challengeId)).toHaveLength(
      String(deliveredBody.challengeId).length,
    );
    expect(fakes.startPhoneAuth).not.toHaveBeenCalled();
    expect(fakes.registerSend).toHaveBeenCalledWith('+79991234567');
  });

  it('keeps a delivery-provider failure on the same public success shape', async () => {
    fakes.isChannelEnabled.mockImplementation(async (channel) => channel === 'email');
    fakes.startPhoneAuth.mockResolvedValueOnce({ ok: false, code: 'delivery_failed' });

    const response = await finishResponse(
      startPhone(
        request({
          phone: '+79991234567',
          channel: 'web',
          chatId: 'browser-1005',
          purpose: 'login',
        }),
      ),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      retryAfterSeconds: 60,
      deliveryChannel: 'automatic',
    });
    expect(typeof body.challengeId).toBe('string');
    expect(fakes.registerSend).toHaveBeenCalledWith('+79991234567');
  });

  it('does not reintroduce account enumeration through an explicit email request', async () => {
    fakes.isChannelEnabled.mockImplementation(async (channel) => channel === 'email');
    const available = await finishResponse(
      startPhone(
        request({
          phone: '+79991234567',
          channel: 'web',
          chatId: 'browser-1005',
          purpose: 'login',
          deliveryChannel: 'email',
        }),
      ),
    );
    const availableBody = (await available.json()) as Record<string, unknown>;

    fakes.findByPhone.mockResolvedValueOnce(null);
    fakes.startPhoneAuth.mockClear();
    const unavailable = await finishResponse(
      startPhone(
        request({
          phone: '+79991234567',
          channel: 'web',
          chatId: 'browser-1005',
          purpose: 'login',
          deliveryChannel: 'email',
        }),
      ),
    );
    const unavailableBody = (await unavailable.json()) as Record<string, unknown>;

    expect(unavailable.status).toBe(available.status);
    expect(Object.keys(unavailableBody).sort()).toEqual(Object.keys(availableBody).sort());
    expect(unavailableBody).toMatchObject({
      ok: true,
      retryAfterSeconds: 60,
      deliveryChannel: 'email',
    });
    expect(fakes.startPhoneAuth).not.toHaveBeenCalled();
    expect(fakes.registerSend).toHaveBeenCalledWith('+79991234567');
  });
});
