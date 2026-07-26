import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bindEmailSendPort } from "./emailSendPort";
import { OTP_MAX_VERIFY_ATTEMPTS } from "./otpConstants";

const sendEmailCodeMock = vi.fn();

import {
  confirmEmailChallenge,
  normalizeEmail,
  resetEmailAuthMemStateForTests,
  startEmailChallenge,
  consumeLatestEmailChallengeCodeForUser,
} from "./emailAuth";

describe("normalizeEmail", () => {
  it("trim и нижний регистр", () => {
    expect(normalizeEmail("  User@MAIL.COM ")).toBe("user@mail.com");
  });
});

describe("startEmailChallenge", () => {
  beforeEach(() => {
    sendEmailCodeMock.mockReset();
    sendEmailCodeMock.mockResolvedValue({ ok: true });
    bindEmailSendPort({ sendCode: (...args: unknown[]) => sendEmailCodeMock(...args) });
  });

  it("отклоняет невалидный email", async () => {
    const r = await startEmailChallenge(randomUUID(), "not-an-email");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_email");
  });

  it("принимает корректный email (без БД — in-memory челлендж)", async () => {
    const r = await startEmailChallenge(randomUUID(), "user+tag@example.org");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.challengeId).toBeDefined();
      expect(r.retryAfterSeconds).toBeDefined();
    }
    expect(sendEmailCodeMock).toHaveBeenCalledTimes(1);
    expect(sendEmailCodeMock).toHaveBeenCalledWith("user+tag@example.org", expect.stringMatching(/^\d{6}$/));
  });

  it("возвращает email_send_failed при ошибке отправки через integrator", async () => {
    sendEmailCodeMock.mockResolvedValueOnce({ ok: false, error: "http_503" });
    const r = await startEmailChallenge(randomUUID(), "user@example.org");
    expect(r).toEqual({ ok: false, code: "email_send_failed" });
  });
});

describe("confirmEmailChallenge (in-memory)", () => {
  beforeEach(() => {
    resetEmailAuthMemStateForTests();
    sendEmailCodeMock.mockReset();
    sendEmailCodeMock.mockResolvedValue({ ok: true });
    bindEmailSendPort({ sendCode: (...args: unknown[]) => sendEmailCodeMock(...args) });
  });

  it("подтверждает код и резервирует email за пользователем", async () => {
    const uid = randomUUID();
    const start = await startEmailChallenge(uid, "mine@example.org");
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const code = sendEmailCodeMock.mock.calls[0]?.[1] as string;
    const result = await confirmEmailChallenge(uid, start.challengeId, code);
    expect(result).toEqual({ ok: true });
  });

  it("возвращает email_conflict если email уже занят другим пользователем", async () => {
    const ownerId = randomUUID();
    const otherId = randomUUID();
    const startOwner = await startEmailChallenge(ownerId, "taken@example.org");
    expect(startOwner.ok).toBe(true);
    if (!startOwner.ok) return;
    const ownerCode = sendEmailCodeMock.mock.calls[0]?.[1] as string;
    await confirmEmailChallenge(ownerId, startOwner.challengeId, ownerCode);

    const startOther = await startEmailChallenge(otherId, "taken@example.org");
    expect(startOther.ok).toBe(true);
    if (!startOther.ok) return;
    const otherCode = sendEmailCodeMock.mock.calls[1]?.[1] as string;
    const conflict = await confirmEmailChallenge(otherId, startOther.challengeId, otherCode);
    expect(conflict).toEqual({ ok: false, code: "email_conflict" });
  });
});

/** Submits a wrong code OTP_MAX_VERIFY_ATTEMPTS times against a fresh challenge for `uid`/`email`,
 * tripping the lockout on the final attempt, and returns the reported retryAfterSeconds. "000000"
 * is always wrong: generateEmailCode() only produces 100000-999999 (randomInt lower bound excludes
 * the all-zero code). */
async function triggerEmailLockout(uid: string, email: string): Promise<number> {
  const start = await startEmailChallenge(uid, email);
  if (!start.ok) throw new Error(`expected startEmailChallenge ok, got ${JSON.stringify(start)}`);
  let last: Awaited<ReturnType<typeof confirmEmailChallenge>> | undefined;
  for (let i = 0; i < OTP_MAX_VERIFY_ATTEMPTS; i++) {
    last = await confirmEmailChallenge(uid, start.challengeId, "000000");
  }
  if (!last || last.ok || last.code !== "too_many_attempts") {
    throw new Error(`expected too_many_attempts on the final attempt, got ${JSON.stringify(last)}`);
  }
  return last.retryAfterSeconds ?? -1;
}

