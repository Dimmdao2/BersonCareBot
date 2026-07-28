import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentDbPrincipal } from "@bersoncare/db-principal";

const verifyLoginMock = vi.fn();
const findByUserIdMock = vi.fn();
const getStatusMock = vi.fn();
const ensureProfileMock = vi.fn();
const getLatestSpecialistSignupIntentForUserMock = vi.fn();
const beginLoginMock = vi.fn();
const issueContinuationMock = vi.fn();
const setSessionFromUserMock = vi.fn();
const recordFailedPasswordAttemptMock = vi.fn();
const resetFailedPasswordAttemptsMock = vi.fn();
const checkAuthConfirmRateLimitMock = vi.fn();
const waitForPasswordFailureDelayMock = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userPasswordCredentials: {
      verifyEmailPasswordForLogin: verifyLoginMock,
      recordFailedPasswordAttempt: recordFailedPasswordAttemptMock,
      resetFailedPasswordAttempts: resetFailedPasswordAttemptsMock,
    },
    userByPhone: { findByUserId: findByUserIdMock },
    userProjection: { updateRole: vi.fn() },
    staffSecurity: { getStatus: getStatusMock, ensureProfile: ensureProfileMock, beginLogin: beginLoginMock },
    organizationProvisioning: {
      getLatestSpecialistSignupIntentForUser: getLatestSpecialistSignupIntentForUserMock,
    },
  }),
}));

vi.mock("@/modules/auth/envRole", () => ({
  resolveRoleFromEnv: () => "doctor",
  reconcileDbRoleWithEnvRole: (role: string) => role,
}));

vi.mock("@/modules/auth/service", () => ({
  setSessionFromUser: (...args: unknown[]) => setSessionFromUserMock(...args),
}));

vi.mock("@/modules/auth/staffLoginContinuation", () => ({
  issueStaffLoginContinuation: (...args: unknown[]) => issueContinuationMock(...args),
}));

vi.mock("@/modules/auth/authConfirmRateLimit", () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 600,
  checkAuthConfirmRateLimit: (...args: unknown[]) => checkAuthConfirmRateLimitMock(...args),
}));

vi.mock("@/modules/auth/passwordLoginProtection", () => ({
  PASSWORD_LOCK_SECONDS: 900,
  passwordFailurePrincipalId: () => "22222222-2222-4222-8222-222222222222",
  waitForPasswordFailureDelay: (...args: unknown[]) => waitForPasswordFailureDelayMock(...args),
}));

import { POST } from "./route";

const user = {
  userId: "11111111-1111-4111-8111-111111111111",
  role: "doctor" as const,
  displayName: "Owner Doctor",
  bindings: {},
  securityVersion: 1,
  securityFactorRequired: true,
};

function loginRequest() {
  return new Request("http://localhost/api/auth/email-password/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "owner@example.test", password: "correct-password" }),
  });
}

