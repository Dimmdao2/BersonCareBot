import { beforeEach, describe, expect, it, vi } from "vitest";

const registerPendingSpecialistVerificationMock = vi.fn();
const deleteUnverifiedEmailPasswordRegistrationMock = vi.fn();
const createSpecialistSignupIntentMock = vi.fn();
const startEmailChallengeMock = vi.fn();
const getSpecialistSignupEnabledMock = vi.fn();
const tryResendRegistrationChallengeMock = vi.fn();
const replacePendingSpecialistSignupChallengeMock = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userPasswordCredentials: {
      registerPendingSpecialistVerification: registerPendingSpecialistVerificationMock,
      deleteUnverifiedEmailPasswordRegistration: deleteUnverifiedEmailPasswordRegistrationMock,
      tryResendRegistrationChallenge: tryResendRegistrationChallengeMock,
    },
    organizationProvisioning: {
      createSpecialistSignupIntent: createSpecialistSignupIntentMock,
      replacePendingSpecialistSignupChallenge: replacePendingSpecialistSignupChallengeMock,
    },
  }),
}));

vi.mock("@/modules/auth/pinHash", () => ({
  hashPin: async (password: string) => `hashed:${password}`,
}));

vi.mock("@/modules/auth/specialistSignupRollout", () => ({
  getSpecialistSignupEnabled: () => getSpecialistSignupEnabledMock(),
}));

vi.mock("@/modules/auth/emailAuth", async () => {
  const actual = await vi.importActual<typeof import("@/modules/auth/emailAuth")>("@/modules/auth/emailAuth");
  return {
    ...actual,
    startEmailChallenge: (...args: unknown[]) => startEmailChallengeMock(...args),
  };
});

import { POST } from "./route";
import * as authChannelPolicy from "@/modules/auth/authChannelPolicy";

const SELF_ID = "11111111-1111-4111-8111-111111111111";

