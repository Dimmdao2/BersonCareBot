import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmEmailChallengeMock = vi.fn();
const provisionSpecialistOwnerMock = vi.fn();
const replacePendingSpecialistSignupChallengeMock = vi.fn();
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
      replacePendingSpecialistSignupChallenge: replacePendingSpecialistSignupChallengeMock,
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

const checkAuthConfirmRateLimitMock = vi.hoisted(() => vi.fn());
vi.mock("@/modules/auth/authConfirmRateLimit", () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 600,
  checkAuthConfirmRateLimit: (...args: unknown[]) => checkAuthConfirmRateLimitMock(...args),
}));

import { POST } from "./route";
import * as authChannelPolicy from "@/modules/auth/authChannelPolicy";

describe("POST /api/auth/specialist-signup/confirm", () => {
  beforeEach(() => {
    confirmEmailChallengeMock.mockReset();
    provisionSpecialistOwnerMock.mockReset();
    replacePendingSpecialistSignupChallengeMock.mockReset();
    getSpecialistSignupIntentByChallengeIdMock.mockReset();
    getSpecialistSignupIntentByChallengeIdMock.mockResolvedValue({
      id: "intent-1",
      userId: "11111111-1111-4111-8111-111111111111",
      challengeId: "22222222-2222-4222-8222-222222222222",
      emailNormalized: "doctor@example.com",
      organizationTitle: "Clinic One",
      organizationSlug: "clinic-one",
      specialistFullName: "Doctor Owner",
      status: "pending",
      provisionedOrganizationId: null,
      provisionedSpecialistId: null,
      provisionedMembershipId: null,
    });
    findUserIdByEmailChallengeIdMock.mockReset();
    findByUserIdMock.mockReset();
    setSessionFromUserMock.mockReset();
    getCurrentSessionMock.mockReset();
    ensureProfileMock.mockReset();
    ensureProfileMock.mockResolvedValue({ enrolled: false });
    getSpecialistSignupEnabledMock.mockReset();
    getSpecialistSignupEnabledMock.mockResolvedValue(true);
    checkAuthConfirmRateLimitMock.mockReset();
    checkAuthConfirmRateLimitMock.mockResolvedValue({ limited: false });
  });

  it("returns 429 rate_limited (same shape as too_many_attempts) when the per-IP limit trips, before checking rollout or the challenge", async () => {
    checkAuthConfirmRateLimitMock.mockResolvedValueOnce({ limited: true, reason: "rate_limited" });
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
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("600");
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: 600,
    });
    expect(getSpecialistSignupEnabledMock).not.toHaveBeenCalled();
    expect(confirmEmailChallengeMock).not.toHaveBeenCalled();
  });

  it("returns 503 proxy_configuration when the per-IP key cannot be resolved", async () => {
    checkAuthConfirmRateLimitMock.mockResolvedValueOnce({ limited: true, reason: "proxy_configuration" });
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
    await expect(res.json()).resolves.toEqual({ ok: false, error: "proxy_configuration" });
    expect(confirmEmailChallengeMock).not.toHaveBeenCalled();
  });

  it("rejects a disabled email channel before challenge lookup or provisioning", async () => {
    const policy = vi.spyOn(authChannelPolicy, "isAuthChannelEnabled").mockResolvedValue(false);
    try {
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
      await expect(res.json()).resolves.toEqual({ ok: false, error: "auth_channel_disabled" });
      expect(getSpecialistSignupEnabledMock).not.toHaveBeenCalled();
      expect(findUserIdByEmailChallengeIdMock).not.toHaveBeenCalled();
      expect(confirmEmailChallengeMock).not.toHaveBeenCalled();
      expect(provisionSpecialistOwnerMock).not.toHaveBeenCalled();
    } finally {
      policy.mockRestore();
    }
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
      specialistId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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
    // Changed because successful provisioning now returns the specialist created atomically for the owner.
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      redirectTo: "/app/account?tab=security",
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      specialistId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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

  it("asks a pre-cutover NULL-slug intent for an address before consuming its email code", async () => {
    findUserIdByEmailChallengeIdMock.mockResolvedValueOnce("11111111-1111-4111-8111-111111111111");
    getSpecialistSignupIntentByChallengeIdMock.mockResolvedValueOnce({
      id: "intent-before-slug-cutover",
      userId: "11111111-1111-4111-8111-111111111111",
      challengeId: "22222222-2222-4222-8222-222222222222",
      emailNormalized: "doctor@example.com",
      organizationTitle: "Clinic Before Cutover",
      organizationSlug: null,
      specialistFullName: "Doctor Owner",
      status: "pending",
      provisionedOrganizationId: null,
      provisionedSpecialistId: null,
      provisionedMembershipId: null,
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

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      ok: false,
      error: "organization_slug_required",
      message: "Выберите публичный адрес клиники и повторите подтверждение. Код ещё действует.",
    });
    expect(confirmEmailChallengeMock).not.toHaveBeenCalled();
    expect(replacePendingSpecialistSignupChallengeMock).not.toHaveBeenCalled();
    expect(provisionSpecialistOwnerMock).not.toHaveBeenCalled();
  });

  it("reserves a supplied address for a pre-cutover NULL-slug intent and finishes signup", async () => {
    findUserIdByEmailChallengeIdMock.mockResolvedValueOnce("11111111-1111-4111-8111-111111111111");
    getSpecialistSignupIntentByChallengeIdMock.mockResolvedValueOnce({
      id: "intent-before-slug-cutover",
      userId: "11111111-1111-4111-8111-111111111111",
      challengeId: "22222222-2222-4222-8222-222222222222",
      emailNormalized: "doctor@example.com",
      organizationTitle: "Clinic Before Cutover",
      organizationSlug: null,
      specialistFullName: "Doctor Owner",
      status: "pending",
      provisionedOrganizationId: null,
      provisionedSpecialistId: null,
      provisionedMembershipId: null,
    });
    replacePendingSpecialistSignupChallengeMock.mockResolvedValueOnce(true);
    confirmEmailChallengeMock.mockResolvedValueOnce({ ok: true });
    provisionSpecialistOwnerMock.mockResolvedValueOnce({
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      specialistId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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
          organizationSlug: "clinic-before-cutover",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(replacePendingSpecialistSignupChallengeMock).toHaveBeenCalledWith({
      challengeId: "22222222-2222-4222-8222-222222222222",
      organizationSlug: "clinic-before-cutover",
    });
    expect(confirmEmailChallengeMock).toHaveBeenCalledTimes(1);
    expect(provisionSpecialistOwnerMock).toHaveBeenCalledWith({
      challengeId: "22222222-2222-4222-8222-222222222222",
    });
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
