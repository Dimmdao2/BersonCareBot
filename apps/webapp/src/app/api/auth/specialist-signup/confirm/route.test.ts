import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmEmailChallengeMock = vi.fn();
const provisionSpecialistOwnerMock = vi.fn();
const getSpecialistSignupIntentByChallengeIdMock = vi.fn();
const findUserIdByEmailChallengeIdMock = vi.fn();
const findByUserIdMock = vi.fn();
const setSessionFromUserMock = vi.fn();
const getCurrentSessionMock = vi.fn();
const ensureProfileMock = vi.fn();
const getSpecialistSignupEnabledMock = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userPasswordCredentials: {
      findUserIdByEmailChallengeId: findUserIdByEmailChallengeIdMock,
    },
    organizationProvisioning: {
      provisionSpecialistOwner: provisionSpecialistOwnerMock,
      getSpecialistSignupIntentByChallengeId: getSpecialistSignupIntentByChallengeIdMock,
    },
    userByPhone: {
      findByUserId: findByUserIdMock,
    },
    staffSecurity: {
      ensureProfile: ensureProfileMock,
    },
  }),
}));

vi.mock("@/modules/auth/emailAuth", () => ({
  confirmEmailChallenge: (...args: unknown[]) => confirmEmailChallengeMock(...args),
}));

vi.mock("@/modules/auth/service", () => ({
  setSessionFromUser: (...args: unknown[]) => setSessionFromUserMock(...args),
  getCurrentSession: () => getCurrentSessionMock(),
}));

vi.mock("@/modules/auth/specialistSignupRollout", () => ({
  getSpecialistSignupEnabled: () => getSpecialistSignupEnabledMock(),
}));

import { POST } from "./route";