describe("POST /api/auth/specialist-signup/start", () => {
  beforeEach(() => {
    registerPendingSpecialistVerificationMock.mockReset();
    deleteUnverifiedEmailPasswordRegistrationMock.mockReset();
    createSpecialistSignupIntentMock.mockReset();
    startEmailChallengeMock.mockReset();
    getSpecialistSignupEnabledMock.mockReset();
    tryResendRegistrationChallengeMock.mockReset();
    replacePendingSpecialistSignupChallengeMock.mockReset();
    tryResendRegistrationChallengeMock.mockResolvedValue({ ok: false, reason: "duplicate_email" });
    getSpecialistSignupEnabledMock.mockResolvedValue(true);
  });

  it("rejects a disabled email channel before signup rollout or pending-user work", async () => {
    const policy = vi.spyOn(authChannelPolicy, "isAuthChannelEnabled").mockResolvedValue(false);
    try {
      const res = await POST(
        new Request("http://localhost/api/auth/specialist-signup/start", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "doctor@example.com",
            password: "password12",
            lastName: "Doctor",
            firstName: "Owner",
            organizationTitle: "Clinic One",
            organizationSlug: "clinic-one",
          }),
        }),
      );

      expect(res.status).toBe(503);
      await expect(res.json()).resolves.toEqual({ ok: false, error: "auth_channel_disabled" });
      expect(getSpecialistSignupEnabledMock).not.toHaveBeenCalled();
      expect(registerPendingSpecialistVerificationMock).not.toHaveBeenCalled();
      expect(startEmailChallengeMock).not.toHaveBeenCalled();
      expect(createSpecialistSignupIntentMock).not.toHaveBeenCalled();
    } finally {
      policy.mockRestore();
    }
  });

  it("returns disabled before creating any pending user or challenge", async () => {
    getSpecialistSignupEnabledMock.mockResolvedValueOnce(false);

    const res = await POST(
      new Request("http://localhost/api/auth/specialist-signup/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "doctor@example.com",
          password: "password12",
          lastName: "Doctor",
          firstName: "Owner",
          organizationTitle: "Clinic One",
          organizationSlug: "clinic-one",
        }),
      }),
    );

    expect(res.status).toBe(423);
    expect(registerPendingSpecialistVerificationMock).not.toHaveBeenCalled();
    expect(startEmailChallengeMock).not.toHaveBeenCalled();
    expect(createSpecialistSignupIntentMock).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({ ok: false, error: "specialist_signup_disabled" });
  });

  it("creates pending specialist registration, email challenge, and signup intent", async () => {
    registerPendingSpecialistVerificationMock.mockResolvedValueOnce({ ok: true, userId: SELF_ID });
    startEmailChallengeMock.mockResolvedValueOnce({
      ok: true,
      challengeId: "22222222-2222-4222-8222-222222222222",
      retryAfterSeconds: 60,
    });
    createSpecialistSignupIntentMock.mockResolvedValueOnce(undefined);

    const res = await POST(
      new Request("http://localhost/api/auth/specialist-signup/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "Doctor@Example.COM",
          password: "password12",
          lastName: " Doctor ",
          firstName: " owner ",
          patronymic: "  Ivanovich ",
          organizationTitle: "Clinic One",
          organizationSlug: "Clinic One",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(registerPendingSpecialistVerificationMock).toHaveBeenCalledWith({
      emailNormalized: "doctor@example.com",
      passwordHash: "hashed:password12",
      lastName: "Doctor",
      firstName: "Owner",
      patronymic: "Ivanovich",
    });
    expect(createSpecialistSignupIntentMock).toHaveBeenCalledWith({
      challengeId: "22222222-2222-4222-8222-222222222222",
      emailNormalized: "doctor@example.com",
      organizationTitle: "Clinic One",
      organizationSlug: "clinic-one",
      specialistFullName: "Doctor Owner Ivanovich",
    });
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      challengeId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("rolls back the pending user when challenge send fails", async () => {
    registerPendingSpecialistVerificationMock.mockResolvedValueOnce({ ok: true, userId: SELF_ID });
    startEmailChallengeMock.mockResolvedValueOnce({ ok: false, code: "email_send_failed" });

    const res = await POST(
      new Request("http://localhost/api/auth/specialist-signup/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "doctor@example.com",
          password: "password12",
          lastName: "Doctor",
          firstName: "Owner",
          organizationTitle: "Clinic One",
          organizationSlug: "clinic-one",
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(deleteUnverifiedEmailPasswordRegistrationMock).toHaveBeenCalledWith(SELF_ID);
    expect(createSpecialistSignupIntentMock).not.toHaveBeenCalled();
  });

  it("keeps duplicate specialist email separate from patient registration flow", async () => {
    registerPendingSpecialistVerificationMock.mockResolvedValueOnce({
      ok: false,
      reason: "duplicate_email",
    });

    const res = await POST(
      new Request("http://localhost/api/auth/specialist-signup/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "doctor@example.com",
          password: "password12",
          lastName: "Doctor",
          firstName: "Owner",
          organizationTitle: "Clinic One",
          organizationSlug: "clinic-one",
        }),
      }),
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "duplicate_email" });
  });

  it("rotates the challenge for the same pending specialist instead of creating a second intent", async () => {
    registerPendingSpecialistVerificationMock.mockResolvedValueOnce({ ok: false, reason: "duplicate_email" });
    tryResendRegistrationChallengeMock.mockResolvedValueOnce({
      ok: true,
      userId: "11111111-1111-4111-8111-111111111111",
    });
    startEmailChallengeMock.mockResolvedValueOnce({
      ok: true,
      challengeId: "33333333-3333-4333-8333-333333333333",
      retryAfterSeconds: 60,
    });
    replacePendingSpecialistSignupChallengeMock.mockResolvedValueOnce(true);

    const res = await POST(
      new Request("http://localhost/api/auth/specialist-signup/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "doctor@example.com",
          password: "password12",
          lastName: "Doctor",
          firstName: "Owner",
          organizationTitle: "Clinic One",
          organizationSlug: "clinic-one",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(replacePendingSpecialistSignupChallengeMock).toHaveBeenCalledWith({
      challengeId: "33333333-3333-4333-8333-333333333333",
      organizationSlug: "clinic-one",
    });
    expect(createSpecialistSignupIntentMock).not.toHaveBeenCalled();
  });

  it.each([
    { lastName: "", firstName: "Owner" },
    { lastName: "Doctor", firstName: " " },
  ])("rejects a missing structured specialist name", async ({ lastName, firstName }) => {
    const res = await POST(
      new Request("http://localhost/api/auth/specialist-signup/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "doctor@example.com",
          password: "password12",
          lastName,
          firstName,
          organizationTitle: "Clinic One",
          organizationSlug: "clinic-one",
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(registerPendingSpecialistVerificationMock).not.toHaveBeenCalled();
  });

  it("refuses missing, invalid, and taken addresses with distinct errors before provisioning", async () => {
    const base = {
      email: "doctor@example.com",
      password: "password12",
      lastName: "Doctor",
      firstName: "Owner",
      organizationTitle: "Clinic One",
    };

    const missing = await POST(
      new Request("http://localhost/api/auth/specialist-signup/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(base),
      }),
    );
    expect(missing.status).toBe(400);
    await expect(missing.json()).resolves.toEqual({ ok: false, error: "invalid_body" });

    const invalid = await POST(
      new Request("http://localhost/api/auth/specialist-signup/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...base, organizationSlug: "клиника!" }),
      }),
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      ok: false,
      error: "slug_invalid_characters",
    });

    registerPendingSpecialistVerificationMock.mockResolvedValueOnce({ ok: true, userId: SELF_ID });
    startEmailChallengeMock.mockResolvedValueOnce({
      ok: true,
      challengeId: "44444444-4444-4444-8444-444444444444",
      retryAfterSeconds: 60,
    });
    createSpecialistSignupIntentMock.mockRejectedValueOnce(new Error("slug_unavailable"));
    const taken = await POST(
      new Request("http://localhost/api/auth/specialist-signup/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...base, organizationSlug: "taken-clinic" }),
      }),
    );
    expect(taken.status).toBe(409);
    await expect(taken.json()).resolves.toEqual({ ok: false, error: "slug_unavailable" });
    expect(deleteUnverifiedEmailPasswordRegistrationMock).toHaveBeenCalledWith(SELF_ID);
  });
});
