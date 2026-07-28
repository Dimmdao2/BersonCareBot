import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPasswordChangeService } from "./passwordChange";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const currentUser = {
  userId: USER_ID,
  role: "doctor" as const,
  displayName: "Врач",
  bindings: {},
  sessionEpoch: 4,
};

describe("password change service", () => {
  const getVerifiedEmailForUser = vi.fn();
  const tryVerifyLogin = vi.fn();
  const recordFailedPasswordAttempt = vi.fn();
  const resetFailedPasswordAttempts = vi.fn();
  const hashPassword = vi.fn();
  const getStatus = vi.fn();
  const revokeSessions = vi.fn();
  const invalidateSessionsForSelf = vi.fn();
  const updatePasswordHash = vi.fn();
  const findByUserId = vi.fn();

  const service = createPasswordChangeService({
    credentials: {
      tryVerifyLogin,
      recordFailedPasswordAttempt,
      resetFailedPasswordAttempts,
      updatePasswordHash,
    },
    users: {
      getVerifiedEmailForUser,
      invalidateSessionsForSelf,
      findByUserId,
    },
    staffSecurity: { getStatus, revokeSessions },
    hashPassword,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getVerifiedEmailForUser.mockResolvedValue("Doctor@Example.com");
    hashPassword.mockResolvedValue("argon2:new-password");
    getStatus.mockResolvedValue(null);
  });

  it("rejects a wrong current password without changing credentials or sessions", async () => {
    tryVerifyLogin.mockResolvedValue({
      ok: false,
      accountUserId: USER_ID,
      attempts: 1,
      delaySeconds: 0,
      locked: false,
    });

    await expect(
      service.changePassword({
        userId: USER_ID,
        currentPassword: "wrong-password",
        newPassword: "new-password",
      }),
    ).resolves.toEqual({ ok: false, error: "wrong_current_password" });

    expect(hashPassword).not.toHaveBeenCalled();
    expect(tryVerifyLogin).toHaveBeenCalledWith(
      "doctor@example.com",
      "wrong-password",
    );
    expect(invalidateSessionsForSelf).not.toHaveBeenCalled();
    expect(updatePasswordHash).not.toHaveBeenCalled();
    expect(recordFailedPasswordAttempt).toHaveBeenCalledWith(USER_ID);
  });

  it("reports the temporary account lock with its next safe retry", async () => {
    tryVerifyLogin.mockResolvedValue({
      ok: false,
      accountUserId: USER_ID,
      attempts: 10,
      delaySeconds: 0,
      locked: true,
      retryAfterSeconds: 900,
    });

    await expect(
      service.changePassword({
        userId: USER_ID,
        currentPassword: "wrong-password",
        newPassword: "new-password",
      }),
    ).resolves.toEqual({
      ok: false,
      error: "password_temporarily_locked",
      retryAfterSeconds: 900,
    });
    expect(recordFailedPasswordAttempt).toHaveBeenCalledWith(USER_ID);
  });

  it("changes the hash, revokes old epochs, and returns the fresh epoch for the surviving current session", async () => {
    const events: string[] = [];
    const freshUser = { ...currentUser, sessionEpoch: 6 };
    tryVerifyLogin.mockResolvedValue({
      ok: true,
      userId: USER_ID,
      emailVerified: true,
    });
    getStatus.mockResolvedValue({
      enrolled: true,
      recoveryConfirmed: true,
      replacementRequired: false,
      lockedUntil: null,
      sessionVersion: 3,
    });
    revokeSessions.mockImplementation(async () => {
      events.push("staff-revoke");
      return 4;
    });
    invalidateSessionsForSelf.mockImplementation(async () => {
      events.push("epoch-revoke");
    });
    updatePasswordHash.mockImplementation(async () => {
      events.push("password-write");
    });
    findByUserId.mockImplementation(async () => {
      events.push("fresh-user-read");
      return freshUser;
    });

    const result = await service.changePassword({
      userId: USER_ID,
      currentPassword: "current-password",
      newPassword: "new-password",
    });

    expect(result).toEqual({ ok: true, user: freshUser });
    expect(updatePasswordHash).toHaveBeenCalledWith(USER_ID, "argon2:new-password");
    expect(resetFailedPasswordAttempts).toHaveBeenCalledWith(
      USER_ID,
      "doctor@example.com",
    );
    expect(events).toEqual([
      "staff-revoke",
      "epoch-revoke",
      "password-write",
      "fresh-user-read",
    ]);
    expect(currentUser.sessionEpoch).not.toBe(freshUser.sessionEpoch);
  });
});
