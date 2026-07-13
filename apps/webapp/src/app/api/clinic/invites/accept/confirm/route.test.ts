import { beforeEach, describe, expect, it, vi } from "vitest";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const confirmPublicEmailOtpChallengeMock = vi.hoisted(() => vi.fn());
const setSessionFromUserMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/modules/auth/emailOtpPublic", () => ({
  confirmPublicEmailOtpChallenge: (...args: unknown[]) => confirmPublicEmailOtpChallengeMock(...args),
}));

vi.mock("@/modules/auth/service", () => ({
  setSessionFromUser: (...args: unknown[]) => setSessionFromUserMock(...args),
}));

import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/clinic/invites/accept/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("clinic invite accept confirm route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const acceptInvite = vi.fn().mockResolvedValue({
      ok: true,
      organizationId: "ed63b540-3fb6-499d-897c-f52227ea5dd8",
      membershipId: "33333333-3333-4333-8333-333333333333",
      platformUserId: "11111111-1111-4111-8111-111111111111",
      specialistId: null,
      role: "admin",
    });
    buildAppDepsMock.mockReturnValue({
      organizationInvites: {
        lookupPendingByToken: vi.fn().mockResolvedValue({
          ok: true,
          invite: {
            invitedEmail: "admin-r1@example.com",
            invitedRole: "admin",
            organizationTitle: "Clinic",
          },
        }),
        acceptInvite,
      },
      emailOtpPublicDb: {},
      userByPhone: {
        findByUserId: vi.fn().mockResolvedValue({
          userId: "11111111-1111-4111-8111-111111111111",
          role: "client",
          displayName: "Clinic Admin",
          bindings: {},
        }),
      },
    });
    confirmPublicEmailOtpChallengeMock.mockResolvedValue({
      ok: true,
      userId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("verifies OTP for the invite email and starts a doctor-surface session for clinic admin", async () => {
    const res = await POST(
      makeRequest({
        token: "invite-token-with-length",
        code: "123456",
      }),
    );

    expect(res.status).toBe(200);
    expect(confirmPublicEmailOtpChallengeMock).toHaveBeenCalledWith(
      "admin-r1@example.com",
      "123456",
      {},
    );
    const deps = buildAppDepsMock.mock.results[0]?.value;
    expect(deps.organizationInvites.acceptInvite).toHaveBeenCalledWith({
      token: "invite-token-with-length",
      platformUserId: "11111111-1111-4111-8111-111111111111",
      expectedEmail: "admin-r1@example.com",
    });
    expect(setSessionFromUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "11111111-1111-4111-8111-111111111111",
        role: "doctor",
      }),
    );
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      redirectTo: "/app/doctor",
      invitedRole: "admin",
      specialistId: null,
    });
  });

  it("rejects email mismatch before OTP verification", async () => {
    const res = await POST(
      makeRequest({
        token: "invite-token-with-length",
        email: "other@example.com",
        code: "123456",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "email_mismatch" });
    expect(confirmPublicEmailOtpChallengeMock).not.toHaveBeenCalled();
    expect(setSessionFromUserMock).not.toHaveBeenCalled();
  });
});
