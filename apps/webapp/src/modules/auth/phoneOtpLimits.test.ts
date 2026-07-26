import { describe, expect, it } from "vitest";
import { inMemoryPhoneChallengeStore } from "@/infra/repos/inMemoryPhoneChallengeStore";
import { OTP_MAX_VERIFY_ATTEMPTS, OTP_RESEND_COOLDOWN_SEC } from "@/modules/auth/otpConstants";
import type { PhoneChallengeStore } from "@/modules/auth/phoneChallengeStore";
import {
  assertPhoneCanStartChallenge,
  onPhoneWrongCode,
  registerPhoneSend,
} from "@/modules/auth/phoneOtpLimits";

describe("onPhoneWrongCode", () => {
  it("даёт invalid_code до лимита попыток, затем too_many_attempts", async () => {
    const challengeId = `test-ch-${Math.random().toString(36).slice(2)}`;
    const phone = "+79998887766";
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    await inMemoryPhoneChallengeStore.set(challengeId, {
      phone,
      expiresAt,
      code: "123456",
      verifyAttempts: 0,
    });

    for (let i = 0; i < OTP_MAX_VERIFY_ATTEMPTS - 1; i++) {
      const r = await onPhoneWrongCode(phone, challengeId, inMemoryPhoneChallengeStore);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("invalid_code");
    }

    const last = await onPhoneWrongCode(phone, challengeId, inMemoryPhoneChallengeStore);
    expect(last.ok).toBe(false);
    if (!last.ok) {
      expect(last.code).toBe("too_many_attempts");
      expect(last.retryAfterSeconds).toBeDefined();
    }
  });

  it("a legitimate user who mistypes the code once still gets a fresh invalid_code, not too_many_attempts, on the next try", async () => {
    const challengeId = `test-ch-retry-${Math.random().toString(36).slice(2)}`;
    const phone = "+79994443322";
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    await inMemoryPhoneChallengeStore.set(challengeId, {
      phone,
      expiresAt,
      code: "123456",
      verifyAttempts: 0,
    });

    const first = await onPhoneWrongCode(phone, challengeId, inMemoryPhoneChallengeStore);
    expect(first).toEqual({ ok: false, code: "invalid_code" });
    const second = await onPhoneWrongCode(phone, challengeId, inMemoryPhoneChallengeStore);
    expect(second).toEqual({ ok: false, code: "invalid_code" });

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
  it("N concurrent wrong-code attempts against the same challenge are all counted -- no lost update", async () => {
    const challengeId = `test-ch-concurrent-${Math.random().toString(36).slice(2)}`;
    const phone = "+79993332211";
    const expiresAt = Math.floor(Date.now() / 1000) + 600;

    let sharedAttempts = 0;
    const store: PhoneChallengeStore = {
      async get() {
        return { phone, expiresAt, code: "123456", verifyAttempts: sharedAttempts };
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
      expect(result).toEqual({ ok: false, code: "invalid_code" });
    }
    expect(sharedAttempts).toBe(N);
  });
});

describe("assertPhoneCanStartChallenge (EXEC H.1.6 — cooldown по номеру)", () => {
  it("после отправки на номер A блокирует повтор до cooldown; другой номер B — сразу ок (как после исправления номера)", async () => {
    const phoneA = "+79991110001";
    const phoneB = "+79992220002";

    let g = await assertPhoneCanStartChallenge(phoneA);
    expect(g).toEqual({ ok: true });

    await registerPhoneSend(phoneA);

    g = await assertPhoneCanStartChallenge(phoneA);
    expect(g.ok).toBe(false);
    if (g.ok === false) {
      expect(g.code).toBe("rate_limited");
      expect(g.retryAfterSeconds).toBeGreaterThan(0);
      expect(g.retryAfterSeconds).toBeLessThanOrEqual(OTP_RESEND_COOLDOWN_SEC);
    }

    const gB = await assertPhoneCanStartChallenge(phoneB);
    expect(gB).toEqual({ ok: true });
  });
});
