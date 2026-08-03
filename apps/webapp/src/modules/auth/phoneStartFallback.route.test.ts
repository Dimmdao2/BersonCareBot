import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfirmPhoneAuthResult } from '@/modules/auth/phoneAuth';
import type { PhoneChallengePayload } from '@/modules/auth/phoneChallengeStore';
import type { SessionUser } from '@/shared/types/session';
import type { DeferredPhoneOtpDelivery, PhoneOtpDelivery } from '@/modules/auth/smsPort';
import type { AuthChannelPolicy } from '@/modules/auth/authChannelPolicy';

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
  getClientVisiblePolicy: vi.fn<() => Promise<AuthChannelPolicy>>(),
  resolveAuthOtpChannel: vi.fn<(userId: string) => Promise<'sms' | 'telegram' | 'max' | 'email' | null>>(),
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
  getClientVisibleAuthChannelPolicy: fakes.getClientVisiblePolicy,
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
    channelPreferences: {
      resolveAuthOtpChannel: fakes.resolveAuthOtpChannel,
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
  fakes.getClientVisiblePolicy.mockResolvedValue({
    email: true,
    sms: true,
    telegram: true,
    max: true,
  });
  fakes.findByPhone.mockResolvedValue(user);
  fakes.getVerifiedEmail.mockResolvedValue('verified@example.test');
  fakes.isPhoneTrusted.mockResolvedValue(true);
  fakes.resolveAuthOtpChannel.mockResolvedValue(null);
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

describe('phone login automatic delivery fallback', () => {
  it('bootstraps via SMS when no preferred/default channel is resolved', async () => {
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
      expect.objectContaining({
        delivery: { channel: 'sms' },
        deferredDelivery: { schedule: fakes.after },
      }),
    );
    expect(fakes.getVerifiedEmail).not.toHaveBeenCalled();
  });

  it('uses the resolved default channel (email) without exposing whether the phone has an account', async () => {
    fakes.getClientVisiblePolicy.mockResolvedValue({
      email: true,
      sms: false,
      telegram: false,
      max: false,
    });
    fakes.resolveAuthOtpChannel.mockResolvedValue('email');
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
        deferredDelivery: { schedule: fakes.after },
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
    expect(fakes.startPhoneAuth).toHaveBeenCalledWith(
      '+79991234567',
      { channel: 'web', chatId: 'browser-1005', displayName: undefined },
      expect.objectContaining({
        deferredDelivery: expect.objectContaining({
          schedule: fakes.after,
          suppressDelivery: true,
          challengeDeliveryChannel: 'email',
        }),
      }),
    );
    const noAccountOptions = fakes.startPhoneAuth.mock.calls.at(-1)?.[2];
    await noAccountOptions?.deferredDelivery?.onDeliveryResult?.({
      ok: false,
      code: 'delivery_failed',
    });
    expect(fakes.recordRegistrationAttempt).toHaveBeenCalledTimes(1);
    expect(fakes.recordRegistrationFailure).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: 'delivery_failed' }),
    );
    expect(fakes.recordRegistrationSuccess).not.toHaveBeenCalled();
  });

  it('uses the resolved default channel when SMS is not effectively available', async () => {
    fakes.isChannelEnabled.mockResolvedValue(true);
    fakes.getClientVisiblePolicy.mockResolvedValue({
      email: true,
      sms: false,
      telegram: false,
      max: false,
    });
    fakes.resolveAuthOtpChannel.mockResolvedValue('email');

    await finishResponse(
      startPhone(
        request({
          phone: '+79991234567',
          channel: 'web',
          chatId: 'browser-1005',
          purpose: 'login',
        }),
      ),
    );

    expect(fakes.startPhoneAuth).toHaveBeenCalledWith(
      '+79991234567',
      { channel: 'web', chatId: 'browser-1005', displayName: undefined },
      expect.objectContaining({ delivery: { channel: 'email', email: 'verified@example.test' } }),
    );
  });

  it('does not send an email login code for an untrusted entered phone', async () => {
    fakes.getClientVisiblePolicy.mockResolvedValue({
      email: true,
      sms: false,
      telegram: false,
      max: false,
    });
    fakes.resolveAuthOtpChannel.mockResolvedValue('email');
    fakes.isPhoneTrusted.mockResolvedValue(false);

    await finishResponse(
      startPhone(
        request({
          phone: '+79991234567',
          channel: 'web',
          chatId: 'browser-1005',
          purpose: 'login',
        }),
      ),
    );

    expect(fakes.startPhoneAuth).toHaveBeenCalledWith(
      '+79991234567',
      { channel: 'web', chatId: 'browser-1005', displayName: undefined },
      expect.objectContaining({
        deferredDelivery: expect.objectContaining({
          suppressDelivery: true,
          challengeDeliveryChannel: 'email',
        }),
      }),
    );
  });

  it('prefers the resolved channel (telegram) over SMS bootstrap even when SMS is available', async () => {
    fakes.findByPhone.mockResolvedValue({ ...user, bindings: { telegramId: 'tg-1005' } });
    fakes.resolveAuthOtpChannel.mockResolvedValue('telegram');

    await finishResponse(
      startPhone(
        request({
          phone: '+79991234567',
          channel: 'web',
          chatId: 'browser-1005',
          purpose: 'login',
        }),
      ),
    );

    expect(fakes.startPhoneAuth).toHaveBeenCalledWith(
      '+79991234567',
      { channel: 'web', chatId: 'browser-1005', displayName: undefined },
      expect.objectContaining({ delivery: { channel: 'telegram', recipientId: 'tg-1005' } }),
    );
    expect(fakes.getVerifiedEmail).not.toHaveBeenCalled();
  });

  it('does not resolve before the public response floor', async () => {
    let settled = false;
    const responsePromise = startPhone(
      request({
        phone: '+79991234567',
        channel: 'web',
        chatId: 'browser-1005',
        purpose: 'login',
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
    expect(fakes.startPhoneAuth).toHaveBeenCalledWith(
      '+79991234567',
      { channel: 'web', chatId: 'browser-1005', displayName: undefined },
      expect.objectContaining({
        deferredDelivery: expect.objectContaining({
          schedule: fakes.after,
          suppressDelivery: true,
          challengeDeliveryChannel: 'email',
        }),
      }),
    );
  });

  it('does not trust a client-claimed Telegram context to bypass opaque login', async () => {
    fakes.isChannelEnabled.mockImplementation(async (channel) => channel === 'email');
    fakes.findByPhone.mockResolvedValueOnce(null);

    const response = await finishResponse(
      startPhone(
        request({
          phone: '+79991234567',
          channel: 'telegram',
          chatId: 'attacker-controlled',
          purpose: 'login',
          deliveryChannel: 'email',
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
          challengeDeliveryChannel: 'email',
        }),
      }),
    );
  });
});
