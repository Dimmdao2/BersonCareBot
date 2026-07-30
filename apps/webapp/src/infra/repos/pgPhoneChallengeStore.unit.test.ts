import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  runWebappPgText: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: fakes.runWebappPgText,
}));

import { createPgPhoneChallengeStore } from './pgPhoneChallengeStore';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pgPhoneChallengeStore phone trust metadata', () => {
  it('round-trips an explicit false value through channel_context', async () => {
    fakes.runWebappPgText.mockResolvedValueOnce({ rows: [{ ok: true }] }).mockResolvedValueOnce({
      rows: [
        {
          phone: '+79991234567',
          expires_at: 2_000_000_000,
          code: '123456',
          verify_attempts: 0,
          channel_context: {
            channel: 'web',
            chatId: 'browser-1005',
            otpDelivery: 'sms',
            phoneNumberProven: false,
          },
        },
      ],
    });
    const store = createPgPhoneChallengeStore();

    await store.set('challenge-1005', {
      phone: '+79991234567',
      expiresAt: 2_000_000_000,
      code: '123456',
      verifyAttempts: 0,
      deliveryChannel: 'sms',
      phoneNumberProven: false,
      channelContext: { channel: 'web', chatId: 'browser-1005' },
    });
    const upsertParams = fakes.runWebappPgText.mock.calls[0]?.[1] as unknown[];
    expect(JSON.parse(String(upsertParams[4]))).toMatchObject({
      otpDelivery: 'sms',
      phoneNumberProven: false,
    });

    await expect(store.get('challenge-1005')).resolves.toMatchObject({
      deliveryChannel: 'sms',
      phoneNumberProven: false,
    });
  });
});
