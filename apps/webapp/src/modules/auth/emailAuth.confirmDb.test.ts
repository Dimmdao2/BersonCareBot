import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailAuthDbPort } from "@/modules/auth/emailAuthPort";
import { bindEmailSendPort } from "@/modules/auth/emailSendPort";
import { OTP_MAX_VERIFY_ATTEMPTS } from "@/modules/auth/otpConstants";
import { bindEmailAuthDbPort, confirmEmailChallenge } from "./emailAuth";

vi.mock("@/config/env", () => ({
  env: { DATABASE_URL: "postgres://test/db", SESSION_COOKIE_SECRET: "test-secret" },
  integratorWebhookSecret: () => "test-pepper",
}));

const dbMock: EmailAuthDbPort = {
  findEmailSendCooldown: vi.fn(),
  deleteEmailChallengesForUser: vi.fn(),
  insertEmailChallenge: vi.fn(),
  deleteEmailChallengeById: vi.fn(),
  upsertEmailSendCooldown: vi.fn(),
  findEmailChallengeForConfirm: vi.fn(),
  incrementEmailChallengeAttempts: vi.fn(),
  findEmailOwnerConflict: vi.fn(),
  verifyUserEmail: vi.fn(),
  claimVerifiedEmail: vi.fn(),
  findEmailChallengeForConsume: vi.fn(),
  findLatestEmailChallengeForUser: vi.fn(),
  findLatestPendingEmailChallengeForUser: vi.fn(),
  findEmailOtpLock: vi.fn().mockResolvedValue(null),
  registerEmailOtpLockout: vi.fn().mockResolvedValue(120),
  resetEmailOtpLockout: vi.fn().mockResolvedValue(undefined),
};

