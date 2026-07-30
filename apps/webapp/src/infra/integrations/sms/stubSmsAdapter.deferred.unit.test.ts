import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhoneChallengeStore } from '@/modules/auth/phoneChallengeStore';

const fakes = vi.hoisted(() => ({
  assertCanStart: vi.fn(),
  registerSend: vi.fn(),
}));

vi.mock('@/modules/auth/phoneOtpLimits', () => ({
  assertPhoneCanStartChallenge: fakes.assertCanStart,
  registerPhoneSend: fakes.registerSend,
  onPhoneWrongCode: vi.fn(),
  registerPhoneVerifySuccess: vi.fn(),
}));

import { createStubSmsAdapter } from './stubSmsAdapter';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.assertCanStart.mockResolvedValue({ ok: true });
  fakes.registerSend.mockResolvedValue(undefined);
});

describe('stubSmsAdapter deferred public delivery', () => {
  it('stores the policy-matched channel for an undelivered challenge', async () => {
    const store: PhoneChallengeStore = {
      set: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
      delete: vi.fn(),
      deleteByPhone: vi.fn(),
      incrementVerifyAttempts: vi.fn().mockResolvedValue(null),
    };
    const adapter = createStubSmsAdapter({ challengeStore: store });

    const result = await adapter.sendCode('+79991234567', 600, undefined, {
      schedule: vi.fn(),
      suppressDelivery: true,
      challengeDeliveryChannel: 'email',
    });

    expect(result).toMatchObject({ ok: true, retryAfterSeconds: 60 });
    expect(store.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        deliveryChannel: 'email',
        phoneNumberProven: false,
      }),
    );
  });
});
