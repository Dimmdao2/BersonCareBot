import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhoneChallengeStore } from '@/modules/auth/phoneChallengeStore';

const fakes = vi.hoisted(() => ({
  assertCanStart: vi.fn(),
  registerSend: vi.fn(),
  deliverSms: vi.fn(),
  sendEmail: vi.fn(),
}));

vi.mock('@/modules/auth/phoneOtpLimits', () => ({
  assertPhoneCanStartChallenge: fakes.assertCanStart,
  registerPhoneSend: fakes.registerSend,
  onPhoneWrongCode: vi.fn(),
  registerPhoneVerifySuccess: vi.fn(),
}));
vi.mock('@/infra/integrations/sms/integratorSmsDelivery', () => ({
  deliverSmsCodeViaIntegrator: fakes.deliverSms,
  logPhoneOtpDeliveryEvent: vi.fn(),
  maskPhoneForOpsLog: vi.fn().mockReturnValue('+7***4567'),
  signIntegratorPayload: vi.fn().mockReturnValue('signature'),
}));
vi.mock('@/infra/integrations/email/integratorEmailAdapter', () => ({
  sendEmailCodeViaIntegrator: fakes.sendEmail,
}));

import { createIntegratorSmsAdapter } from './integratorSmsAdapter';

function createStore(): PhoneChallengeStore {
  return {
    set: vi.fn(),
    get: vi.fn().mockResolvedValue(null),
    delete: vi.fn(),
    deleteByPhone: vi.fn(),
    incrementVerifyAttempts: vi.fn().mockResolvedValue(null),
  };
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  fakes.assertCanStart.mockResolvedValue({ ok: true });
  fakes.registerSend.mockResolvedValue(undefined);
  fakes.deliverSms.mockResolvedValue({
    ok: false,
    code: 'rate_limited',
    retryAfterSeconds: 60,
  });
});

describe('integratorSmsAdapter deferred public delivery', () => {
  it('creates the challenge before response and keeps provider latency/errors in the scheduled task', async () => {
    const store = createStore();
    const scheduled: Array<() => Promise<void>> = [];
    const adapter = createIntegratorSmsAdapter({
      challengeStore: store,
      integratorBaseUrl: 'http://127.0.0.1:4200',
      sharedSecret: 'test-secret',
    });

    const result = await adapter.sendCode(
      '+79991234567',
      600,
      { channel: 'sms' },
      {
        schedule: (task) => scheduled.push(task),
      },
    );

    expect(result).toMatchObject({ ok: true, retryAfterSeconds: 60 });
    expect(store.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        phone: '+79991234567',
        deliveryChannel: 'sms',
        phoneNumberProven: true,
        verifyAttempts: 0,
      }),
    );
    expect(fakes.registerSend).toHaveBeenCalledWith('+79991234567');
    expect(fakes.deliverSms).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    await scheduled[0]!();
    expect(fakes.deliverSms).toHaveBeenCalledTimes(1);
  });

  it('stores an undelivered challenge with the same resend accounting but no phone trust', async () => {
    const store = createStore();
    const scheduled: Array<() => Promise<void>> = [];
    const adapter = createIntegratorSmsAdapter({
      challengeStore: store,
      integratorBaseUrl: 'http://127.0.0.1:4200',
      sharedSecret: 'test-secret',
    });

    const result = await adapter.sendCode('+79991234567', 600, undefined, {
      schedule: (task) => scheduled.push(task),
      suppressDelivery: true,
      challengeDeliveryChannel: 'email',
    });

    expect(result).toMatchObject({ ok: true, retryAfterSeconds: 60 });
    expect(store.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        phone: '+79991234567',
        deliveryChannel: 'email',
        phoneNumberProven: false,
        verifyAttempts: 0,
      }),
    );
    expect(fakes.registerSend).toHaveBeenCalledWith('+79991234567');
    expect(scheduled).toHaveLength(0);
    expect(fakes.deliverSms).not.toHaveBeenCalled();
  });

  it('keeps an upstream messenger 429 out of the public response', async () => {
    const store = createStore();
    const scheduled: Array<() => Promise<void>> = [];
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ ok: false, error: 'rate_limited' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const adapter = createIntegratorSmsAdapter({
      challengeStore: store,
      integratorBaseUrl: 'http://127.0.0.1:4200',
      sharedSecret: 'test-secret',
    });

    const result = await adapter.sendCode(
      '+79991234567',
      600,
      { channel: 'telegram', recipientId: 'tg-1005' },
      { schedule: (task) => scheduled.push(task) },
    );

    expect(result).toMatchObject({ ok: true, retryAfterSeconds: 60 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);

    await expect(scheduled[0]!()).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
