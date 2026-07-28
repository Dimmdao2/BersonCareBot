import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inMemoryPhoneChallengeStore } from '@/infra/repos/inMemoryPhoneChallengeStore';
import { OTP_MAX_VERIFY_ATTEMPTS, OTP_RESEND_COOLDOWN_SEC } from '@/modules/auth/otpConstants';
import type { PhoneChallengeStore } from '@/modules/auth/phoneChallengeStore';
import {
  assertPhoneCanStartChallenge,
  onPhoneWrongCode,
  registerPhoneSend,
  registerPhoneVerifySuccess,
} from '@/modules/auth/phoneOtpLimits';

function freshPhone(): string {
  // Unique per test: phoneOtpLimits.ts's in-memory maps have no exported reset, same reason every
  // existing test in this file already uses a distinct number.
  return `+7900${Math.floor(1_000_000 + Math.random() * 8_000_000)}`;
}

/** Submits a wrong code OTP_MAX_VERIFY_ATTEMPTS times against a fresh challenge for `phone`,
 * tripping the lockout on the final attempt, and returns the reported retryAfterSeconds. */
async function triggerPhoneLockout(phone: string): Promise<number> {
  const challengeId = `lockout-ch-${Math.random().toString(36).slice(2)}`;
  const expiresAt = Math.floor(Date.now() / 1000) + 600;
  await inMemoryPhoneChallengeStore.set(challengeId, {
    phone,
    expiresAt,
    code: '123456',
    verifyAttempts: 0,
  });
  let last: Awaited<ReturnType<typeof onPhoneWrongCode>> | undefined;
  for (let i = 0; i < OTP_MAX_VERIFY_ATTEMPTS; i++) {
    last = await onPhoneWrongCode(phone, challengeId, inMemoryPhoneChallengeStore);
  }
  if (!last || last.ok || last.code !== 'too_many_attempts') {
    throw new Error(`expected too_many_attempts on the final attempt, got ${JSON.stringify(last)}`);
  }
  return last.retryAfterSeconds ?? -1;
}

describe('onPhoneWrongCode', () => {
  it('даёт invalid_code до лимита попыток, затем too_many_attempts', async () => {
    const challengeId = `test-ch-${Math.random().toString(36).slice(2)}`;
    const phone = '+79998887766';
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    await inMemoryPhoneChallengeStore.set(challengeId, {
      phone,
      expiresAt,
      code: '123456',
      verifyAttempts: 0,
    });

    for (let i = 0; i < OTP_MAX_VERIFY_ATTEMPTS - 1; i++) {
      const r = await onPhoneWrongCode(phone, challengeId, inMemoryPhoneChallengeStore);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('invalid_code');
    }

    const last = await onPhoneWrongCode(phone, challengeId, inMemoryPhoneChallengeStore);
    expect(last.ok).toBe(false);
    if (!last.ok) {
      expect(last.code).toBe('too_many_attempts');
      expect(last.retryAfterSeconds).toBeDefined();
    }
  });

  it('a legitimate user who mistypes the code once still gets a fresh invalid_code, not too_many_attempts, on the next try', async () => {
    const challengeId = `test-ch-retry-${Math.random().toString(36).slice(2)}`;
    const phone = '+79994443322';
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    await inMemoryPhoneChallengeStore.set(challengeId, {
      phone,
      expiresAt,
      code: '123456',
      verifyAttempts: 0,
    });

    const first = await onPhoneWrongCode(phone, challengeId, inMemoryPhoneChallengeStore);
    expect(first).toEqual({ ok: false, code: 'invalid_code' });
    const second = await onPhoneWrongCode(phone, challengeId, inMemoryPhoneChallengeStore);
    expect(second).toEqual({ ok: false, code: 'invalid_code' });

    const stored = await inMemoryPhoneChallengeStore.get(challengeId);
    expect(stored?.verifyAttempts).toBe(2);
  });

  /**
   * B-x atomicity proof (night plan C-2, step 1), mirroring
   * emailAuth.confirmDb.test.ts's mock-level proof. `incrementVerifyAttempts` here models the DB's
   * own guarantee for `UPDATE phone_challenges SET verify_attempts = verify_attempts + 1 ...
   * RETURNING` (pgPhoneChallengeStore.ts): it mutates a SHARED counter the instant it is called,
   * with no `await` between reading the current value and writing the incremented one back --
   * exactly what makes a real Postgres UPDATE atomic under concurrent writers to the same row. A
   * true multi-connection Postgres proof lives in
   * pgPhoneChallengeAtomicAttempts.devDb.integration.test.ts (opt-in, mutating DEV/scratch DB).
   */
  it('N concurrent wrong-code attempts against the same challenge are all counted -- no lost update', async () => {
    const challengeId = `test-ch-concurrent-${Math.random().toString(36).slice(2)}`;
    const phone = '+79993332211';
    const expiresAt = Math.floor(Date.now() / 1000) + 600;

    let sharedAttempts = 0;
    const store: PhoneChallengeStore = {
      async get() {
        return { phone, expiresAt, code: '123456', verifyAttempts: sharedAttempts };
      },
      async set() {},
      async delete() {},
      async incrementVerifyAttempts() {
        sharedAttempts += 1;
        return sharedAttempts;
      },
    };

    const N = OTP_MAX_VERIFY_ATTEMPTS - 1;
    const results = await Promise.all(
      Array.from({ length: N }, () => onPhoneWrongCode(phone, challengeId, store)),
    );

    expect(results).toHaveLength(N);
    for (const result of results) {
      expect(result).toEqual({ ok: false, code: 'invalid_code' });
    }
    expect(sharedAttempts).toBe(N);
  });
});

