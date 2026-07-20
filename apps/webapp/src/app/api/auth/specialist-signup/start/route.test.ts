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
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(replacePendingSpecialistSignupChallengeMock).toHaveBeenCalledWith({
      challengeId: "33333333-3333-4333-8333-333333333333",
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
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(registerPendingSpecialistVerificationMock).not.toHaveBeenCalled();
  });
});
