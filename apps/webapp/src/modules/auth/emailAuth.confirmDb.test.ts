import { createHash, randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailAuthDbPort } from "@/modules/auth/emailAuthPort";
import { bindEmailSendPort } from "@/modules/auth/emailSendPort";
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
  updateEmailChallengeAttempts: vi.fn(),
  findEmailOwnerConflict: vi.fn(),
  verifyUserEmail: vi.fn(),
  claimVerifiedEmail: vi.fn(),
  findEmailChallengeForConsume: vi.fn(),
  findLatestEmailChallengeForUser: vi.fn(),
  findLatestPendingEmailChallengeForUser: vi.fn(),
};

describe("confirmEmailChallenge (database)", () => {
  beforeEach(() => {
    vi.mocked(dbMock.findEmailChallengeForConfirm).mockReset();
    vi.mocked(dbMock.deleteEmailChallengeById).mockReset();
    vi.mocked(dbMock.updateEmailChallengeAttempts).mockReset();
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
    });
    vi.mocked(dbMock.claimVerifiedEmail).mockResolvedValueOnce({ ok: false, code: "email_conflict" });

    const result = await confirmEmailChallenge(userId, challengeId, code);
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
    });
    vi.mocked(dbMock.claimVerifiedEmail).mockResolvedValueOnce({ ok: true, merged: false });

    const result = await confirmEmailChallenge(userId, challengeId, code);
    expect(result).toEqual({ ok: true });
    expect(dbMock.claimVerifiedEmail).toHaveBeenCalledWith(userId, "free@example.org", undefined);
    expect(dbMock.deleteEmailChallengesForUser).toHaveBeenCalledWith(userId);
  });
});
