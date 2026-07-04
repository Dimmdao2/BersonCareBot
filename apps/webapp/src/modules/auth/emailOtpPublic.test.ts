import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindEmailSendPort } from "./emailSendPort";
import { resetEmailAuthMemStateForTests } from "./emailAuth";
import { startPublicEmailOtpChallenge, confirmPublicEmailOtpChallenge } from "./emailOtpPublic";
import type { EmailOtpPublicDbPort } from "./emailOtpPublicPort";
import { OTP_RESEND_COOLDOWN_SEC } from "./otpConstants";

const sendEmailCodeMock = vi.fn();

/** Minimal in-memory db port for tests. */
function makeInMemDb(overrides?: Partial<EmailOtpPublicDbPort>): EmailOtpPublicDbPort {
  const users = new Map<string, string>(); // emailNorm → userId
  const cooldowns = new Map<string, Date>(); // emailNorm → date

  return {
    async findOrCreatePublicEmailUser(emailNorm) {
      let userId = users.get(emailNorm);
      if (userId) return { userId, wasCreated: false };
      userId = randomUUID();
      users.set(emailNorm, userId);
      return { userId, wasCreated: true };
    },
    async findLatestEmailChallengeByEmail(_emailNorm, _nowSec) {
      // Not used in start tests; confirm tests handle this via live emailAuth in-memory
      return null;
    },
    async findEmailSendCooldownByEmail(emailNorm) {
      return cooldowns.get(emailNorm) ?? null;
    },
    ...overrides,
  };
}

describe("startPublicEmailOtpChallenge", () => {
  beforeEach(() => {
    sendEmailCodeMock.mockReset();
    sendEmailCodeMock.mockResolvedValue({ ok: true });
    bindEmailSendPort({ sendCode: (...args: unknown[]) => sendEmailCodeMock(...args) });
    resetEmailAuthMemStateForTests();
  });

  it("rejects invalid email format", async () => {
    const db = makeInMemDb();
    const r = await startPublicEmailOtpChallenge("not-an-email", db);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_email");
    expect(sendEmailCodeMock).not.toHaveBeenCalled();
  });

  it("sends code for valid email and returns challengeId", async () => {
    const db = makeInMemDb();
    const r = await startPublicEmailOtpChallenge("test@example.com", db);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.challengeId).toBeDefined();
      expect(r.retryAfterSeconds).toBe(OTP_RESEND_COOLDOWN_SEC);
    }
    expect(sendEmailCodeMock).toHaveBeenCalledTimes(1);
    expect(sendEmailCodeMock).toHaveBeenCalledWith("test@example.com", expect.stringMatching(/^\d{6}$/));
  });

  it("rejects when email is rate-limited (within cooldown window)", async () => {
    const now = new Date();
    const db = makeInMemDb({
      async findEmailSendCooldownByEmail() {
        return now; // just sent — within cooldown window
      },
    });
    const r = await startPublicEmailOtpChallenge("test@example.com", db);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("rate_limited");
      expect(r.retryAfterSeconds).toBeGreaterThan(0);
    }
    expect(sendEmailCodeMock).not.toHaveBeenCalled();
  });

  it("reuses existing user when email already registered", async () => {
    const existingUserId = randomUUID();
    const findOrCreateMock = vi.fn(async (_emailNorm: string) => ({
      userId: existingUserId,
      wasCreated: false,
    }));
    const db = makeInMemDb({ findOrCreatePublicEmailUser: findOrCreateMock });

    const r = await startPublicEmailOtpChallenge("existing@example.com", db);
    expect(r.ok).toBe(true);
    expect(findOrCreateMock).toHaveBeenCalledTimes(1);
    expect(sendEmailCodeMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes email before processing", async () => {
    const db = makeInMemDb();
    const r = await startPublicEmailOtpChallenge("  User@EXAMPLE.COM  ", db);
    expect(r.ok).toBe(true);
    // sendEmailAuthCode receives normalized email
    expect(sendEmailCodeMock).toHaveBeenCalledWith("user@example.com", expect.any(String));
  });

  it("returns email_send_failed when email send fails", async () => {
    sendEmailCodeMock.mockResolvedValueOnce({ ok: false, error: "smtp_error" });
    const db = makeInMemDb();
    const r = await startPublicEmailOtpChallenge("test@example.com", db);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("email_send_failed");
  });
});

describe("confirmPublicEmailOtpChallenge (in-memory path via emailAuth)", () => {
  beforeEach(() => {
    sendEmailCodeMock.mockReset();
    sendEmailCodeMock.mockResolvedValue({ ok: true });
    bindEmailSendPort({ sendCode: (...args: unknown[]) => sendEmailCodeMock(...args) });
    resetEmailAuthMemStateForTests();
  });

  it("returns expired_code when no challenge exists for email", async () => {
    const db = makeInMemDb({
      async findLatestEmailChallengeByEmail() {
        return null;
      },
    });
    const r = await confirmPublicEmailOtpChallenge("test@example.com", "123456", db);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("expired_code");
  });

  it("returns invalid_code for empty code", async () => {
    const db = makeInMemDb();
    const r = await confirmPublicEmailOtpChallenge("test@example.com", "", db);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_code");
  });
});
