import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmPhoneAuthResult } from '@/modules/auth/phoneAuth';
import type { PhoneChallengePayload } from '@/modules/auth/phoneChallengeStore';
import type { SessionUser } from '@/shared/types/session';
import type { DeferredPhoneOtpDelivery, PhoneOtpDelivery } from '@/modules/auth/smsPort';

type StartPhoneAuth = (
  phone: string,
  context: { channel: 'web'; chatId: string; displayName?: string },
  options?: { delivery?: PhoneOtpDelivery; deferredDelivery?: DeferredPhoneOtpDelivery },
) => Promise<
  | { ok: true; challengeId: string; retryAfterSeconds?: number }
  | { ok: false; code: string; retryAfterSeconds?: number }
>;

const fakes = vi.hoisted(() => ({
  findByPhone: vi.fn<(phone: string) => Promise<SessionUser | null>>(),
  getVerifiedEmail: vi.fn<(userId: string) => Promise<string | null>>(),
  isPhoneTrusted: vi.fn<(userId: string) => Promise<boolean>>(),
  startPhoneAuth: vi.fn<StartPhoneAuth>(),
  after: vi.fn<(task: () => Promise<void>) => void>(),
  recordRegistrationAttempt: vi.fn(),
  recordRegistrationFailure: vi.fn(),
  recordRegistrationSuccess: vi.fn(),
  isChannelEnabled: vi.fn<(channel: string) => Promise<boolean>>(),
  surface: {
    current: 'patient_default' as
      'patient_default' | 'patient_branded' | 'staff' | 'platform_admin',
    availableMethods: ['phone_bot'] as string[],
  },
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

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: fakes.after };
});
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/app-layer/product-analytics/recordAuthRegistration', () => ({
  newRegistrationAttemptId: () => 'registration-attempt',
  recordAuthRegistrationAttempt: fakes.recordRegistrationAttempt,
  recordAuthRegistrationFailure: fakes.recordRegistrationFailure,
  recordAuthRegistrationSuccess: fakes.recordRegistrationSuccess,
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
vi.mock('@/shared/lib/surface/requestSurface', () => ({
  requireResolvedSurface: () => ({
    surface: fakes.surface.current,
    publicOrigin: 'https://app.example.test',
    authPolicy: {
      availableMethods: fakes.surface.availableMethods,
      enabledMethods: fakes.surface.availableMethods,
    },
  }),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    userByPhone: {
      findByPhone: fakes.findByPhone,
      getVerifiedEmailForUser: fakes.getVerifiedEmail,
      isPhoneTrustedForUser: fakes.isPhoneTrusted,
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

// D15b/6: phone-start no longer calls `getVerifiedEmailForUser`/`isPhoneTrustedForUser` — it
// derives both facts from `SessionUser.contacts`, which `findByPhone` now returns in the same
// pre-session door call (see `pgUserByPhone.findByPhone`). The fixture below carries a confirmed
// primary phone and confirmed primary e-mail so the default fixtures below behave exactly like the
// old `isPhoneTrusted=true` / `getVerifiedEmail='verified@example.test'` mocks did.
const user: SessionUser = {
  userId: '00000000-0000-4000-8000-000000001005',
  role: 'client',
  displayName: 'Fallback test user',
  bindings: {},
  sessionEpoch: 0,
  contacts: [
    {
      kind: 'phone',
      value: '+79991234567',
      isPrimary: true,
      confirmedAt: '2026-01-01T00:00:00.000Z',
      sourceOrigin: 'direct',
    },
    {
      kind: 'email',
      value: 'verified@example.test',
      isPrimary: true,
      confirmedAt: '2026-01-01T00:00:00.000Z',
      sourceOrigin: 'direct',
    },
  ],
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
  fakes.after.mockImplementation(() => undefined);
  fakes.recordRegistrationAttempt.mockResolvedValue(undefined);
  fakes.recordRegistrationFailure.mockResolvedValue(undefined);
  fakes.recordRegistrationSuccess.mockResolvedValue(undefined);
  fakes.startPhoneAuth.mockResolvedValue({
    ok: true,
    challengeId: 'real-challenge-id-1005',
    retryAfterSeconds: 60,
  });
  fakes.isChannelEnabled.mockResolvedValue(true);
  fakes.surface.current = 'patient_default';
  fakes.surface.availableMethods = ['phone_bot'];
  fakes.findByPhone.mockResolvedValue(user);
  fakes.getVerifiedEmail.mockResolvedValue('verified@example.test');
  fakes.isPhoneTrusted.mockResolvedValue(true);
  fakes.getPhoneChallenge.mockResolvedValue(null);
  fakes.confirmPhoneAuth.mockResolvedValue({ ok: false, code: 'expired_code' });
  fakes.checkConfirmRateLimit.mockResolvedValue({ limited: false });
});

describe('phone login decoy confirmation', () => {
  it('keeps the wrong-code sequence identical through the attempt limit', async () => {
    fakes.isChannelEnabled.mockImplementation(async (channel) => channel === 'email');
    const challenge: PhoneChallengePayload = {
      phone: '+79991234567',
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      deliveryChannel: 'email',
    };
    fakes.getPhoneChallenge.mockResolvedValue(challenge);

    const runSequence = async (challengeId: string) => {
      fakes.confirmPhoneAuth
        .mockResolvedValueOnce({ ok: false, code: 'invalid_code' })
        .mockResolvedValueOnce({ ok: false, code: 'invalid_code' })
        .mockResolvedValueOnce({ ok: false, code: 'invalid_code' })
        .mockResolvedValueOnce({ ok: false, code: 'too_many_attempts', retryAfterSeconds: 900 });
      const responses: Array<{ status: number; body: unknown }> = [];
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await confirmPhone(request({ challengeId, code: '000000' }));
        responses.push({ status: response.status, body: await response.json() });
      }
      return responses;
    };

    const deliverable = await runSequence('deliverable-challenge-1005');
    const undeliverable = await runSequence('undeliverable-challenge-1005');

    expect(undeliverable).toEqual(deliverable);
    expect(deliverable.map(({ status }) => status)).toEqual([400, 400, 400, 429]);
    expect(fakes.isChannelEnabled).toHaveBeenCalledTimes(8);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('phone login surface and explicit delivery', () => {
  it('rejects a surface without phone_bot before channel checks or identity lookup', async () => {
    fakes.surface.current = 'staff';
    fakes.surface.availableMethods = ['password', 'totp', 'passkey'];

    const response = await startPhone(request({}));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'auth_method_disabled',
    });
    expect(fakes.isChannelEnabled).not.toHaveBeenCalled();
    expect(fakes.findByPhone).not.toHaveBeenCalled();
    expect(fakes.startPhoneAuth).not.toHaveBeenCalled();
  });

  it('requires a human-selected delivery channel instead of choosing one automatically', async () => {
    const response = await startPhone(
      request({ phone: '+79991234567', channel: 'web', purpose: 'login' }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'delivery_channel_required',
    });
    expect(fakes.isChannelEnabled).not.toHaveBeenCalled();
    expect(fakes.findByPhone).not.toHaveBeenCalled();
    expect(fakes.startPhoneAuth).not.toHaveBeenCalled();
  });

  it('rejects public SMS before identity lookup instead of bootstrapping it', async () => {
    const response = await startPhone(
      request({
        phone: '+79991234567',
        purpose: 'login',
        deliveryChannel: 'sms',
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'sms_disabled_web',
    });
    expect(fakes.isChannelEnabled).not.toHaveBeenCalled();
    expect(fakes.findByPhone).not.toHaveBeenCalled();
    expect(fakes.startPhoneAuth).not.toHaveBeenCalled();
  });

  it('does not resolve an explicit public channel response before the timing floor', async () => {
    let settled = false;
    const responsePromise = startPhone(
      request({
        phone: '+79991234567',
        channel: 'web',
        chatId: 'browser-1005',
        purpose: 'login',
        deliveryChannel: 'telegram',
      }),
    ).then((response) => {
      settled = true;
      return response;
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(499);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect((await responsePromise).status).toBe(200);
  });

  /**
   * Явный `deliveryChannel: 'email'` на двери входа ПО НОМЕРУ больше не принимается: раньше эта
   * кнопка («подтвердить по email») слала код на адрес аккаунта, найденного по введённому номеру, не
   * спросив адрес. Владелец 16.09.2026: «меня даже не спросили ввести имейл — просто куда-то
   * отправили… если я случайно ошибся в номере… я хочу поменять способ входа — но не могу ввести
   * правильный имейл». Отказ зависит ТОЛЬКО от запрошенного канала и наступает до поиска аккаунта,
   * поэтому перечислить через него аккаунты по-прежнему нельзя.
   */
  it('refuses an explicit email request without ever looking up the account', async () => {
    fakes.isChannelEnabled.mockImplementation(async (channel) => channel === 'email');
    const known = await finishResponse(
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
    const knownBody = (await known.json()) as Record<string, unknown>;

    const unknown = await finishResponse(
      startPhone(
        request({
          phone: '+79995550000',
          channel: 'web',
          chatId: 'browser-1005',
          purpose: 'login',
          deliveryChannel: 'email',
        }),
      ),
    );
    const unknownBody = (await unknown.json()) as Record<string, unknown>;

    expect(known.status).toBe(400);
    expect(unknown.status).toBe(known.status);
    expect(unknownBody).toEqual(knownBody);
    expect(knownBody).toMatchObject({ ok: false, error: 'channel_unavailable' });
    expect(fakes.findByPhone).not.toHaveBeenCalled();
    expect(fakes.startPhoneAuth).not.toHaveBeenCalled();
  });

  it('keeps a requested Telegram response identical for linked and unknown numbers', async () => {
    fakes.isChannelEnabled.mockImplementation(async (channel) => channel === 'telegram');
    fakes.findByPhone.mockResolvedValueOnce({
      ...user,
      bindings: { telegramId: 'tg-1005' },
    });

    const linked = await finishResponse(
      startPhone(
        request({
          phone: '+79991234567',
          channel: 'web',
          chatId: 'browser-1005',
          purpose: 'login',
          deliveryChannel: 'telegram',
        }),
      ),
    );
    const linkedBody = (await linked.json()) as Record<string, unknown>;

    fakes.findByPhone.mockResolvedValueOnce(null);
    const unknown = await finishResponse(
      startPhone(
        request({
          phone: '+79995550000',
          channel: 'web',
          chatId: 'browser-1005',
          purpose: 'login',
          deliveryChannel: 'telegram',
        }),
      ),
    );
    const unknownBody = (await unknown.json()) as Record<string, unknown>;

    expect(unknown.status).toBe(linked.status);
    expect(Object.keys(unknownBody).sort()).toEqual(Object.keys(linkedBody).sort());
    expect(unknownBody).toMatchObject({
      ok: true,
      retryAfterSeconds: 60,
      deliveryChannel: 'telegram',
    });
    expect(String(unknownBody.challengeId)).toHaveLength(String(linkedBody.challengeId).length);
  });

  it('does not trust a client-claimed Telegram context to bypass opaque login', async () => {
    fakes.isChannelEnabled.mockImplementation(async (channel) => channel === 'telegram');
    fakes.findByPhone.mockResolvedValueOnce(null);

    const response = await finishResponse(
      startPhone(
        request({
          phone: '+79991234567',
          channel: 'telegram',
          chatId: 'attacker-controlled',
          purpose: 'login',
          deliveryChannel: 'telegram',
        }),
      ),
    );

    expect(response.status).toBe(200);
    expect(fakes.startPhoneAuth).toHaveBeenCalledWith(
      '+79991234567',
      { channel: 'web', chatId: 'attacker-controlled', displayName: undefined },
      expect.objectContaining({
        deferredDelivery: expect.objectContaining({
          schedule: fakes.after,
          suppressDelivery: true,
          challengeDeliveryChannel: 'telegram',
        }),
      }),
    );
  });
});