describe("confirmEmailChallenge (database)", () => {
  beforeEach(() => {
    vi.mocked(dbMock.findEmailChallengeForConfirm).mockReset();
    vi.mocked(dbMock.deleteEmailChallengeById).mockReset();
    vi.mocked(dbMock.incrementEmailChallengeAttempts).mockReset();
    vi.mocked(dbMock.findEmailOwnerConflict).mockReset();
    vi.mocked(dbMock.verifyUserEmail).mockReset();
    vi.mocked(dbMock.claimVerifiedEmail).mockReset();
    vi.mocked(dbMock.deleteEmailChallengesForUser).mockReset();
    bindEmailAuthDbPort(dbMock);
    bindEmailSendPort({ sendCode: vi.fn().mockResolvedValue({ ok: true }) });
  });

  it("возвращает email_conflict при занятом email в platform_users", async () => {
    const code = "123456";
    const codeHash = createHash("sha256").update(`${code}:test-pepper`).digest("hex");
    const userId = randomUUID();
    const challengeId = randomUUID();

    vi.mocked(dbMock.findEmailChallengeForConfirm).mockResolvedValueOnce({
      id: challengeId,
      email: "busy@example.org",
      code_hash: codeHash,
      expires_at: String(Math.floor(Date.now() / 1000) + 600),
      attempts: "0",
      purpose: "email_verify",
    });
    vi.mocked(dbMock.claimVerifiedEmail).mockResolvedValueOnce({ ok: false, code: "email_conflict" });

    const result = await confirmEmailChallenge(userId, challengeId, code, "email_verify");
    expect(result).toEqual({ ok: false, code: "email_conflict" });
    expect(dbMock.deleteEmailChallengesForUser).toHaveBeenCalledWith(userId);
  });

  it("подтверждает email при валидном коде и свободном адресе", async () => {
    const code = "654321";
    const codeHash = createHash("sha256").update(`${code}:test-pepper`).digest("hex");
    const userId = randomUUID();
    const challengeId = randomUUID();

    vi.mocked(dbMock.findEmailChallengeForConfirm).mockResolvedValueOnce({
      id: challengeId,
      email: "free@example.org",
      code_hash: codeHash,
      expires_at: String(Math.floor(Date.now() / 1000) + 600),
      attempts: "0",
      purpose: "email_verify",
    });
    vi.mocked(dbMock.claimVerifiedEmail).mockResolvedValueOnce({ ok: true, merged: false });

    const result = await confirmEmailChallenge(userId, challengeId, code, "email_verify");
    expect(result).toEqual({ ok: true });
    expect(dbMock.claimVerifiedEmail).toHaveBeenCalledWith(userId, "free@example.org", undefined);
    expect(dbMock.deleteEmailChallengesForUser).toHaveBeenCalledWith(userId);
  });

  /**
   * B-x atomicity proof (night plan C-2, step 1). Mock-level concurrency, not a real Postgres race:
   * `incrementEmailChallengeAttempts` here models the DB's own guarantee for
   * `UPDATE email_challenges SET attempts = attempts + 1 ... RETURNING attempts` (migration 0247) --
   * it mutates a SHARED counter the instant it is called, with no `await` between reading the
   * current value and writing the incremented one back. That is exactly what makes a real Postgres
   * UPDATE atomic: the row's write lock serializes concurrent statements so the second writer's
   * `+ 1` always applies to the first writer's already-committed value. Firing N `confirmEmailChallenge`
   * calls through `Promise.all` below proves the APPLICATION layer now delegates the increment
   * entirely to the DB call rather than computing `next = attempts + 1` itself from an earlier,
   * separate read (the old `updateEmailChallengeAttempts(challengeId, next)` shape) -- that
   * computed-in-JS-then-absolute-write shape is exactly what would under-count here, because every
   * one of the N calls reads the SAME stale `attempts: "0"` from `findEmailChallengeForConfirm`
   * before racing to increment. A true multi-connection Postgres proof (real row lock, real
   * concurrent backends) lives in
   * pgEmailChallengeAtomicAttempts.devDb.integration.test.ts (opt-in, mutating DEV/scratch DB).
   */
  it("B-x: N concurrent wrong-code confirms against the same challenge each get a distinct, correctly-incremented count -- no lost update", async () => {
    const userId = randomUUID();
    const challengeId = randomUUID();
    const codeHash = createHash("sha256").update("999999:test-pepper").digest("hex");

    vi.mocked(dbMock.findEmailChallengeForConfirm).mockResolvedValue({
      id: challengeId,
      email: "concurrent@example.org",
      code_hash: codeHash,
      expires_at: String(Math.floor(Date.now() / 1000) + 600),
      attempts: "0",
      purpose: "email_verify",
    });

    let sharedAttempts = 0;
    vi.mocked(dbMock.incrementEmailChallengeAttempts).mockImplementation(async () => {
      sharedAttempts += 1;
      return sharedAttempts;
    });

    // Stay one under the cap so every one of the N calls reports invalid_code, not too_many_attempts
    // -- this test is about the COUNT being right, the cap-crossing behaviour is covered separately.
    const N = OTP_MAX_VERIFY_ATTEMPTS - 1;
    const results = await Promise.all(
      Array.from({ length: N }, () => confirmEmailChallenge(userId, challengeId, "000000", "email_verify")),
    );

    expect(results).toHaveLength(N);
    for (const result of results) {
      expect(result).toEqual({ ok: false, code: "invalid_code" });
    }
    // Every one of the N concurrent wrong-code attempts reached the DB increment call...
    expect(dbMock.incrementEmailChallengeAttempts).toHaveBeenCalledTimes(N);
    // ...and the counter landed on exactly N. Under the old absolute-set shape, every call would
    // have computed next=1 from the same stale read and the counter would have landed on 1, not N.
    expect(sharedAttempts).toBe(N);
  });

  it("a legitimate user who mistypes the code once still gets in on the very next try", async () => {
    const code = "246810";
    const codeHash = createHash("sha256").update(`${code}:test-pepper`).digest("hex");
    const userId = randomUUID();
    const challengeId = randomUUID();

    vi.mocked(dbMock.findEmailChallengeForConfirm).mockResolvedValue({
      id: challengeId,
      email: "retry@example.org",
      code_hash: codeHash,
      expires_at: String(Math.floor(Date.now() / 1000) + 600),
      attempts: "0",
      purpose: "email_verify",
    });
    vi.mocked(dbMock.incrementEmailChallengeAttempts).mockResolvedValueOnce(1);
    vi.mocked(dbMock.claimVerifiedEmail).mockResolvedValueOnce({ ok: true, merged: false });

    const wrong = await confirmEmailChallenge(userId, challengeId, "000000", "email_verify");
    expect(wrong).toEqual({ ok: false, code: "invalid_code" });

    const right = await confirmEmailChallenge(userId, challengeId, code, "email_verify");
    expect(right).toEqual({ ok: true });
    expect(dbMock.incrementEmailChallengeAttempts).toHaveBeenCalledTimes(1);
  });
});