describe("decaying OTP lockout (email, in-memory) — night plan C-2 step 3", () => {
  beforeEach(() => {
    resetEmailAuthMemStateForTests();
    sendEmailCodeMock.mockReset();
    sendEmailCodeMock.mockResolvedValue({ ok: true });
    bindEmailSendPort({ sendCode: (...args: unknown[]) => sendEmailCodeMock(...args) });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("escalates 2min -> 4min -> 8min -> 16min -> capped at 30min, then resets to 2min on the next success (NIST SP 800-63B §5.2.2 / OWASP exponential lockout)", async () => {
    const uid = randomUUID();
    const email = "lockout-curve@example.org";
    const expectedSeconds = [120, 240, 480, 960, 1800];

    for (const expected of expectedSeconds) {
      const retryAfterSeconds = await triggerEmailLockout(uid, email);
      expect(retryAfterSeconds).toBe(expected);
      // Wait out exactly the reported duration, then the next escalation cycle can start.
      vi.advanceTimersByTime((retryAfterSeconds + 1) * 1000);
    }

    // A 6th escalation without an intervening success stays capped -- it never grows past 30 min.
    const stillCapped = await triggerEmailLockout(uid, email);
    expect(stillCapped).toBe(1800);
    vi.advanceTimersByTime((stillCapped + 1) * 1000);

    // Reset on success (NIST SP 800-63B §5.2.2: "disregard any previous failed attempts... after
    // successful authentication"): a correct code resets the escalation cycle to 0.
    const start = await startEmailChallenge(uid, email);
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const lastCall = sendEmailCodeMock.mock.calls[sendEmailCodeMock.mock.calls.length - 1];
    const code = lastCall?.[1] as string;
    const ok = await confirmEmailChallenge(uid, start.challengeId, code);
    expect(ok).toEqual({ ok: true });

    // The next lockout after the reset starts short again, at 2 minutes -- not continuing from 1800s.
    const afterReset = await triggerEmailLockout(uid, email);
    expect(afterReset).toBe(120);
  });

  it("a legitimate user who mistypes once is unaffected -- no lockout, no delay, on the very next try", async () => {
    const uid = randomUUID();
    const start = await startEmailChallenge(uid, "mistype@example.org");
    expect(start.ok).toBe(true);
    if (!start.ok) return;
    const code = sendEmailCodeMock.mock.calls[0]?.[1] as string;

    const wrong = await confirmEmailChallenge(uid, start.challengeId, "000000");
    expect(wrong).toEqual({ ok: false, code: "invalid_code" });

    const right = await confirmEmailChallenge(uid, start.challengeId, code);
    expect(right).toEqual({ ok: true });

    // No lockout was ever registered -- a fresh challenge is still allowed immediately.
    const startAgain = await startEmailChallenge(uid, "mistype@example.org");
    expect(startAgain.ok).toBe(true);
  });

  it("no state is unrecoverable: waiting out the reported retryAfterSeconds always unblocks the identity, even at the cap", async () => {
    const uid = randomUUID();
    const email = "bounded@example.org";
    for (let i = 0; i < 5; i++) {
      const retryAfterSeconds = await triggerEmailLockout(uid, email);
      vi.advanceTimersByTime((retryAfterSeconds + 1) * 1000);
    }
    // Even at the 30-minute cap, a fresh challenge succeeds once the reported wait has elapsed --
    // never blocked forever, never requiring anything but waiting (owner constraint: no manual/
    // e-mail unblock, unlike Auth0's default 30-day shape).
    const start = await startEmailChallenge(uid, email);
    expect(start.ok).toBe(true);
  });
});

describe("consumeLatestEmailChallengeCodeForUser", () => {
  beforeEach(() => {
    resetEmailAuthMemStateForTests();
    sendEmailCodeMock.mockReset();
    sendEmailCodeMock.mockResolvedValue({ ok: true });
    bindEmailSendPort({ sendCode: (...args: unknown[]) => sendEmailCodeMock(...args) });
  });

  it("принимает код без challengeId (in-memory челлендж)", async () => {
    const uid = randomUUID();
    const start = await startEmailChallenge(uid, "who@example.org");
    expect(start.ok).toBe(true);
    const sentCode = sendEmailCodeMock.mock.calls[0]?.[1];
    expect(typeof sentCode).toBe("string");
    const consumed = await consumeLatestEmailChallengeCodeForUser(uid, sentCode as string);
    expect(consumed).toEqual({ ok: true });
  });
});
