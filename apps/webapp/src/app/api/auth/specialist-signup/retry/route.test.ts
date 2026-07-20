import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentSessionMock = vi.fn();
const getLatestIntentMock = vi.fn();
const provisionOwnerMock = vi.fn();

vi.mock("@/modules/auth/service", () => ({
  getCurrentSession: () => getCurrentSessionMock(),
}));

vi.mock("@/app-layer/di/buildAppDeps", () => ({
  buildAppDeps: () => ({
    organizationProvisioning: {
      getLatestSpecialistSignupIntentForUser: getLatestIntentMock,
      provisionSpecialistOwner: provisionOwnerMock,
    },
  }),
}));

import { POST } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";

describe("POST /api/auth/specialist-signup/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a doctor session that has no protected signup assurance", async () => {
    getCurrentSessionMock.mockResolvedValue({ user: { userId, role: "doctor" } });

    const response = await POST();
    expect(response.status).toBe(403);
    expect(getLatestIntentMock).not.toHaveBeenCalled();
    expect(provisionOwnerMock).not.toHaveBeenCalled();
  });

  it("retries only the authenticated user's latest intent from a restricted enrollment session", async () => {
    getCurrentSessionMock.mockResolvedValue({
      user: { userId, role: "doctor" },
      staffSecurity: { assurance: "pending_enrollment" },
    });
    getLatestIntentMock.mockResolvedValue({
      userId,
      challengeId: "22222222-2222-4222-8222-222222222222",
    });
    provisionOwnerMock.mockResolvedValue({
      organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    });

    const response = await POST();
    expect(response.status).toBe(200);
    expect(getLatestIntentMock).toHaveBeenCalledWith();
    expect(provisionOwnerMock).toHaveBeenCalledWith({
      userId,
      challengeId: "22222222-2222-4222-8222-222222222222",
    });
  });
});
