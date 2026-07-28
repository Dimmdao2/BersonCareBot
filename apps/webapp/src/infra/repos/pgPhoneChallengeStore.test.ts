import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import { createPgPhoneChallengeStore } from './pgPhoneChallengeStore';

describe('createPgPhoneChallengeStore', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it('routes every bootstrap store action through the narrow definer seam', async () => {
    const store = createPgPhoneChallengeStore();
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ ok: true }] })
      .mockResolvedValueOnce({
        rows: [
          {
            phone: '+79990000000',
            expires_at: 2_000_000_000,
            code: '123456',
            channel_context: { otpDelivery: 'sms' },
            verify_attempts: 0,
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ phone_challenge_store_delete: true }] })
      .mockResolvedValueOnce({ rows: [{ phone_challenge_store_delete_by_phone: 1 }] })
      .mockResolvedValueOnce({ rows: [{ verify_attempts: 1 }] });

    await store.set('own-challenge', {
      phone: '+79990000000',
      expiresAt: 2_000_000_000,
      code: '123456',
      deliveryChannel: 'sms',
    });
    await expect(store.get('own-challenge')).resolves.toMatchObject({
      phone: '+79990000000',
      code: '123456',
    });
    await store.delete('own-challenge');
    await store.deleteByPhone?.('+79990000000');
    await expect(store.incrementVerifyAttempts('own-challenge')).resolves.toBe(1);

    const sql = runWebappPgTextMock.mock.calls.map((call) => String(call[0])).join('\n');
    for (const accessor of [
      'app.phone_challenge_store_upsert',
      'app.phone_challenge_store_read',
      'app.phone_challenge_store_delete',
      'app.phone_challenge_store_delete_by_phone',
      'app.phone_challenge_store_increment_attempts',
    ]) {
      expect(sql).toContain(accessor);
    }
    expect(sql).not.toMatch(
      /\b(?:FROM|INTO|UPDATE|DELETE FROM)\s+(?:public\.)?phone_challenges\b/i,
    );
  });

  it('fails closed when an opaque challenge id collides with another phone', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [{ ok: false }] });
    const store = createPgPhoneChallengeStore();

    await expect(
      store.set('other-user-challenge', {
        phone: '+79991111111',
        expiresAt: 2_000_000_000,
        code: '654321',
      }),
    ).rejects.toThrow('Phone challenge could not be stored');
  });
});
