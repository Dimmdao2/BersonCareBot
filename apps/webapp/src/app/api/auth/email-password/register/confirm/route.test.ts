import { describe, expect, it, vi, beforeEach } from "vitest";

const recordAuthRegistrationSuccessMock = vi.fn(async () => undefined);
const recordAuthRegistrationFailureMock = vi.fn(async () => undefined);
const confirmEmailChallengeMock = vi.fn();
const setSessionFromUserMock = vi.fn();

vi.mock("@/app-layer/product-analytics/recordAuthRegistration", () => ({
  recordAuthRegistrationSuccess: (...args: unknown[]) => recordAuthRegistrationSuccessMock(...args),
  recordAuthRegistrationFailure: (...args: unknown[]) => recordAuthRegistrationFailureMock(...args),
}));

vi.mock("@/modules/auth/emailAuth", () => ({
  confirmEmailChallenge: (...args: unknown[]) => confirmEmailChallengeMock(...args),
}));

vi.mock("@/modules/auth/service", () => ({
  setSessionFromUser: (...args: unknown[]) => setSessionFromUserMock(...args),
}));

vi.mock("@/modules/auth/envRole", () => ({
  resolveRoleFromEnv: () => "client",
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    userPasswordCredentials: {
      findUserIdByEmailChallengeId: vi.fn(async () => "11111111-1111-1111-1111-111111111111"),
    },
    userProjection: {
      getProfileEmailFields: vi.fn(async () => ({ email: "user@example.com", emailVerifiedAt: null })),
      updateRole: vi.fn(async () => undefined),
    },
    userByPhone: {
      findByUserId: vi.fn(async () => ({
        userId: "11111111-1111-1111-1111-111111111111",
        role: "client",
        displayName: "User",
        bindings: {},
      })),
    },
  }),
}));

import { POST } from "./route";

describe("POST /api/auth/email-password/register/confirm", () => {
  beforeEach(() => {
    recordAuthRegistrationSuccessMock.mockReset();
    recordAuthRegistrationFailureMock.mockReset();
    confirmEmailChallengeMock.mockReset();
    setSessionFromUserMock.mockReset();
  });

  it("records registration success after session is set", async () => {
    confirmEmailChallengeMock.mockResolvedValueOnce({ ok: true });
    setSessionFromUserMock.mockResolvedValueOnce(undefined);

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/register/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: "22222222-2222-2222-2222-222222222222",
          code: "123456",
          attemptId: "33333333-3333-3333-3333-333333333333",
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(recordAuthRegistrationSuccessMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "confirm",
        attemptId: "33333333-3333-3333-3333-333333333333",
        isNewAccount: true,
      }),
    );
  });

  it("records registration failure on invalid code", async () => {
    confirmEmailChallengeMock.mockResolvedValueOnce({ ok: false, code: "invalid_code" });

    const res = await POST(
      new Request("http://localhost/api/auth/email-password/register/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: "22222222-2222-2222-2222-222222222222",
          code: "000000",
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect(recordAuthRegistrationFailureMock).toHaveBeenCalledWith(
      expect.objectContaining({ errorCode: "invalid_code", stage: "confirm" }),
    );
  });
});