describe("POST /api/auth/specialist-signup/confirm", () => {
  beforeEach(() => {
    confirmEmailChallengeMock.mockReset();
    provisionSpecialistOwnerMock.mockReset();
    getSpecialistSignupIntentByChallengeIdMock.mockReset();
    findUserIdByEmailChallengeIdMock.mockReset();
    findByUserIdMock.mockReset();
    setSessionFromUserMock.mockReset();
    getCurrentSessionMock.mockReset();
    ensureProfileMock.mockReset();
    ensureProfileMock.mockResolvedValue({ enrolled: false });
    getSpecialistSignupEnabledMock.mockReset();
    getSpecialistSignupEnabledMock.mockResolvedValue(true);
  });

  it("returns disabled before email challenge verification or provisioning", async () => {
    getSpecialistSignupEnabledMock.mockResolvedValueOnce(false);

    const res = await POST(
      new Request("http://localhost/api/auth/specialist-signup/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: "22222222-2222-4222-8222-222222222222",
          code: "123456",
        }),
      }),
    );

    expect(res.status).toBe(423);
    expect(findUserIdByEmailChallengeIdMock).not.toHaveBeenCalled();
    expect(confirmEmailChallengeMock).not.toHaveBeenCalled();
    expect(provisionSpecialistOwnerMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ ok: false, error: "specialist_signup_disabled" });
  });

  it("verifies email, provisions specialist owner workspace, and starts doctor session", async () => {
    findUserIdByEmailChallengeIdMock.mockResolvedValueOnce("11111111-1111-4111-8111-111111111111");
    confirmEmailChallengeMock.mockResolvedValueOnce({ ok: true });
    provisionSpecialistOwnerMock.mockResolvedValueOnce({
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      specialistId: null,
      membershipId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    findByUserIdMock.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      role: "client",
      displayName: "Doctor Owner",
      bindings: {},
    });

    const res = await POST(
      new Request("http://localhost/api/auth/specialist-signup/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: "22222222-2222-4222-8222-222222222222",
          code: "123456",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(provisionSpecialistOwnerMock).toHaveBeenCalledWith({
      challengeId: "22222222-2222-4222-8222-222222222222",
    });
    expect(setSessionFromUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "11111111-1111-4111-8111-111111111111",
        role: "doctor",
      }),
      { staffSecurity: { assurance: "pending_enrollment" } },
    );
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      redirectTo: "/app/account?tab=security",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      specialistId: null,
    });
  });

  it("does not provision when the email code is invalid", async () => {
    findUserIdByEmailChallengeIdMock.mockResolvedValueOnce("11111111-1111-4111-8111-111111111111");
    confirmEmailChallengeMock.mockResolvedValueOnce({ ok: false, code: "invalid_code" });

    const res = await POST(
      new Request("http://localhost/api/auth/specialist-signup/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: "22222222-2222-4222-8222-222222222222",
          code: "000000",
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(provisionSpecialistOwnerMock).not.toHaveBeenCalled();
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
  });

  it("fails closed after email verification when protected staff setup is temporarily unavailable", async () => {
    findUserIdByEmailChallengeIdMock.mockResolvedValueOnce("11111111-1111-4111-8111-111111111111");
    confirmEmailChallengeMock.mockResolvedValueOnce({ ok: true });
    ensureProfileMock.mockRejectedValueOnce(new Error("database_unavailable"));

    const res = await POST(
      new Request("http://localhost/api/auth/specialist-signup/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: "22222222-2222-4222-8222-222222222222",
          code: "123456",
        }),
      }),
    );

    expect(res.status).toBe(503);
    expect(provisionSpecialistOwnerMock).not.toHaveBeenCalled();
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toMatchObject({ ok: false, error: "security_setup_pending" });
  });

  it("can retry provisioning after a successful email confirm consumed the challenge row", async () => {
    findUserIdByEmailChallengeIdMock.mockResolvedValueOnce(null);
    getSpecialistSignupIntentByChallengeIdMock.mockResolvedValueOnce({
      id: "intent-1",
      userId: "11111111-1111-4111-8111-111111111111",
      challengeId: "22222222-2222-4222-8222-222222222222",
      emailNormalized: "doctor@example.com",
      organizationTitle: "Clinic One",
      specialistFullName: "Doctor Owner",
      status: "pending",
      provisionedOrganizationId: null,
      provisionedSpecialistId: null,
      provisionedMembershipId: null,
    });
    getCurrentSessionMock.mockResolvedValueOnce({
      user: { userId: "11111111-1111-4111-8111-111111111111", role: "doctor" },
      staffSecurity: { assurance: "pending_enrollment" },
    });
    provisionSpecialistOwnerMock.mockResolvedValueOnce({
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      specialistId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      membershipId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    findByUserIdMock.mockResolvedValue({
      userId: "11111111-1111-4111-8111-111111111111",
      role: "doctor",
      displayName: "Doctor Owner",
      bindings: {},
    });

    const res = await POST(
      new Request("http://localhost/api/auth/specialist-signup/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: "22222222-2222-4222-8222-222222222222",
          code: "123456",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(confirmEmailChallengeMock).not.toHaveBeenCalled();
    expect(provisionSpecialistOwnerMock).toHaveBeenCalledWith({
      challengeId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("maps retry provisioning before verified email to expired_code without direct user email read", async () => {
    findUserIdByEmailChallengeIdMock.mockResolvedValueOnce(null);
    getSpecialistSignupIntentByChallengeIdMock.mockResolvedValueOnce({
      id: "intent-1",
      userId: "11111111-1111-4111-8111-111111111111",
      challengeId: "22222222-2222-4222-8222-222222222222",
      emailNormalized: "doctor@example.com",
      organizationTitle: "Clinic One",
      specialistFullName: "Doctor Owner",
      status: "pending",
      provisionedOrganizationId: null,
      provisionedSpecialistId: null,
      provisionedMembershipId: null,
    });
    getCurrentSessionMock.mockResolvedValueOnce({
      user: { userId: "11111111-1111-4111-8111-111111111111", role: "doctor" },
      staffSecurity: { assurance: "pending_enrollment" },
    });
    provisionSpecialistOwnerMock.mockRejectedValueOnce(new Error("specialist_signup_user_not_verified"));

    const res = await POST(
      new Request("http://localhost/api/auth/specialist-signup/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: "22222222-2222-4222-8222-222222222222",
          code: "123456",
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(confirmEmailChallengeMock).not.toHaveBeenCalled();
    expect(findByUserIdMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ ok: false, error: "expired_code" });
  });
});
