import { describe, expect, it } from "vitest";
import { inMemoryPhoneChallengeStore } from "@/infra/repos/inMemoryPhoneChallengeStore";
import { OTP_MAX_VERIFY_ATTEMPTS, OTP_RESEND_COOLDOWN_SEC } from "@/modules/auth/otpConstants";
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
