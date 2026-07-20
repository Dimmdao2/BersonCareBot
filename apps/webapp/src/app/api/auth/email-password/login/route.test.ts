import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyLoginMock = vi.fn();
const findByUserIdMock = vi.fn();
const getStatusMock = vi.fn();
const ensureProfileMock = vi.fn();
const getLatestSpecialistSignupIntentForUserMock = vi.fn();
const beginLoginMock = vi.fn();
const issueContinuationMock = vi.fn();
const setSessionFromUserMock = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userPasswordCredentials: { verifyEmailPasswordForLogin: verifyLoginMock },
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
    verifyLoginMock.mockResolvedValue({ userId: user.userId, emailVerified: true });
    findByUserIdMock.mockResolvedValue(user);
    getLatestSpecialistSignupIntentForUserMock.mockResolvedValue(null);
    ensureProfileMock.mockResolvedValue({ enrolled: false, replacementRequired: false });
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
    expect(ensureProfileMock).toHaveBeenCalledWith(user.userId);
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