describe("POST /api/auth/email-password/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkAuthConfirmRateLimitMock.mockResolvedValue({ limited: false });
    verifyLoginMock.mockResolvedValue({ ok: true, userId: user.userId, emailVerified: true });
    findByUserIdMock.mockImplementation(async (userId: string) => {
      expect(getCurrentDbPrincipal()).toMatchObject({
        kind: "patient",
        platformUserId: userId,
      });
      return user;
    });
    getLatestSpecialistSignupIntentForUserMock.mockResolvedValue(null);
    ensureProfileMock.mockResolvedValue({ enrolled: false, replacementRequired: false });
  });

  it("returns the shared per-IP 429 before parsing credentials", async () => {
    checkAuthConfirmRateLimitMock.mockResolvedValueOnce({
      limited: true,
      reason: "rate_limited",
    });

    const response = await POST(loginRequest());

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("600");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: 600,
    });
    expect(verifyLoginMock).not.toHaveBeenCalled();
  });

  it("returns proxy_configuration when the shared IP chokepoint cannot resolve a trusted key", async () => {
    checkAuthConfirmRateLimitMock.mockResolvedValueOnce({
      limited: true,
      reason: "proxy_configuration",
    });

    const response = await POST(loginRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: "proxy_configuration",
    });
    expect(verifyLoginMock).not.toHaveBeenCalled();
  });

  it("keeps existing-account and nonexistent-account password failures identical, including delay", async () => {
    const failure = {
      ok: false as const,
      attempts: 5,
      delaySeconds: 30,
      locked: false,
    };
    verifyLoginMock
      .mockResolvedValueOnce({ ...failure, accountUserId: user.userId })
      .mockResolvedValueOnce(failure);

    const existingResponse = await POST(loginRequest());
    const missingResponse = await POST(loginRequest());
    const existingBody = await existingResponse.json();
    const missingBody = await missingResponse.json();

    expect(existingResponse.status).toBe(401);
    expect(missingResponse.status).toBe(401);
    expect(existingBody).toEqual(missingBody);
    expect(existingBody).toEqual({
      ok: false,
      error: "invalid_credentials",
      message: "Email или пароль неверны. Проверьте данные или восстановите пароль.",
    });
    expect(waitForPasswordFailureDelayMock.mock.calls).toEqual([[30], [30]]);
    expect(recordFailedPasswordAttemptMock).toHaveBeenCalledTimes(2);
  });

  it("returns the same temporary lock response on the tenth failure for any identifier", async () => {
    const locked = {
      ok: false as const,
      attempts: 10,
      delaySeconds: 0,
      locked: true,
      retryAfterSeconds: 900,
    };
    verifyLoginMock
      .mockResolvedValueOnce({ ...locked, accountUserId: user.userId })
      .mockResolvedValueOnce(locked);

    const existingResponse = await POST(loginRequest());
    const missingResponse = await POST(loginRequest());

    expect(existingResponse.status).toBe(429);
    expect(missingResponse.status).toBe(429);
    expect(existingResponse.headers.get("Retry-After")).toBe("900");
    expect(await existingResponse.json()).toEqual(await missingResponse.json());
  });

  it("resets the account counter after a successful primary password proof", async () => {
    getStatusMock.mockResolvedValue(null);

    const response = await POST(loginRequest());

    expect(response.status).toBe(200);
    expect(resetFailedPasswordAttemptsMock).toHaveBeenCalledWith(
      user.userId,
      "owner@example.test",
    );
  });

  it("does not issue a staff session before the enrolled factor is completed", async () => {
    getStatusMock.mockResolvedValue({ enrolled: true, replacementRequired: false });
    beginLoginMock.mockResolvedValue({
      required: true,
      token: "one-time-login-token",
      expiresAt: "2030-01-01T00:00:00.000Z",
      replacementRequired: false,
    });

    const response = await POST(loginRequest());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, factorRequired: true });
    expect(issueContinuationMock).toHaveBeenCalledWith({
      userId: user.userId,
      token: "one-time-login-token",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
  });

  it("issues only a restricted enrollment session for a new self-signup profile", async () => {
    getStatusMock.mockResolvedValue({ enrolled: false, replacementRequired: false });

    const response = await POST(loginRequest());
    await expect(response.json()).resolves.toEqual({
      ok: true,
      redirectTo: "/app/account?tab=security",
    });
    expect(setSessionFromUserMock).toHaveBeenCalledWith(user, {
      staffSecurity: { assurance: "pending_enrollment" },
    });
  });

  it("keeps legacy staff login compatible until that account explicitly starts enrollment", async () => {
    getStatusMock.mockResolvedValue(null);
    const response = await POST(loginRequest());
    expect(response.status).toBe(200);
    expect(setSessionFromUserMock).toHaveBeenCalledWith(user, {});
  });

  it("recovers a verified specialist signup without granting an unrestricted legacy session", async () => {
    getStatusMock.mockResolvedValue(null);
    getLatestSpecialistSignupIntentForUserMock.mockResolvedValue({
      id: "intent-1",
      userId: user.userId,
      status: "pending",
    });

    const response = await POST(loginRequest());
    expect(response.status).toBe(200);
    expect(ensureProfileMock).toHaveBeenCalledWith();
    expect(setSessionFromUserMock).toHaveBeenCalledWith(
      { ...user, role: "doctor" },
      { staffSecurity: { assurance: "pending_enrollment" } },
    );
    await expect(response.json()).resolves.toEqual({
      ok: true,
      redirectTo: "/app/account?tab=security",
    });
  });

  it("fails closed when secure signup recovery cannot initialize", async () => {
    getStatusMock.mockResolvedValue(null);
    getLatestSpecialistSignupIntentForUserMock.mockResolvedValue({ id: "intent-1", userId: user.userId });
    ensureProfileMock.mockRejectedValue(new Error("database_unavailable"));

    const response = await POST(loginRequest());
    expect(response.status).toBe(503);
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: "security_setup_pending" });
  });
});
