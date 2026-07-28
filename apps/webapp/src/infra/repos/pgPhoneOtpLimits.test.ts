import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
}));

import {
  findLatestPhoneChallengeCreatedAt,
  findPhoneOtpLock,
  registerPhoneOtpLockout,
  resetPhoneOtpLockout,
} from './pgPhoneOtpLimits';

describe('pgPhoneOtpLimits', () => {
  beforeEach(() => {
    runWebappPgTextMock.mockReset();
  });

  it('routes every bootstrap login-limit action through a narrow definer and names no sealed table', async () => {
    runWebappPgTextMock
      .mockResolvedValueOnce({ rows: [{ locked_until: '2000000000' }] })
      .mockResolvedValueOnce({ rows: [{ max_created: '2026-07-27T00:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ locked_until: '2000000120' }] })
      .mockResolvedValueOnce({ rows: [{ phone_auth_reset_otp_lockout: null }] });

    await expect(findPhoneOtpLock('+79990000000')).resolves.toEqual({ locked_until: '2000000000' });
    await expect(findLatestPhoneChallengeCreatedAt('+79990000000')).resolves.toEqual(
      new Date('2026-07-27T00:00:00.000Z'),
    );
    await expect(registerPhoneOtpLockout('+79990000000', 2_000_000_000)).resolves.toBe(
      2_000_000_120,
    );
    await expect(resetPhoneOtpLockout('+79990000000')).resolves.toBeUndefined();

    const sql = runWebappPgTextMock.mock.calls.map((call) => String(call[0])).join('\n');
    for (const accessor of [
      'app.phone_auth_find_otp_lock',
      'app.phone_auth_find_latest_challenge_created_at',
      'app.phone_auth_register_otp_lockout',
      'app.phone_auth_reset_otp_lockout',
    ]) {
      expect(sql).toContain(accessor);
    }
    expect(sql).not.toMatch(/\b(?:public\.)?phone_otp_locks\b/i);
    expect(sql).not.toMatch(/\b(?:public\.)?phone_challenges\b/i);
    expect(runWebappPgTextMock.mock.calls.every((call) => call[1]?.[0] === '+79990000000')).toBe(
      true,
    );
  });
});
