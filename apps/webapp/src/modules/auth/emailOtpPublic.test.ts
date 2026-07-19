import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bindEmailSendPort } from "./emailSendPort";
import { resetEmailAuthMemStateForTests } from "./emailAuth";
import { startPublicEmailOtpChallenge, startPublicEmailOtpRegistration, confirmPublicEmailOtpChallenge } from "./emailOtpPublic";
import type { EmailOtpPublicDbPort } from "./emailOtpPublicPort";
import { OTP_RESEND_COOLDOWN_SEC } from "./otpConstants";

const sendEmailCodeMock = vi.fn();

/** Minimal in-memory db port for tests. */
function makeInMemDb(overrides?: Partial<EmailOtpPublicDbPort>): EmailOtpPublicDbPort {
  const users = new Map<string, string>(); // emailNorm → userId
  const cooldowns = new Map<string, Date>(); // emailNorm → date

  return {
    async findOrCreatePublicEmailUser(emailNorm) {
      const existing = users.get(emailNorm);
      if (existing) return { userId: existing, wasCreated: false };
      const userId = randomUUID();
      users.set(emailNorm, userId);
      return { userId, wasCreated: true };
    },
    async findPublicEmailUser(emailNorm) {
      const userId = users.get(emailNorm);
      return userId ? { userId } : null;
    },
    async registerPublicEmailPatient({ emailNormalized }) {
      const existing = users.get(emailNormalized);
      if (existing) return { ok: true as const, userId: existing, wasCreated: false };
      const userId = randomUUID();
      users.set(emailNormalized, userId);
      return { ok: true as const, userId, wasCreated: true };
    },
    async deleteUnverifiedPublicEmailRegistration(userId) {
      for (const [email, id] of users) if (id === userId) users.delete(email);
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

  it("returns a generic success for an unknown login email without creating an identity or sending", async () => {
    const db = makeInMemDb();
    const r = await startPublicEmailOtpChallenge("test@example.com", db);
    expect(r.ok).toBe(true);
    expect(sendEmailCodeMock).not.toHaveBeenCalled();
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

  it("sends a code only for a known login email", async () => {
    const existingUserId = randomUUID();
    const findMock = vi.fn(async (_emailNorm: string) => ({ userId: existingUserId }));
    const db = makeInMemDb({ findPublicEmailUser: findMock });

    const r = await startPublicEmailOtpChallenge("existing@example.com", db);
    expect(r.ok).toBe(true);
    expect(findMock).toHaveBeenCalledTimes(1);
    expect(sendEmailCodeMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes email before processing", async () => {
    const db = makeInMemDb({ findPublicEmailUser: async () => ({ userId: randomUUID() }) });
    const r = await startPublicEmailOtpChallenge("  User@EXAMPLE.COM  ", db);
    expect(r.ok).toBe(true);
    // sendEmailAuthCode receives normalized email
    expect(sendEmailCodeMock).toHaveBeenCalledWith("user@example.com", expect.any(String));
  });

  it("returns email_send_failed when email send fails", async () => {
    sendEmailCodeMock.mockResolvedValueOnce({ ok: false, error: "smtp_error" });
    const db = makeInMemDb({ findPublicEmailUser: async () => ({ userId: randomUUID() }) });
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

  it("happy path confirms once, then REJECTS replay of the consumed code (expired_code)", async () => {
    // Full start → confirm → replay cycle on the in-memory emailAuth challenge store.
    let sentCode = "";
    sendEmailCodeMock.mockImplementation(async (_to: string, code: string) => {
      sentCode = code;
      return { ok: true };
    });

    let userId = "";
    const challengeRowRef: { id: string } = { id: "" };
    const db = makeInMemDb({
      async findPublicEmailUser() {
        userId = userId || randomUUID();
        return { userId };
      },
      async findLatestEmailChallengeByEmail() {
        // Simulates the DB row still being visible to the lookup; the challenge
        // store itself (emailAuth in-memory) is the replay gate.
        if (!challengeRowRef.id) return null;
        return {
          id: challengeRowRef.id,
          user_id: userId,
          code_hash: "",
          expires_at: String(Math.floor(Date.now() / 1000) + 600),
          attempts: "0",
        };
      },
    });

    const started = await startPublicEmailOtpChallenge("replay@example.com", db);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    challengeRowRef.id = started.challengeId;
    expect(sentCode).toMatch(/^\d{6}$/);

    // First confirm: succeeds and consumes the challenge.
    const first = await confirmPublicEmailOtpChallenge("replay@example.com", sentCode, db);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.userId).toBe(userId);

    // Replay with the SAME code: challenge is consumed → expired_code, no second login.
    const replay = await confirmPublicEmailOtpChallenge("replay@example.com", sentCode, db);
    expect(replay.ok).toBe(false);
    if (!replay.ok) expect(replay.code).toBe("expired_code");
  });
});

describe("startPublicEmailOtpRegistration", () => {
  beforeEach(() => {
    sendEmailCodeMock.mockReset();
    sendEmailCodeMock.mockResolvedValue({ ok: true });
    bindEmailSendPort({ sendCode: (...args: unknown[]) => sendEmailCodeMock(...args) });
    resetEmailAuthMemStateForTests();
  });

  it("normalizes FIO, derives registration delivery, and keeps optional patronymic null", async () => {
    const registerPublicEmailPatient = vi.fn(async (input: { patronymic: string | null }) => {
      expect(input).toMatchObject({ emailNormalized: "patient@example.com", lastName: "Иванов", firstName: "Иван", patronymic: null });
      return { ok: true as const, userId: randomUUID(), wasCreated: true };
    });
    const db = makeInMemDb({ registerPublicEmailPatient });
    const result = await startPublicEmailOtpRegistration({ email: " Patient@Example.com ", lastName: " иванов ", firstName: "иван", patronymic: " " }, db);
    expect(result.ok).toBe(true);
    expect(sendEmailCodeMock).toHaveBeenCalledTimes(1);
  });

  it("does not overwrite a pending registration and rolls back only a newly created identity on delivery failure", async () => {
    const deleteUnverifiedPublicEmailRegistration = vi.fn();
    const createdId = randomUUID();
    sendEmailCodeMock.mockResolvedValueOnce({ ok: false, error: "smtp" });
    const db = makeInMemDb({
      registerPublicEmailPatient: vi.fn(async () => ({ ok: true as const, userId: createdId, wasCreated: true })),
      deleteUnverifiedPublicEmailRegistration,
    });
    const result = await startPublicEmailOtpRegistration({ email: "patient@example.com", lastName: "Иванов", firstName: "Иван" }, db);
    expect(result).toMatchObject({ ok: false, code: "email_send_failed" });
    expect(deleteUnverifiedPublicEmailRegistration).toHaveBeenCalledWith(createdId);
  });

  it("keeps an existing pending identity when its resend delivery fails", async () => {
    const deleteUnverifiedPublicEmailRegistration = vi.fn();
    sendEmailCodeMock.mockResolvedValueOnce({ ok: false, error: "smtp" });
    const db = makeInMemDb({
      registerPublicEmailPatient: vi.fn(async () => ({ ok: true as const, userId: randomUUID(), wasCreated: false })),
      deleteUnverifiedPublicEmailRegistration,
    });
    await startPublicEmailOtpRegistration({ email: "patient@example.com", lastName: "Иванов", firstName: "Иван" }, db);
    expect(deleteUnverifiedPublicEmailRegistration).not.toHaveBeenCalled();
  });
});
