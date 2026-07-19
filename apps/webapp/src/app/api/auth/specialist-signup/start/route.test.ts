import { beforeEach, describe, expect, it, vi } from "vitest";

const registerPendingSpecialistVerificationMock = vi.fn();
const deleteUnverifiedEmailPasswordRegistrationMock = vi.fn();
const createSpecialistSignupIntentMock = vi.fn();
const startEmailChallengeMock = vi.fn();
const getSpecialistSignupEnabledMock = vi.fn();

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userPasswordCredentials: {
      registerPendingSpecialistVerification: registerPendingSpecialistVerificationMock,
      deleteUnverifiedEmailPasswordRegistration: deleteUnverifiedEmailPasswordRegistrationMock,
    },
    organizationProvisioning: {
      createSpecialistSignupIntent: createSpecialistSignupIntentMock,
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

describe("POST /api/auth/specialist-signup/start", () => {
  beforeEach(() => {
    registerPendingSpecialistVerificationMock.mockReset();
    deleteUnverifiedEmailPasswordRegistrationMock.mockReset();
    createSpecialistSignupIntentMock.mockReset();
    startEmailChallengeMock.mockReset();
    getSpecialistSignupEnabledMock.mockReset();
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
    registerPendingSpecialistVerificationMock.mockResolvedValueOnce({ ok: true, userId: "user-1" });
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
      userId: "user-1",
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
    registerPendingSpecialistVerificationMock.mockResolvedValueOnce({ ok: true, userId: "user-1" });
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
    expect(deleteUnverifiedEmailPasswordRegistrationMock).toHaveBeenCalledWith("user-1");
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
