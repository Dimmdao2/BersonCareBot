import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailOtpPublicDbPort } from './emailOtpPublicPort';

const fakes = vi.hoisted(() => ({
  startEmailChallenge: vi.fn(),
}));

vi.mock('./emailAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./emailAuth')>();
  return { ...actual, startEmailChallenge: fakes.startEmailChallenge };
});

import { startPublicEmailOtpChallenge } from './emailOtpPublic';

const knownUserId = '00000000-0000-4000-8000-000000000027';

function publicDb(options?: {
  userId?: string | null;
  cooldown?: Date | null;
}): EmailOtpPublicDbPort {
  return {
    findOrCreatePublicEmailUser: vi.fn(),
    findPublicEmailUser: vi.fn().mockResolvedValue(
      options?.userId === undefined
        ? { userId: knownUserId }
        : options.userId === null
          ? null
          : { userId: options.userId },
    ),
    registerPublicEmailPatient: vi.fn(),
    consumeLatestEmailChallenge: vi.fn(),
    findEmailSendCooldownByEmail: vi.fn().mockResolvedValue(options?.cooldown ?? null),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-03T09:00:00.000Z'));
  fakes.startEmailChallenge.mockResolvedValue({
    ok: true,
    challengeId: '00000000-0000-4000-8000-000000000101',
    retryAfterSeconds: 60,
  });
});

describe('public email OTP start anti-enumeration', () => {
  it('keeps known and unknown valid email results in the same success schema', async () => {
    const known = await startPublicEmailOtpChallenge('known@example.test', publicDb());
    const unknown = await startPublicEmailOtpChallenge(
      'unknown@example.test',
      publicDb({ userId: null }),
    );

    expect(known).toMatchObject({ ok: true, retryAfterSeconds: 60 });
    expect(unknown).toMatchObject({ ok: true, retryAfterSeconds: 60 });
    expect(Object.keys(unknown).sort()).toEqual(Object.keys(known).sort());
    expect(unknown.ok && unknown.challengeId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('folds provider failure into a neutral result but retains server-only evidence', async () => {
    fakes.startEmailChallenge.mockResolvedValueOnce({ ok: false, code: 'email_send_failed' });

    const result = await startPublicEmailOtpChallenge('known@example.test', publicDb());

    expect(result).toMatchObject({ ok: true, retryAfterSeconds: 60, deliveryFailed: true });
    expect(result).not.toHaveProperty('code');
    expect(result.ok && result.challengeId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('preserves invalid-email and per-email rate-limit results', async () => {
    const invalid = await startPublicEmailOtpChallenge('not-an-email', publicDb());
    const limited = await startPublicEmailOtpChallenge(
      'known@example.test',
      publicDb({ cooldown: new Date(Date.now() - 5_000) }),
    );

    expect(invalid).toEqual({ ok: false, code: 'invalid_email' });
    expect(limited).toEqual({ ok: false, code: 'rate_limited', retryAfterSeconds: 55 });
    expect(fakes.startEmailChallenge).not.toHaveBeenCalled();
  });
});