describe('assertPhoneCanStartChallenge (EXEC H.1.6 — cooldown по номеру)', () => {
  it('после отправки на номер A блокирует повтор до cooldown; другой номер B — сразу ок (как после исправления номера)', async () => {
    const phoneA = '+79991110001';
    const phoneB = '+79992220002';

    let g = await assertPhoneCanStartChallenge(phoneA);
    expect(g).toEqual({ ok: true });

    await registerPhoneSend(phoneA);

    g = await assertPhoneCanStartChallenge(phoneA);
    expect(g.ok).toBe(false);
    if (g.ok === false) {
      expect(g.code).toBe('rate_limited');
      expect(g.retryAfterSeconds).toBeGreaterThan(0);
      expect(g.retryAfterSeconds).toBeLessThanOrEqual(OTP_RESEND_COOLDOWN_SEC);
    }

    const gB = await assertPhoneCanStartChallenge(phoneB);
    expect(gB).toEqual({ ok: true });
  });
});

describe('decaying OTP lockout (phone, in-memory) — night plan C-2 step 3', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('escalates 2min -> 4min -> 8min -> 16min -> capped at 30min, then resets to 2min on the next success (NIST SP 800-63B §5.2.2 / OWASP exponential lockout)', async () => {
    const phone = freshPhone();
    const expectedSeconds = [120, 240, 480, 960, 1800];

    for (const expected of expectedSeconds) {
      const retryAfterSeconds = await triggerPhoneLockout(phone);
      expect(retryAfterSeconds).toBe(expected);
      // Gate blocks a fresh challenge for the FULL reported duration, no more, no less.
      const blocked = await assertPhoneCanStartChallenge(phone);
      expect(blocked.ok).toBe(false);
      // Wait out exactly the reported duration, then the next escalation cycle can start.
      vi.advanceTimersByTime((retryAfterSeconds + 1) * 1000);
      const unblocked = await assertPhoneCanStartChallenge(phone);
      expect(unblocked).toEqual({ ok: true });
    }

    // A 6th escalation without an intervening success stays capped -- it never grows past 30 min.
    const stillCapped = await triggerPhoneLockout(phone);
    expect(stillCapped).toBe(1800);
    vi.advanceTimersByTime((stillCapped + 1) * 1000);

    // Reset on success (NIST SP 800-63B §5.2.2): a successful verification resets the cycle to 0.
    await registerPhoneVerifySuccess(phone);
    const afterReset = await triggerPhoneLockout(phone);
    expect(afterReset).toBe(120);
  });

  it('a legitimate user who mistypes the code once is unaffected -- no lockout, no delay, on the very next try', async () => {
    const phone = freshPhone();
    const challengeId = `retry-ch-${Math.random().toString(36).slice(2)}`;
    await inMemoryPhoneChallengeStore.set(challengeId, {
      phone,
      expiresAt: Math.floor(Date.now() / 1000) + 600,
      code: '123456',
      verifyAttempts: 0,
    });

    const wrong = await onPhoneWrongCode(phone, challengeId, inMemoryPhoneChallengeStore);
    expect(wrong).toEqual({ ok: false, code: 'invalid_code' });

    // No lockout was ever registered for this phone -- starting a fresh challenge is still allowed.
    const gate = await assertPhoneCanStartChallenge(phone);
    expect(gate).toEqual({ ok: true });
  });

  it('no state is unrecoverable: waiting out the reported retryAfterSeconds always unblocks the phone, even at the cap', async () => {
    const phone = freshPhone();
    for (let i = 0; i < 5; i++) {
      const retryAfterSeconds = await triggerPhoneLockout(phone);
      vi.advanceTimersByTime((retryAfterSeconds + 1) * 1000);
    }
    // Even at the 30-minute cap, a fresh challenge succeeds once the reported wait has elapsed --
    // never blocked forever, never requiring anything but waiting.
    const gate = await assertPhoneCanStartChallenge(phone);
    expect(gate).toEqual({ ok: true });
  });
});
