import { beforeEach, describe, expect, it, vi } from "vitest";

const buildAppDepsMock = vi.hoisted(() => vi.fn());
const startEmailChallengeMock = vi.hoisted(() => vi.fn());

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: buildAppDepsMock,
}));

vi.mock("@/modules/auth/emailAuth", async () => {
  const actual = await vi.importActual<typeof import("@/modules/auth/emailAuth")>("@/modules/auth/emailAuth");
  return {
    ...actual,
    startEmailChallenge: (...args: unknown[]) => startEmailChallengeMock(...args),
  };
});

import { POST } from "./route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/clinic/invites/accept/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("clinic invite accept start route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildAppDepsMock.mockReturnValue({
      organizationInvites: {
        lookupPendingByToken: vi.fn().mockResolvedValue({
          ok: true,
          invite: {
            invitedEmail: "newdoc-r1@example.com",
            invitedRole: "doctor",
            organizationTitle: "Clinic",
          },
        }),
      },
      emailOtpPublicDb: {
        findOrCreatePublicEmailUser: vi.fn().mockResolvedValue({
          userId: "11111111-1111-4111-8111-111111111111",
          wasCreated: true,
        }),
      },
    });
    startEmailChallengeMock.mockResolvedValue({
      ok: true,
      challengeId: "22222222-2222-4222-8222-222222222222",
      retryAfterSeconds: 60,
    });
  });

  it("sends OTP to the invite email, not a client-chosen email", async () => {
    const res = await POST(makeRequest({ token: "invite-token-with-length" }));

    expect(res.status).toBe(200);
    expect(startEmailChallengeMock).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "newdoc-r1@example.com",
    );
  });

  it("rejects an explicit email mismatch", async () => {
    const res = await POST(
      makeRequest({
        token: "invite-token-with-length",
        email: "attacker@example.com",
      }),
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ ok: false, error: "email_mismatch" });
    expect(startEmailChallengeMock).not.toHaveBeenCalled();
  });
});
