import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPasswordChangeService } from "./passwordChange";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
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
  const hashPassword = vi.fn();
  const getStatus = vi.fn();
  const revokeSessions = vi.fn();
  const invalidateSessionsForSelf = vi.fn();
  const updatePasswordHash = vi.fn();
  const findByUserId = vi.fn();

  const service = createPasswordChangeService({
    credentials: { tryVerifyLogin, updatePasswordHash },
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
    tryVerifyLogin.mockResolvedValue({ userId: OTHER_USER_ID });

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
  });

  it("changes the hash, revokes old epochs, and returns the fresh epoch for the surviving current session", async () => {
    const events: string[] = [];
    const freshUser = { ...currentUser, sessionEpoch: 6 };
    tryVerifyLogin.mockResolvedValue({ userId: USER_ID });
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
    expect(events).toEqual([
      "staff-revoke",
      "epoch-revoke",
      "password-write",
      "fresh-user-read",
    ]);
    expect(currentUser.sessionEpoch).not.toBe(freshUser.sessionEpoch);
  });
});
